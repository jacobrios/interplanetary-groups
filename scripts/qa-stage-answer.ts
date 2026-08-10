// scripts/qa-stage-answer.ts
//
// Stages the answer-seam QA walkthrough: a group whose feed ends on Orbit's
// own open question, so the next thing anyone types is a reply to it. It
// creates a fresh group ("Cedar Hill Climbers") with four seeded members and
// one day-blocked beers gauge sitting on yesterday's local day at 8pm, then
// runs the REAL endgame sweep (scoped to that group only) against a clock set
// just after that gauge's close time. The sweep is what posts the ask and
// attaches it, exactly as the hourly cron would; nothing about the ask is
// faked, the staging is the clock.
//
// What it leaves behind, ready to click: a closed beers gauge with two yeses
// and one can't-that-day (three people who want it, the would-have-cleared
// bar), and Orbit's close-and-ask as the newest message in the feed:
//
//   "Beers didn't happen for [weekday], but three of you want it.
//    What day works better?"
//
// The guess is deliberately NOT staged. The one guess fires the evening after
// the failed day and would close the ask's window the moment it posted, so
// staging it would remove the very thing this walkthrough is here to test. The
// suppression half of the retry story is already covered by
// scripts/qa-stage-retry.ts.
//
// SECOND MODE, for reading back what the browser produced:
//
//   npx tsx --env-file=.env scripts/qa-stage-answer.ts --verify <groupId>
//
// Prints the group's newest gauge in plain English (activity, proposed day,
// proposed time and whether that time was carried from the failed gauge or
// stated fresh, and who is seeded in), so the walkthrough's claim about the
// carried 8pm and the namer's seed is read out of the database rather than
// eyeballed off the card.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script has no idea which project it is talking to and
// will happily write to production if that is what `.env` says.
//
// This is QA tooling, deliberately outside the test suite: it writes real rows
// to a shared database and is meant to be run by hand before a browser
// walkthrough. Same precedent as scripts/qa-stage-retry.ts and
// scripts/eval-detect.ts. It is not named *.test.ts, which is what keeps Vitest
// from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-answer.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { formatMonthDay, formatWeekdayLong, formatWeekdayShort } from "../src/lib/events/format"
import { MessageAuthor, GaugeAnswer } from "@prisma/client"

const TZ = "America/Chicago"

/** The failed gauge's own hour, carried onto whatever the answer opens. */
const FAILED_TIME = "20:00"

/**
 * Reads back the newest gauge in a group, in plain English. Written for the
 * walkthrough step after a member's reply: it answers "did the right day, the
 * right hour, and the right seed actually land?" from stored rows.
 */
async function verify(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true } } },
  })
  if (!group) throw new Error(`no group ${groupId}`)

  const gauges = await prisma.gauge.findMany({
    where: { groupId },
    include: { votes: true, sourceMessage: { select: { body: true } } },
    orderBy: { createdAt: "desc" },
  })
  if (gauges.length === 0) throw new Error(`group ${groupId} has no gauges`)

  const newest = gauges[0]
  const asked = gauges.find((g) => g.retryAskMessageId !== null)

  if (asked && newest.id === asked.id) {
    console.log(
      `No new gauge yet. The newest gauge is still the asked one: ${asked.activity} · ` +
        `${formatWeekdayShort(asked.proposedDate, TZ)} ${formatMonthDay(asked.proposedDate, TZ)} · ` +
        `${asked.proposedTime ?? "(none)"}. Orbit's question is open and unanswered.`
    )
    return
  }

  const nameById = new Map(group.memberships.map((m) => [m.userId, m.user.name]))
  const seeded = newest.votes
    .filter((v) => v.answer === GaugeAnswer.IN)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((v) => nameById.get(v.userId) ?? "(non-member)")

  const carried =
    asked && asked.proposedTime && newest.proposedTime === asked.proposedTime
      ? " (carried)"
      : " (stated)"

  console.log(
    `New gauge: ${newest.activity} · ` +
      `${formatWeekdayShort(newest.proposedDate, TZ)} ${formatMonthDay(newest.proposedDate, TZ)} · ` +
      `${newest.proposedTime ?? "(none)"}${carried} · ` +
      `seeded: ${seeded.length > 0 ? seeded.join(", ") : "nobody"}`
  )
  if (newest.sourceMessage) {
    console.log(`Opened by the message: "${newest.sourceMessage.body}"`)
  }
  if (asked) {
    console.log(
      `The failed gauge it revives: ${asked.activity} · ` +
        `${formatWeekdayLong(asked.proposedDate, TZ)} · ${asked.proposedTime ?? "(none)"}.`
    )
  }
}

async function main() {
  const verifyAt = process.argv.indexOf("--verify")
  if (verifyAt !== -1) {
    const id = process.argv[verifyAt + 1]
    if (!id) throw new Error("--verify needs a group id")
    await verify(id)
    await prisma.$disconnect()
    return
  }

  const now = new Date()
  const p = getLocalParts(now, TZ)
  // The failed day is yesterday group-local, which is what makes the gauge
  // already closed at the sweep clock below and puts the ask in the past
  // tense the copy assumes ("Beers didn't happen for ...").
  const yesterdayMidnight = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 0, 0, TZ)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  const stamp = Date.now()
  const founder = await prisma.user.create({ data: { name: "Priya", supabaseAuthId: `qa-answer-founder-${stamp}` } })
  const maya = await prisma.user.create({ data: { name: "Maya", supabaseAuthId: `qa-answer-maya-${stamp}` } })
  const jesse = await prisma.user.create({ data: { name: "Jesse", supabaseAuthId: `qa-answer-jesse-${stamp}` } })
  const sam = await prisma.user.create({ data: { name: "Sam", supabaseAuthId: `qa-answer-sam-${stamp}` } })
  const group = await prisma.group.create({
    data: {
      name: "Cedar Hill Climbers",
      founderId: founder.id,
      timeZone: TZ,
      inviteToken: `qa-answer-${stamp}`,
      memberships: { create: [founder.id, maya.id, jesse.id, sam.id].map((userId) => ({ userId })) },
    },
  })

  // The idea that started it, backdated so the feed reads as a few days of
  // history rather than everything arriving at once.
  const floatedAt = daysAgo(3)
  const source = await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.MEMBER,
      authorId: maya.id,
      body: "we should finally grab beers at 8 sometime",
      createdAt: floatedAt,
    },
  })

  const body = buildGaugeMessage("beers", yesterdayMidnight, TZ, floatedAt, null)
  const created = await createGauge({
    groupId: group.id,
    sourceMessageId: source.id,
    activity: "beers",
    proposedDate: yesterdayMidnight,
    proposedTime: FAILED_TIME,
    body,
  })
  if (created.status !== "created") throw new Error("staging the failed gauge did not create it")
  await prisma.gauge.update({ where: { id: created.gauge.id }, data: { createdAt: floatedAt } })
  await prisma.message.update({
    where: { id: created.gauge.orbitMessageId },
    data: { createdAt: new Date(floatedAt.getTime() + 1000) },
  })

  // Two yeses and one can't-that-day: three people who want it, one of them
  // blocked by the day. That is the would-have-cleared bar exactly, so the
  // sweep owes this gauge the ask instead of the goodbye.
  for (const [userId, answer] of [
    [maya.id, GaugeAnswer.IN],
    [jesse.id, GaugeAnswer.IN],
    [sam.id, GaugeAnswer.NOT_THAT_DAY],
  ] as Array<[string, GaugeAnswer]>) {
    await prisma.gaugeVote.create({ data: { gaugeId: created.gauge.id, userId, answer } })
  }

  // The sweep, at 6:05pm group-local yesterday: five minutes after this gauge
  // closed (two hours before its 8pm start). The real endgame writes the ask
  // message and attaches it; this script never creates that message itself.
  const closeClock = zonedWallTimeToUtc(p.year, p.month, p.day - 1, 18, 5, TZ)
  const sweep = await runGaugeEndgame(closeClock, { groupId: group.id })
  const askResult = sweep.find((r) => r.gaugeId === created.gauge.id)
  if (!askResult || askResult.action !== "asked") {
    throw new Error(`expected the sweep to ask; got ${JSON.stringify(sweep)}`)
  }

  const askMessage = await prisma.gauge
    .findUnique({ where: { id: created.gauge.id }, include: { retryAskMessage: true } })
    .then((g) => g?.retryAskMessage ?? null)

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        failedDay: `${formatWeekdayLong(yesterdayMidnight, TZ)} ${formatMonthDay(yesterdayMidnight, TZ)}`,
        failedTime: FAILED_TIME,
        failedGaugeId: created.gauge.id,
        askMessage: askMessage?.body ?? null,
        sweep,
        next: [
          "Join through inviteUrl, then reply in the group feed.",
          '"saturday was fun" should get nothing back.',
          '"Saturday?" should open a beers gauge on Saturday at 8pm with you seeded in.',
          `Read it back: npx tsx --env-file=.env scripts/qa-stage-answer.ts --verify ${group.id}`,
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
