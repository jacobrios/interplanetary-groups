// scripts/qa-stage-cancel.ts
//
// Stages the walkthrough for the cancel-one-occurrence slice.
//
// Usage:
//   1. npm run db:which   (always, before any script that writes)
//   2. npx tsx --env-file=.env scripts/qa-stage-cancel.ts
//
// What it creates: a "[QA] Cancel" group holding TWO upcoming plans, so both
// faces of the slice are on screen at once without anyone having to act
// first:
//
//   - "Tennis" is SCHEDULED, three days out, with RSVPs already on it, so
//     the live card shows its counts and its RSVP pair, and its detail
//     screen carries "Call this off" below that pair. This is the plan the
//     runner calls off themselves, which is the only way to see the two-tap
//     confirm and Orbit's announcement.
//   - "Squash" is already CANCELLED, four days out, and deliberately keeps
//     its RSVP rows. That is the slice's own claim made visible: cancelling
//     touches no RSVP row, so the roster on its detail screen is intact
//     while its card has dropped its counts entirely.
//
// Both plans are in the future on purpose. A called-off plan whose start has
// passed leaves the card region anyway, so it would prove nothing.
//
// The runner joins through the printed invite link and becomes a real
// member with their own session, rather than having ids pasted from some
// other session's browser.
//
// WHERE IT WRITES: whichever database .env points at; requireDevTest refuses
// to run unless all three env sources agree on the dev-test ref, the same
// guard every other qa-stage script uses.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database. Not named *.test.ts, which is what keeps
// Vitest from collecting it.

import { EventStatus, MessageAuthor, RsvpStatus } from "@prisma/client"
import { prisma } from "../src/lib/prisma"
import { buildCancelAnnouncement } from "../src/lib/orbit/cancel-copy"
import { judge } from "./db-which"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/** Days from now at 18:00 UTC, so both plans sit comfortably in the future. */
function daysOut(days: number): Date {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  d.setUTCHours(18, 0, 0, 0)
  return d
}

async function main(): Promise<void> {
  requireDevTest()

  const stamp = `${Date.now()}`

  const jordan = await prisma.user.create({
    data: { name: "Jordan", supabaseAuthId: `qa-cancel-founder-${stamp}` },
  })
  const sam = await prisma.user.create({
    data: { name: "Sam", supabaseAuthId: `qa-cancel-sam-${stamp}` },
  })
  const rae = await prisma.user.create({
    data: { name: "Rae", supabaseAuthId: `qa-cancel-rae-${stamp}` },
  })

  const group = await prisma.group.create({
    data: {
      name: "[QA] Cancel",
      founderId: jordan.id,
      timeZone: "America/Chicago",
      inviteToken: `qa-cancel-${stamp}`,
      memberships: {
        create: [{ userId: jordan.id }, { userId: sam.id }, { userId: rae.id }],
      },
    },
  })

  // The live plan. Two answers on it, so the card's counts line has
  // something to say and the runner can see it disappear on the other card.
  const tennis = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Tennis",
      activityLabel: "tennis",
      startsAt: daysOut(3),
      venues: { create: { name: "Riverside Courts", displayLabel: "Riverside" } },
    },
  })
  await prisma.rsvp.createMany({
    data: [
      { eventId: tennis.id, userId: jordan.id, status: RsvpStatus.IN },
      { eventId: tennis.id, userId: sam.id, status: RsvpStatus.OUT },
    ],
  })

  // The already called-off plan, with its RSVPs deliberately left in place:
  // the roster on its detail screen is what shows that cancelling took
  // nobody's answer away.
  const squashStartsAt = daysOut(4)
  const squashCancelledAt = new Date()
  const squash = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Squash",
      activityLabel: "squash",
      startsAt: squashStartsAt,
      status: EventStatus.CANCELLED,
      cancelledAt: squashCancelledAt,
      venues: { create: { name: "Eastside Club", displayLabel: "Eastside" } },
    },
  })
  await prisma.rsvp.createMany({
    data: [
      { eventId: squash.id, userId: jordan.id, status: RsvpStatus.IN },
      { eventId: squash.id, userId: sam.id, status: RsvpStatus.IN },
      { eventId: squash.id, userId: rae.id, status: RsvpStatus.OUT },
    ],
  })

  // The announcement that would have been posted when Squash was called
  // off, so the feed reads the way it will in life rather than showing a
  // cancelled plan nobody ever mentioned. Built through the real function
  // rather than typed out here, so this seeded line can never drift from
  // what the product actually says.
  await prisma.message.create({
    data: {
      groupId: group.id,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: buildCancelAnnouncement(
        "Rae",
        "squash",
        squashStartsAt,
        group.timeZone,
        squashCancelledAt
      ),
    },
  })

  console.log(
    JSON.stringify(
      {
        group: group.id,
        inviteUrl: `http://localhost:3000/join/${group.inviteToken}`,
        liveEvent: { id: tennis.id, url: `/events/${tennis.id}`, title: "Tennis" },
        cancelledEvent: { id: squash.id, url: `/events/${squash.id}`, title: "Squash" },
        walkthrough: [
          "Join through inviteUrl; that real session becomes the 4th member and the viewer.",
          "Group home: Tennis reads normally, Squash reads CALLED OFF with no counts and no RSVP buttons.",
          "Open Squash: the label sits above the title, the roster is still there, there is no Add to calendar, and the only control is Put this back on.",
          "Open Tennis: Call off sits BELOW the RSVP pair. Tap it once, nothing happens yet.",
          "Tap Never mind, then tap Call off again and confirm. Orbit names you in the feed.",
          "Back on the group home, Tennis now reads the same way Squash does.",
          "Put Tennis back on. Its RSVPs should be exactly as they were.",
        ],
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
