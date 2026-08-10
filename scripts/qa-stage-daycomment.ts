// scripts/qa-stage-daycomment.ts
//
// Stages the day-comment-on-a-live-gauge QA walkthrough. It creates a fresh
// group ("[QA] Day Comment") with four seeded members and one LIVE beers
// gauge a couple of days out at 19:00, with a single IN vote from a
// non-founder member. That is deliberately short of the would-have-cleared
// retry bar (IN + NOT_THAT_DAY >= 3, at least one NOT_THAT_DAY): the walkthrough
// itself is what carries the gauge the rest of the way there, through the
// real product surfaces rather than more seeded rows.
//
// What this script seeds and what the walkthrough is expected to add, in
// order:
//   1. (seeded) One IN vote from a non-founder member.
//   2. (seeded) One NOT_THAT_DAY vote from a second non-founder member — the
//      "can't that day" chip tap, done here as a direct row rather than a
//      real chip tap, because exercising the chip UI itself is already
//      covered by RsvpControls/GaugeChips' own component tests. This script
//      exists to exercise the day-comment path, not to re-prove the chip.
//   3. (live, in the browser) A THIRD member — a fresh join, since the
//      walkthrough session cannot become one of the seeded identities —
//      posts "Sunday works better" as a day comment. recordDayComment
//      records their vote as NOT_THAT_DAY too (they hold no prior vote), which
//      is what carries the gauge from 1 IN + 1 NOT_THAT_DAY (short of the bar)
//      to 1 IN + 2 NOT_THAT_DAY (would have cleared, day-blocked).
//
// After step 3, the gauge is exactly the wrong-day-retry "would have cleared"
// shape, with a remembered Sunday suggestion on top of it. Running --close
// then exercises the day-comment slice's actual new behavior: the endgame
// revives on the remembered day instead of asking the group what day works.
//
// SECOND MODE, for reading back what the browser produced:
//
//   npx tsx --env-file=.env scripts/qa-stage-daycomment.ts --verify <groupId>
//
// Prints the target gauge's stored suggestion fields (day, time, who, which
// message) and the newest gauge in the group in plain English (activity,
// proposed day, proposed time, seeded voters, whether sourceMessageId is set,
// whether retryGuessOfGaugeId is set), mirroring qa-stage-answer.ts --verify.
//
// THIRD MODE, for exercising the revival without waiting two days:
//
//   npx tsx --env-file=.env scripts/qa-stage-daycomment.ts --close <groupId>
//
// Runs the REAL endgame sweep (scoped to that group only, never unscoped —
// see the file-header warning in src/lib/orbit/__tests__/endgame.test.ts for
// why an unscoped sweep is dangerous in a shared database) against a clock
// set just past the beers gauge's close time, and prints the sweep's results.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script also refuses to run itself unless all three
// env sources agree on the dev-test project ref (see requireDevTest below),
// the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-answer.ts and
// scripts/qa-stage-retry.ts. It is not named *.test.ts, which is what keeps
// Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-daycomment.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import {
  buildGaugeMessage,
  gaugeClosesAt,
  weekdayLongName,
} from "../src/lib/orbit/spark-copy"
import { formatMonthDay, formatWeekdayLong, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Los_Angeles"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. This script writes real rows to a shared database and has no way
 * to know which project `.env` points at other than asking, so it asks
 * before doing anything else.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/**
 * Reads back the state a browser walkthrough should have produced: the
 * target gauge's remembered suggestion, and the newest gauge in the group
 * (the original beers gauge before --close, the revival after it).
 */
async function verify(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true } } },
  })
  if (!group) throw new Error(`no group ${groupId}`)

  const gauges = await prisma.gauge.findMany({
    where: { groupId },
    include: { votes: true, suggestedMessage: { select: { body: true } } },
    orderBy: { createdAt: "desc" },
  })
  if (gauges.length === 0) throw new Error(`group ${groupId} has no gauges`)

  const nameById = new Map(group.memberships.map((m) => [m.userId, m.user.name]))
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? "(non-member)" : null)

  const target = gauges.find((g) => g.suggestedDayOfWeek !== null) ?? null
  if (!target) {
    console.log(
      "No suggestion recorded yet. Post the day comment (e.g. \"Sunday works better\") first, then re-run --verify."
    )
  } else {
    console.log(
      `Target gauge suggestion: ${weekdayLongName(target.suggestedDayOfWeek!)} · ` +
        `time ${target.suggestedTime ?? "(none stated, carries the original)"} · ` +
        `named by ${nameOf(target.suggestedByUserId) ?? "(unknown)"} · ` +
        `message: "${target.suggestedMessage?.body ?? "(missing)"}"`
    )
  }

  const newest = gauges[0]
  const seeded = newest.votes
    .filter((v) => v.answer === GaugeAnswer.IN)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((v) => nameOf(v.userId) ?? "(non-member)")

  console.log(
    `Newest gauge: ${newest.activity} · ` +
      `${formatWeekdayShort(newest.proposedDate, TZ)} ${formatMonthDay(newest.proposedDate, TZ)} · ` +
      `${newest.proposedTime ?? "(none)"} · ` +
      `seeded voters: ${seeded.length > 0 ? seeded.join(", ") : "nobody"} · ` +
      `sourceMessageId: ${newest.sourceMessageId ? "set" : "null"} · ` +
      `retryGuessOfGaugeId: ${newest.retryGuessOfGaugeId ? "set" : "null"}`
  )
}

/**
 * Runs the real endgame sweep, scoped to this group only, against a clock set
 * just past the target gauge's close time. Never call runGaugeEndgame without
 * { groupId } — see the file header above and the warning in
 * src/lib/orbit/__tests__/endgame.test.ts.
 */
async function closeNow(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { timeZone: true } })
  if (!group) throw new Error(`no group ${groupId}`)

  const target = await prisma.gauge.findFirst({
    where: { groupId, retryGuessOfGaugeId: null, retryAskMessageId: null, closureMessageId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, proposedDate: true, proposedTime: true, createdAt: true },
  })
  if (!target) {
    throw new Error(
      `group ${groupId} has no open original gauge left to close (already closed, asked, or guessed?)`
    )
  }

  const closesAt = gaugeClosesAt(target.proposedDate, target.proposedTime, target.createdAt, group.timeZone)
  const clock = new Date(closesAt.getTime() + 5 * 60 * 1000)

  const sweep = await runGaugeEndgame(clock, { groupId })
  console.log(JSON.stringify({ groupId, sweptAtClock: clock.toISOString(), sweep }, null, 2))
}

async function main() {
  requireDevTest()

  const verifyAt = process.argv.indexOf("--verify")
  if (verifyAt !== -1) {
    const id = process.argv[verifyAt + 1]
    if (!id) throw new Error("--verify needs a group id")
    await verify(id)
    await prisma.$disconnect()
    return
  }

  const closeAt = process.argv.indexOf("--close")
  if (closeAt !== -1) {
    const id = process.argv[closeAt + 1]
    if (!id) throw new Error("--close needs a group id")
    await closeNow(id)
    await prisma.$disconnect()
    return
  }

  const now = new Date()
  const p = getLocalParts(now, TZ)
  const twoDaysOut = zonedWallTimeToUtc(p.year, p.month, p.day + 2, 0, 0, TZ)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  const stamp = Date.now()
  const founder = await prisma.user.create({ data: { name: "Nina", supabaseAuthId: `qa-daycomment-founder-${stamp}` } })
  const theo = await prisma.user.create({ data: { name: "Theo", supabaseAuthId: `qa-daycomment-theo-${stamp}` } })
  const ravi = await prisma.user.create({ data: { name: "Ravi", supabaseAuthId: `qa-daycomment-ravi-${stamp}` } })
  const elle = await prisma.user.create({ data: { name: "Elle", supabaseAuthId: `qa-daycomment-elle-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "[QA] Day Comment",
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `qa-daycomment-${stamp}`,
      memberships: { create: [founder.id, theo.id, ravi.id, elle.id].map((userId) => ({ userId })) },
    },
  })

  // The proposed day is always "today + 2" so this script stays correct on
  // whatever date it is run. The spark message deliberately names no day of
  // its own (it would drift out of sync with whatever weekday that lands on),
  // and the suggested retry day is whichever of Sunday/Monday differs from
  // the proposed weekday, so "decision 10" (a same-day comment stays quiet)
  // can never accidentally fire here.
  const proposedWeekdayName = formatWeekdayLong(twoDaysOut, TZ)
  const suggestedDayName = proposedWeekdayName === "Sunday" ? "Monday" : "Sunday"

  // The idea that started it, backdated so the feed reads as recent history
  // rather than everything arriving in the same second.
  const floatedAt = daysAgo(1)
  const source = await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: theo.id,
      body: "beers this week?",
      createdAt: floatedAt,
    },
  })

  const body = buildGaugeMessage("beers", twoDaysOut, TZ, floatedAt, null)
  const created = await createGauge({
    groupId: group.id,
    sourceMessageId: source.id,
    activity: "beers",
    proposedDate: twoDaysOut,
    proposedTime: "19:00",
    body,
  })
  if (created.status !== "created") throw new Error("staging the live gauge did not create it")
  await prisma.gauge.update({ where: { id: created.gauge.id }, data: { createdAt: floatedAt } })
  await prisma.message.update({
    where: { id: created.gauge.orbitMessageId },
    data: { createdAt: new Date(floatedAt.getTime() + 1000) },
  })

  // One IN from a non-founder member (Ravi), one NOT_THAT_DAY from a second
  // non-founder member (Elle) — the seeded half of the would-have-cleared
  // bar. See the file header for why the second half comes from the live day
  // comment instead of a third seeded row.
  await prisma.gaugeVote.create({ data: { gaugeId: created.gauge.id, userId: ravi.id, answer: GaugeAnswer.IN } })
  await prisma.gaugeVote.create({
    data: { gaugeId: created.gauge.id, userId: elle.id, answer: GaugeAnswer.NOT_THAT_DAY },
  })

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        gaugeId: created.gauge.id,
        proposedDay: `${formatWeekdayShort(twoDaysOut, TZ)} ${formatMonthDay(twoDaysOut, TZ)}`,
        proposedTime: "19:00",
        seededVotes: { in: [ravi.name], notThatDay: [elle.name] },
        next: [
          `Join through inviteUrl (Nina, Theo, Ravi, and Elle are already seeded members; the browser session becomes a fresh fifth member).`,
          `Type "${suggestedDayName} works better" in the group feed and send it.`,
          `Watch for Orbit's one-line reply ("Got it, ${proposedWeekdayName} doesn't work for you. ${suggestedDayName}'s noted...") and the gauge's tally line picking up "2 want a different day".`,
          `Read it back: npx tsx --env-file=.env scripts/qa-stage-daycomment.ts --verify ${group.id}`,
          `Close it on demand: npx tsx --env-file=.env scripts/qa-stage-daycomment.ts --close ${group.id}`,
          `Reload the group home and confirm Orbit's revival message for ${suggestedDayName}, its chips, and the day-comment author already counted IN on the tally.`,
        ],
      },
      null,
      2
    )
  )
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
