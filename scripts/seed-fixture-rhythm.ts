// scripts/seed-fixture-rhythm.ts
//
// TECH DEBT: This script seeds a structured rhythm as a stand-in for onboarding.
// It exists because onboarding (which captures rhythm from free text via Orbit)
// is not yet built.  Retires when the onboarding slice lands.
//
// Run manually:  npx tsx scripts/seed-fixture-rhythm.ts [groupId]
//   groupId (optional): id of the group to configure.
//                       If omitted, the most recently created group is used.
//
// What this does:
//   1. Deletes old fixture sentinel rows (if present)
//   2. Sets Group.recurringActivities to a weekly climbing rhythm
//   3. Sets Group.timeZone = "UTC" (deliberate demo choice — see §11 build-notes)
//   4. Seeds 4 synthetic members (Alex, Sam, Jordan, Casey) with no RSVPs
//      (RSVPs belong to an event; Orbit will create the event via the cron)
//
// Idempotent: re-running updates the same rows rather than creating duplicates.
//
// NEVER wire this into build, postinstall, or any deploy step.

import "dotenv/config" // must be first — tsx does not auto-load .env
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// ── Instantiate a standalone Prisma client ───────────────────────────────────
// Mirrors src/lib/prisma.ts but without the global singleton (this is a
// one-shot script, not a hot-reload environment).
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. Is .env present?")
  process.exit(1)
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// ── Sentinel ids for retired fixture rows ────────────────────────────────────
const FIXTURE_EVENT_ID = "fixture-event-1"
const FIXTURE_MESSAGES_TO_DELETE = ["fixture-message-welcome-1", "fixture-message-welcome-2"]

// ── Synthetic members — no RSVPs (no event exists yet; Orbit creates it) ─────
// supabaseAuthId is null (no auth identity); they exist only to populate the
// member roster so the group home renders with real-looking names.
const FIXTURE_USERS = [
  { id: "fixture-user-alex", name: "Alex" },
  { id: "fixture-user-sam", name: "Sam" },
  { id: "fixture-user-jordan", name: "Jordan" },
  { id: "fixture-user-casey", name: "Casey" },
] as const

// ── Target rhythm ─────────────────────────────────────────────────────────────
const FIXTURE_RHYTHM = [
  {
    activity: "climbing",
    title: "Climbing Sunday",
    daysOfWeek: [0], // Sunday = 0
    timeLocal: "08:00",
    cadence: "weekly",
  },
]

async function main() {
  // ── Determine target group ─────────────────────────────────────────────────
  const groupIdArg = process.argv[2]?.trim()
  let targetGroupId: string

  if (groupIdArg) {
    const group = await prisma.group.findUnique({ where: { id: groupIdArg } })
    if (!group) {
      console.error(`ERROR: No group found with id "${groupIdArg}".`)
      process.exit(1)
    }
    targetGroupId = group.id
    console.log(`Using provided group: "${group.name}" (${group.id})`)
  } else {
    const group = await prisma.group.findFirst({ orderBy: { createdAt: "desc" } })
    if (!group) {
      console.error("ERROR: No groups found. Create a group first (visit /create).")
      process.exit(1)
    }
    targetGroupId = group.id
    console.log(
      `\n  No group id given. Using the most recently created group:\n` +
        `   "${group.name}" (${group.id})\n` +
        `   Pass the id explicitly to target a different group:\n` +
        `   npx tsx scripts/seed-fixture-rhythm.ts ${group.id}\n`
    )
  }

  // ── Delete old fixture sentinel rows ────────────────────────────────────────
  // Prevent retired static welcome messages from coexisting with live content.
  await prisma.message.deleteMany({
    where: { id: { in: [...FIXTURE_MESSAGES_TO_DELETE] } },
  })

  // Deleting the fixture event cascades to its venue + RSVPs via the schema.
  await prisma.event.deleteMany({
    where: { id: FIXTURE_EVENT_ID },
  })

  // ── Set rhythm + timeZone on the target group ──────────────────────────────
  // timeZone = "UTC" is a deliberate demo choice: the UTC-display fix is parked,
  // and UTC makes the card read "8am" correctly in the interim.
  await prisma.group.update({
    where: { id: targetGroupId },
    data: {
      recurringActivities: FIXTURE_RHYTHM,
      timeZone: "UTC",
    },
  })

  // ── Upsert synthetic members + memberships (no RSVPs) ─────────────────────
  for (const fixture of FIXTURE_USERS) {
    // User (supabaseAuthId: null — synthetic, no auth identity)
    await prisma.user.upsert({
      where: { id: fixture.id },
      create: { id: fixture.id, name: fixture.name, supabaseAuthId: null },
      update: { name: fixture.name },
    })

    // Membership in the target group
    await prisma.membership.upsert({
      where: { userId_groupId: { userId: fixture.id, groupId: targetGroupId } },
      create: { userId: fixture.id, groupId: targetGroupId },
      update: {},
    })
  }

  console.log(`\n  Fixture seeded successfully.`)
  console.log(`  Group id:   ${targetGroupId}`)
  console.log(`  Home url:   /groups/${targetGroupId}`)
  console.log(`  Rhythm:     Climbing Sunday, weekly on Sundays at 08:00 UTC`)
  console.log(`  Time zone:  UTC (deliberate demo choice)`)
  console.log(``)
  console.log(`  Members seeded (no RSVPs — Orbit will create the event):`)
  console.log(`    Alex, Sam, Jordan, Casey`)
  console.log(``)
  console.log(`  The feed will show "The conversation starts here." until the cron runs.`)
  console.log(`  To trigger Orbit locally:`)
  console.log(`    curl http://localhost:3000/api/cron/orbit`)
  console.log(``)
  console.log(`  Re-run anytime to reset the fixture to this state.\n`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  prisma.$disconnect()
  process.exit(1)
})
