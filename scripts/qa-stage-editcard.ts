// scripts/qa-stage-editcard.ts
//
// Stages the editable-event-card QA walkthrough: one fresh group ("[QA] Edit
// Card") the owner can join fresh through the invite link, seeded with two
// events that exercise the two shapes the founder's edit control has to
// handle: a scheduled-rhythm event (has a venue, a stored rhythm behind it)
// and a floated/promoted-gauge event (no venue, nothing behind it but the
// gauge).
//
// Modelled closely on scripts/qa-stage-cardstate.ts: same requireDevTest
// guard, same [QA]-prefixed seeded group/users, same invite-link printing.
//
// What this script seeds, from a founder (Jordan) plus two members (Casey,
// Rae):
//
//   1. A weekly rhythm in recurringActivities: tennis, Saturdays 09:00,
//      venue "Court 3". Stored in the real StoredRhythm/GroupRhythm shape
//      (src/lib/orbit/rhythm.ts) so parseRhythm accepts it, the way
//      onboarding would have written it.
//   2. That rhythm's next occurrence, created the same way reconcile.ts
//      creates it (title "Tennis", activityLabel "tennis", scheduledKey
//      "<groupId>:<iso>", venue Court 3 snapshotted from the rhythm), at
//      least 3 days out. Jordan and Casey are IN.
//   3. A floated plan with NO venue: "Beers" 2 days out at 7pm group time,
//      created the way promote.ts creates a sparked event (a real Gauge row,
//      an Event row with gaugeId pointing at it, title "Beers", activityLabel
//      "beers", no venue). Jordan, Casey, and Rae are all IN.
//   4. A few chat messages, including Orbit's own announcement lines for
//      both plans, so the feed isn't empty.
//
// WHERE IT WRITES: whichever database `.env` points at. Run `npm run
// db:which` first, every time; this script refuses to run itself unless all
// three env sources agree on the dev-test project ref (see requireDevTest
// below), the same ref db:which checks against.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database and is meant to be run by hand before a browser
// walkthrough. No model calls anywhere in this script. Not named *.test.ts,
// which is what keeps Vitest from collecting it.
//
// Usage: npx tsx --env-file=.env scripts/qa-stage-editcard.ts
//
// Each run creates a NEW group with fresh users and a fresh invite token, so
// running it twice leaves two groups behind rather than updating the first.
// Delete the old one if you do not want it in the way.

import { prisma } from "../src/lib/prisma"
import { createEvent } from "../src/lib/events/create"
import { zonedWallTimeToUtc, getLocalParts } from "../src/lib/orbit/occurrence"
import { buildAnnouncement } from "../src/lib/orbit/announce"
import { buildSparkAnnouncement } from "../src/lib/orbit/spark-copy"
import { formatMonthDay, formatWeekdayShort } from "../src/lib/events/format"
import { judge } from "./db-which"
import { MessageAuthor, RsvpStatus, Prisma } from "@prisma/client"
import type { GroupRhythm, StoredRhythm } from "../src/lib/orbit/rhythm"

const TZ = "America/Chicago"

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
 * Day offset (from `from`, in local calendar days) of the next occurrence of
 * `dayOfWeek` that is at least `minDaysOut` days out. Checked at local noon
 * so a timezone's UTC offset can never push the day-of-week check across a
 * date boundary.
 */
function nextWeekdayOffset(from: { year: number; month: number; day: number }, dayOfWeek: number, minDaysOut: number, tz: string): number {
  for (let offset = minDaysOut; offset < minDaysOut + 8; offset++) {
    const noonLocal = zonedWallTimeToUtc(from.year, from.month, from.day + offset, 12, 0, tz)
    if (noonLocal.getUTCDay() === dayOfWeek) return offset
  }
  throw new Error("could not find a matching weekday within a week of the minimum offset")
}

async function main() {
  requireDevTest()

  const now = new Date()
  const p = getLocalParts(now, TZ)
  const stamp = Date.now()

  const jordan = await prisma.user.create({ data: { name: "Jordan", supabaseAuthId: `qa-editcard-founder-${stamp}` } })
  const casey = await prisma.user.create({ data: { name: "Casey", supabaseAuthId: `qa-editcard-casey-${stamp}` } })
  const rae = await prisma.user.create({ data: { name: "Rae", supabaseAuthId: `qa-editcard-rae-${stamp}` } })

  // ── The standing rhythm: tennis, Saturdays 09:00, Court 3. Stored in the
  // real StoredRhythm shape onboarding would have written, so the group's
  // recurringActivities column parses the same way a real founder's does. ──
  const storedRhythm: StoredRhythm = {
    activity: "tennis",
    title: "Tennis",
    cadence: "weekly",
    daysOfWeek: [6], // Saturday
    timeLocal: "09:00",
    durationMinutes: null,
    venueName: "Court 3",
  }

  const group = await prisma.group.create({
    data: {
      name: "[QA] Edit Card",
      founderId: jordan.id,
      timeZone: TZ,
      inviteToken: `qa-editcard-${stamp}`,
      // Json? column: the validated array is cast for Prisma's JSON input
      // type, same pattern as groups/provision.ts.
      recurringActivities: [storedRhythm] as unknown as Prisma.InputJsonValue,
      memberships: { create: [jordan.id, casey.id, rae.id].map((userId) => ({ userId })) },
    },
  })

  async function memberMsg(userId: string, body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId, body },
    })
  }
  async function orbitMsg(body: string) {
    return prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body },
    })
  }

  await memberMsg(jordan.id, "who's around this week")
  await memberMsg(casey.id, "count me in for whatever")

  // ── The scheduled-rhythm event: the rhythm's next occurrence, created the
  // same way reconcile.ts creates it, at least 3 days out. ──────────────────
  const tennisOffset = nextWeekdayOffset(p, storedRhythm.daysOfWeek![0], 3, TZ)
  const [hh, mm] = storedRhythm.timeLocal!.split(":").map(Number)
  const tennisStartAtTime = zonedWallTimeToUtc(p.year, p.month, p.day + tennisOffset, hh, mm, TZ)
  const tennisEvent = await createEvent({
    groupId: group.id,
    title: storedRhythm.title,
    startsAt: tennisStartAtTime,
    activityLabel: storedRhythm.activity,
    scheduledKey: `${group.id}:${tennisStartAtTime.toISOString()}`,
    venue: { name: storedRhythm.venueName! },
  })
  await prisma.rsvp.create({ data: { eventId: tennisEvent.id, userId: jordan.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: tennisEvent.id, userId: casey.id, status: RsvpStatus.IN } })

  const tennisRhythmForAnnouncement: GroupRhythm = {
    activity: storedRhythm.activity,
    title: storedRhythm.title,
    daysOfWeek: storedRhythm.daysOfWeek!,
    timeLocal: storedRhythm.timeLocal!,
    cadence: "weekly",
    venueName: storedRhythm.venueName,
  }
  await orbitMsg(buildAnnouncement(tennisEvent, tennisRhythmForAnnouncement, TZ))

  await memberMsg(rae.id, "tennis court is booked, see you all there")

  // ── The floated plan with no venue: a promoted idea for beers, 2 days out
  // at 7pm group time. Created the way promote.ts creates a sparked event: a
  // real Gauge row (with its own source message and Orbit ask), then an
  // Event row with gaugeId pointing at it. Jordan, Casey, Rae all IN. ───────
  const beersDate = zonedWallTimeToUtc(p.year, p.month, p.day + 2, 0, 0, TZ)
  const beersStart = zonedWallTimeToUtc(p.year, p.month, p.day + 2, 19, 0, TZ)

  const beersSrc = await memberMsg(casey.id, "beers this week? been too long")
  const beersOrbitAsk = await orbitMsg(`Beers ${formatWeekdayShort(beersStart, TZ)}? If three are in, I'll set it up.`)
  const beersGauge = await prisma.gauge.create({
    data: {
      groupId: group.id,
      sourceMessageId: beersSrc.id,
      orbitMessageId: beersOrbitAsk.id,
      activity: "beers",
      proposedDate: beersDate,
      proposedTime: "19:00",
    },
  })

  const beersEvent = await createEvent({
    groupId: group.id,
    title: "Beers",
    startsAt: beersStart,
    activityLabel: "beers",
    gaugeId: beersGauge.id,
    venue: null,
  })
  await prisma.rsvp.create({ data: { eventId: beersEvent.id, userId: jordan.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: beersEvent.id, userId: casey.id, status: RsvpStatus.IN } })
  await prisma.rsvp.create({ data: { eventId: beersEvent.id, userId: rae.id, status: RsvpStatus.IN } })

  await orbitMsg(buildSparkAnnouncement("beers", beersStart, TZ, 3, now))

  await memberMsg(jordan.id, "nice, see everyone there")

  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        groupName: group.name,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        homeUrl: `http://localhost:3000/groups/${group.id}`,
        tennisEventId: tennisEvent.id,
        tennisEventUrl: `http://localhost:3000/events/${tennisEvent.id}`,
        beersEventId: beersEvent.id,
        beersEventUrl: `http://localhost:3000/events/${beersEvent.id}`,
        seededSummary:
          "Seeding artifact, not product behavior: Jordan/Casey/Rae are fake QA members created fresh by this script, not real people who used the product. " +
          `Tennis (${formatWeekdayShort(tennisStartAtTime, TZ)} ${formatMonthDay(tennisStartAtTime, TZ)}, 9am, Court 3) comes from a real weekly rhythm and has a venue; ` +
          `Beers (${formatWeekdayShort(beersStart, TZ)} ${formatMonthDay(beersStart, TZ)}, 7pm) came from a floated idea that got promoted and has NO venue. ` +
          "Both are real Event rows created the way the product itself creates them (reconcile for tennis, gauge promotion for beers), not hand-faked shortcuts.",
        next: [
          "Join through inviteUrl as a brand-new member.",
          "Open tennisEventUrl: this event has a venue and a rhythm behind it, so it exercises the edit path for a rhythm-backed event.",
          "Open beersEventUrl: this event has NO venue and nothing behind it but the gauge, so it exercises the edit path for a floated/promoted event with no data home for venue, day, or title before this slice.",
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
