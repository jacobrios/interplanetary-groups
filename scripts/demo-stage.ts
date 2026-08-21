// scripts/demo-stage.ts
//
// Stages the Loom demo group: a climbing group that reads as if it has been
// running for a few weeks, seeded so the two beats the demo needs are one tap
// away and neither depends on a live model call.
//
// This is NOT a QA walkthrough script. It exists so a recorded demo can show
// the spark payoff (an idea becoming a real event on the third yes) in a
// single browser window with no second person and no waiting. The seeded
// members are fabricated; nothing here is product behavior.
//
// ── The four modes ──────────────────────────────────────────────────────────
//
//   npx tsx --env-file=.env scripts/demo-stage.ts
//     Creates the group, its members, its backscroll, one confirmed climb and
//     one open "beers" gauge sitting at two of the three votes it needs.
//     Prints the invite URL.
//
//   npx tsx --env-file=.env scripts/demo-stage.ts --finish <groupId>
//     Run AFTER the recording browser has joined through the invite link.
//     Deletes that join's "Jacob joined" system line, which is a staging
//     artifact rather than part of the story the demo tells, so the newest
//     thing in the feed is Orbit's beers proposal with its chips. Fails loudly
//     if nobody has joined yet, rather than silently doing nothing.
//
//   npx tsx --env-file=.env scripts/demo-stage.ts --reset <groupId>
//     Restores the group to its recording state between takes. Needs no
//     timestamp: after --finish, the newest message in the group is Orbit's
//     gauge message, so everything a take produces sits strictly after it.
//
//   npx tsx --env-file=.env scripts/demo-stage.ts --drop <groupId>
//     Deletes a staged group outright. Cleanup after recording, or after a
//     rehearsal copy that is no longer wanted.
//
// ── Why the beers idea is seeded rather than floated live ───────────────────
//
// The promotion bar is three yeses and does not scale down for small groups.
// One browser window means one voter, so an idea typed on camera stops at one
// vote and the payoff never happens. Seeding it at two puts the third yes in
// the presenter's hands and takes the model off the critical path at the exact
// moment a retake is most expensive.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run db:which`
// first, every time; this script refuses to run unless all three env sources
// agree on the dev-test project ref, the same ref db:which checks against.
//
// Deliberately outside the test suite, same precedent as the qa-stage-*
// scripts: it writes real rows to a shared database and is run by hand. It is
// not named *.test.ts, which is what keeps Vitest from collecting it.

import { prisma } from "../src/lib/prisma"
import { createGauge } from "../src/lib/gauges/create"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildGaugeMessage } from "../src/lib/orbit/spark-copy"
import { formatMonthDay, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, GaugeAnswer, RsvpStatus } from "@prisma/client"

const TZ = "America/Chicago"
const BASE = "http://localhost:3000"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

const VENUE = { name: "Movement Wrigleyville", address: "3936 N Broadway, Chicago, IL" }

/**
 * How many members `stage()` seeds. `--finish` reads it to tell "the presenter
 * has joined" from "nobody has joined yet", so the two must move together: a
 * fifth seeded member here without this number would make --finish believe a
 * real browser had joined and delete nothing, silently.
 */
const SEEDED_MEMBERS = 4

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}


// ── Mode 1: stage ───────────────────────────────────────────────────────────

async function stage() {
  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const maya = await prisma.user.create({ data: { name: "Maya", supabaseAuthId: `demo-maya-${stamp}` } })
  const sam = await prisma.user.create({ data: { name: "Sam", supabaseAuthId: `demo-sam-${stamp}` } })
  const jordan = await prisma.user.create({ data: { name: "Jordan", supabaseAuthId: `demo-jordan-${stamp}` } })
  const casey = await prisma.user.create({ data: { name: "Casey", supabaseAuthId: `demo-casey-${stamp}` } })

  const group = await prisma.group.create({
    data: {
      name: "Midweek Climbers",
      description: "A few of us climb together on Tuesdays and Thursdays. It's pretty casual, people come when they can.",
      founderId: maya.id,
      timeZone: TZ,
      inviteToken: `demo-${stamp}`,
      // The stored rhythm, so the group info page and the join screen show a
      // real schedule rather than an empty group. Weekly, Tue + Thu, 6:30pm.
      recurringActivities: [
        {
          activity: "climbing",
          title: "Climbing",
          cadence: "weekly",
          daysOfWeek: [2, 4],
          timeLocal: "18:30",
          venueName: VENUE.name,
        },
      ],
      memberships: { create: [maya.id, sam.id, jordan.id, casey.id].map((userId) => ({ userId })) },
    },
  })

  // Every seeded message gets its own distinct instant. Two messages sharing a
  // timestamp sort unstably, which showed up as replies appearing above the
  // message they answered on some renders and below it on others.
  function at(daysAgo: number, hour: number, minute: number) {
    return zonedWallTimeToUtc(p.year, p.month, p.day - daysAgo, hour, minute, TZ)
  }
  /** Minutes before now, for the messages that must read as "just happened". */
  function agoMinutes(mins: number) {
    return new Date(now.getTime() - mins * 60_000)
  }

  async function memberMsg(userId: string, body: string, createdAt: Date) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body, createdAt },
    })
  }

  async function orbitMsg(body: string, createdAt: Date) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, body, createdAt },
    })
  }

  // ── The backscroll, spread across three days so the feed carries its day
  // separators and reads as an ongoing conversation rather than one sitting.
  // Hand-written bodies: these are a seeding artifact standing in for weeks of
  // history, not output from any code path in the product. ───────────────────
  await memberMsg(maya.id, "good session tonight, that new set is brutal", at(3, 21, 4))
  await memberMsg(casey.id, "my forearms are completely gone", at(3, 21, 12))
  await memberMsg(jordan.id, "anyone around to belay thursday? trying to finish that overhang", at(2, 12, 3))
  await memberMsg(sam.id, "yeah I'm in", at(2, 12, 41))
  await orbitMsg("Climbing is on for Thursday at 6:30pm at Movement Wrigleyville.", at(2, 12, 42))
  await memberMsg(casey.id, "heads up, I'm out for tuesday, work thing ran over", agoMinutes(190))

  // ── The confirmed plan: the next Tuesday climb, 6:30pm, with the standing
  // venue. Maya, Sam and Jordan are in, Casey is out, and the recording
  // browser has no RSVP row at all (it does not exist yet), which is what
  // earns the card its teal "Needs your RSVP". ──────────────────────────────
  const daysToTuesday = ((2 - new Date(zonedWallTimeToUtc(p.year, p.month, p.day, 12, 0, TZ)).getUTCDay() + 7) % 7) || 7
  const climbStart = zonedWallTimeToUtc(p.year, p.month, p.day + daysToTuesday, 18, 30, TZ)
  const climb = await createEvent({
    groupId: group.id,
    title: "Climbing",
    startsAt: climbStart,
    activityLabel: "climbing",
    venue: VENUE,
  })
  await prisma.rsvp.create({ data: { eventId: climb.id, userId: maya.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: climb.id, userId: sam.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: climb.id, userId: jordan.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: climb.id, userId: casey.id, status: RsvpStatus.OUT } })

  // ── The open idea: Sam floats beers for the Wednesday after the climb, so
  // the idea card sits second in the rail (later date) and Orbit's message
  // still says "this Wednesday" rather than naming a date outright. Sam named
  // the day himself, so his own message seeds his yes; Maya casts the second.
  // Two of three: the third is the presenter's tap, on camera. ──────────────
  const daysToWednesday = daysToTuesday + 1
  const beersDate = zonedWallTimeToUtc(p.year, p.month, p.day + daysToWednesday, 0, 0, TZ)
  const beersSrc = await memberMsg(sam.id, "anyone up for beers wednesday? been way too long", agoMinutes(4))
  const beersBody = buildGaugeMessage("beers", beersDate, TZ, now, null)
  const beers = await createGauge({
    groupId: group.id,
    sourceMessageId: beersSrc.id,
    activity: "beers",
    proposedDate: beersDate,
    proposedTime: "19:00",
    body: beersBody,
    initiatorUserId: sam.id,
  })
  if (beers.status !== "created") throw new Error("staging the beers gauge did not create it")
  await prisma.gaugeVote.create({
    data: { gaugeId: beers.gauge.id, userId: maya.id, answer: GaugeAnswer.IN },
  })

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        groupName: group.name,
        inviteUrl: `${BASE}/join/${group.inviteToken}`,
        homeUrl: `${BASE}/groups/${group.id}`,
        eventUrl: `${BASE}/events/${climb.id}`,
        climb: `${formatWeekdayShort(climbStart, TZ)} ${formatMonthDay(climbStart, TZ)} 6:30pm at ${VENUE.name}`,
        beers: `${formatWeekdayShort(beersDate, TZ)} ${formatMonthDay(beersDate, TZ)} 7:00pm, 2 of 3 votes in (Sam, Maya)`,
        timeChangeSentence: `can we push ${new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: TZ }).format(climbStart)}'s climb to 7:30?`,
        next: [
          "Join through inviteUrl in the browser window you will record in, name yourself Jacob.",
          `Then run: npx tsx --env-file=.env scripts/demo-stage.ts --finish ${group.id}`,
          "Then load homeUrl in that same window and leave it open in its own tab.",
        ],
      },
      null,
      2
    )
  )
}

// ── Mode 2: finish ──────────────────────────────────────────────────────────

async function finish(groupId: string) {
  const memberships = await prisma.membership.findMany({
    where: { groupId },
    orderBy: { joinedAt: "asc" },
    include: { user: true },
  })
  if (memberships.length <= SEEDED_MEMBERS) {
    console.error(
      `STOP: this group has ${memberships.length} members, so nobody has joined through the invite link yet.`
    )
    console.error(`Join first, then run --finish. Nothing was changed.`)
    process.exit(1)
  }
  const viewer = memberships[memberships.length - 1]

  // The join line is an artifact of staging the demo, not part of the story
  // the demo tells: this group is meant to read as one the presenter has been
  // in for weeks. Deleting it also puts Orbit's beers proposal back at the
  // bottom of the feed, where its chips are visible without scrolling, and
  // gives --reset a restore point it can find without being told one.
  const removed = await prisma.message.deleteMany({
    where: { groupId, authorType: MessageAuthor.SYSTEM },
  })

  console.log(
    JSON.stringify(
      {
        viewer: viewer.user.name,
        viewerUserId: viewer.userId,
        joinLinesRemoved: removed.count,
        homeUrl: `${BASE}/groups/${groupId}`,
        resetCommand: `npx tsx --env-file=.env scripts/demo-stage.ts --reset ${groupId}`,
      },
      null,
      2
    )
  )
}

// ── Mode 3: reset ───────────────────────────────────────────────────────────

async function reset(groupId: string) {
  const gauges = await prisma.gauge.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
    include: { orbitMessage: true },
  })
  if (gauges.length === 0) {
    console.error(`STOP: no gauge found in ${groupId}. Is this the demo group?`)
    process.exit(1)
  }
  const seeded = gauges[0]
  const restorePoint = seeded.orbitMessage.createdAt

  const memberships = await prisma.membership.findMany({ where: { groupId }, orderBy: { joinedAt: "asc" } })
  // Same guard --finish carries, and for a sharper reason: "the viewer" is
  // whoever joined last, so on a group nobody has joined that is a seeded
  // member, and this would delete THEIR seeded RSVP. The group would come back
  // looking almost right, with the confirmed card quietly reading 3 In · 0 Out
  // instead of 3 In · 1 Out. Refusing is the only safe answer.
  if (memberships.length <= SEEDED_MEMBERS) {
    console.error(
      `STOP: this group has ${memberships.length} members, so nobody has joined through the invite link yet.`
    )
    console.error(`There is no take to reset, and resetting now would delete a seeded member's RSVP.`)
    console.error(`Nothing was changed.`)
    process.exit(1)
  }
  const viewerId = memberships[memberships.length - 1].userId

  // Order matters twice over. Rows that point at messages go before the
  // messages themselves; and sparked events go before the gauges that made
  // them, because Event.gaugeId is onDelete:SetNull. Delete a gauge first and
  // its event survives with a nulled gaugeId, which is exactly the shape this
  // next line reads as "not sparked" — the stray confirmed card would then sit
  // in the rail through every later take.
  const proposals = await prisma.changeProposal.deleteMany({ where: { groupId } })
  // Sparked events only. The seeded climb has a null gaugeId and survives.
  const sparked = await prisma.event.deleteMany({ where: { groupId, gaugeId: { not: null } } })
  const extraGauges = await prisma.gauge.deleteMany({ where: { groupId, id: { not: seeded.id } } })
  const votes = await prisma.gaugeVote.deleteMany({ where: { gaugeId: seeded.id, userId: viewerId } })
  const rsvps = await prisma.rsvp.deleteMany({ where: { userId: viewerId, event: { groupId } } })
  const messages = await prisma.message.deleteMany({
    where: { groupId, createdAt: { gt: restorePoint } },
  })

  console.log(
    JSON.stringify(
      {
        restoredTo: restorePoint.toISOString(),
        deleted: {
          changeProposals: proposals.count,
          gaugesCreatedDuringTake: extraGauges.count,
          sparkedEvents: sparked.count,
          viewerGaugeVotes: votes.count,
          viewerRsvps: rsvps.count,
          messagesAfterRestorePoint: messages.count,
        },
        homeUrl: `${BASE}/groups/${groupId}`,
        note: "Reload the group home. The climb should show 'Needs your RSVP' and beers should be back at 2 of 3.",
      },
      null,
      2
    )
  )
}

// ── Mode 4: drop ────────────────────────────────────────────────────────────

/** Deletes a staged demo group outright. Cleanup after recording, or after a
 *  rehearsal run that is no longer wanted. Cascades take the memberships,
 *  messages, events and gauges with it; the seeded user rows are left behind
 *  and are harmless. */
async function drop(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } })
  if (!group) {
    console.error(`STOP: no group ${groupId}. Nothing was changed.`)
    process.exit(1)
  }
  await prisma.group.delete({ where: { id: groupId } })
  console.log(JSON.stringify({ dropped: groupId, name: group.name }, null, 2))
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main() {
  requireDevTest()
  const [flag, groupId] = process.argv.slice(2)

  if (!flag) return stage()
  if (flag === "--finish" || flag === "--reset" || flag === "--drop") {
    if (!groupId) {
      console.error(`STOP: ${flag} needs a groupId.`)
      process.exit(1)
    }
    if (flag === "--finish") return finish(groupId)
    if (flag === "--reset") return reset(groupId)
    return drop(groupId)
  }
  console.error(`Unknown flag ${flag}. Use no flag, --finish, --reset, or --drop, each with a <groupId>.`)
  process.exit(1)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
