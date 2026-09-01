// scripts/qa-stage-latency.ts
//
// Stages a group for the message-send-latency walkthrough: one fresh group the
// owner (or a browser) joins through the invite link, carrying a realistic
// conversation and one upcoming plan, so a send has the same work to do that a
// real send has.
//
// The message count is the point of this script, so it is an argument. The
// default is 6, which is the size of the group the owner measured at three to
// four seconds on his phone. Pass a larger number to feel what the same send
// costs a group that has been talking for months.
//
//   npx tsx --env-file=.env scripts/qa-stage-latency.ts        # 6 messages
//   npx tsx --env-file=.env scripts/qa-stage-latency.ts 500    # 500 messages
//
// WHERE IT WRITES: whichever database .env points at, and it refuses to run
// unless all three env sources agree on the dev-test project ref, the same
// guard qa-sweep.ts and measure-group-home.ts use.
//
// Every run creates a NEW group with a fresh invite token, so running it twice
// leaves two groups behind rather than updating the first.
//
// QA tooling, deliberately outside the test suite (same precedent as the other
// qa-stage-* scripts). Not named *.test.ts, which is what keeps Vitest from
// collecting it.

import { MessageAuthor, RsvpStatus } from "@prisma/client"

import { prisma } from "../src/lib/prisma"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */


function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}

/**
 * A short loop of plausible chat, so the feed reads as a conversation rather
 * than as the same sentence N times. Nothing here is meant to trip Orbit: the
 * walkthrough's own send is what exercises detection.
 */
const CHATTER = [
  "hey all, good session last week",
  "yeah that last route was brutal",
  "my forearms are still complaining",
  "same. worth it though",
  "anyone free earlier than usual next time?",
  "I can do earlier most days",
  "the gym is quieter before 6 anyway",
  "true, we should try it",
]

async function main() {
  requireDevTest()

  const target = Number(process.argv[2] ?? 6)
  if (!Number.isInteger(target) || target < 0) {
    console.error(`Message count must be a non-negative integer; got "${process.argv[2]}".`)
    process.exit(1)
  }

  const founder = await prisma.user.create({ data: { name: "Jordan" } })
  const group = await prisma.group.create({
    data: {
      name: "[QA] Send Latency",
      founderId: founder.id,
      timeZone: "America/New_York",
      memberships: { create: { userId: founder.id } },
    },
  })

  const others = await Promise.all(
    ["Casey", "Rae", "Sam"].map((name) =>
      prisma.user.create({ data: { name, memberships: { create: { groupId: group.id } } } })
    )
  )
  const members = [founder, ...others]

  // One upcoming plan with a partial roster, so the card region does real work
  // on every render rather than short-circuiting on an empty list.
  const starts = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  starts.setHours(18, 0, 0, 0)
  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Climbing",
      activityLabel: "climbing",
      startsAt: starts,
      venues: { create: { name: "The Gym", address: "1 Boulder Way" } },
    },
  })
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: members[0].id, status: RsvpStatus.IN },
      { eventId: event.id, userId: members[1].id, status: RsvpStatus.IN },
      { eventId: event.id, userId: members[2].id, status: RsvpStatus.OUT },
    ],
  })

  if (target > 0) {
    const base = Date.now() - target * 60_000
    await prisma.message.createMany({
      data: Array.from({ length: target }, (_, i) => ({
        groupId: group.id,
        authorType: MessageAuthor.MEMBER,
        authorId: members[i % members.length].id,
        body: CHATTER[i % CHATTER.length],
        createdAt: new Date(base + i * 60_000),
      })),
    })
  }

  console.log(`Group:    ${group.name}`)
  console.log(`Messages: ${target}`)
  console.log(`Members:  ${members.map((m) => m.name).join(", ")}`)
  console.log(`\nJoin path (append to whatever host you are serving on):`)
  console.log(`  /join/${group.inviteToken}`)
  console.log(`\nGroup path (only works once you have joined):`)
  console.log(`  /groups/${group.id}`)

  await prisma.$disconnect()
}

// Exit loudly rather than as an unhandled rejection.
// This script deliberately leaves its group behind for QA, so there is nothing to
// clean up; the catch is here so a failure exits non-zero and visibly rather
// than as an unhandled rejection that reads like success in a pipeline.
main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
