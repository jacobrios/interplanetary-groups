// scripts/seed-fixture-event.ts
//
// TECH DEBT: This is a deliberate bridge fixture until Orbit's event-creation
// slice lands.  It seeds one synthetic event into the live dev database so the
// event detail page at /events/<id> has real data to render.
//
// MUST BE REMOVED BEFORE LAUNCH.  It lands in the single real dev database
// (there is no separate test database yet — see §11 tech debt).
//
// Run manually:  npx tsx scripts/seed-fixture-event.ts [groupId]
//   groupId (optional): the id of the group to attach the event to.
//                        If omitted, the most recently created group is used
//                        and its name + id are logged loudly.
//
// Idempotent: re-running updates the same fixture rows rather than creating
// duplicates (all writes use upsert on stable sentinel ids).
//
// NEVER wire this into build, postinstall, or any deploy step.

import "dotenv/config" // must be first — tsx does not auto-load .env
import { PrismaClient, MessageAuthor } from "@prisma/client"
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

// ── Fixture sentinel ids ─────────────────────────────────────────────────────
// Using descriptive strings instead of cuid() so re-runs are idempotent.
const FIXTURE_EVENT_ID = "fixture-event-1"
const FIXTURE_VENUE_ID = "fixture-venue-1"

// Orbit welcome messages — authored as ORBIT (authorId null), consistent with
// the MessageAuthor enum design (Orbit is not a User row).  Copy follows
// §7 rules: warm, plain, three-letter weekday abbrev, no em/en dashes.
// These retire with the rest of the fixture bridge when Orbit's live event-
// creation slice lands.
const FIXTURE_MESSAGES = [
  {
    id: "fixture-message-welcome-1",
    body: "Welcome to the group! I'll keep things organized so nobody has to be the planner.",
  },
  {
    id: "fixture-message-welcome-2",
    body: "First up: Climbing Sunday on Jul 19. I've penciled in Red Rock Canyon. Let me know if you're in.",
  },
] as const

// Synthetic members — supabaseAuthId is null (no auth identity); they exist
// only to populate roster buckets.
const FIXTURE_USERS = [
  { id: "fixture-user-alex", name: "Alex", rsvp: "IN" as const },
  { id: "fixture-user-sam", name: "Sam", rsvp: "IN" as const },
  { id: "fixture-user-jordan", name: "Jordan", rsvp: "OUT" as const },
  { id: "fixture-user-casey", name: "Casey", rsvp: null }, // HAVEN'T REPLIED
] as const

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
      `\n⚠️  No group id given. Using the most recently created group:\n` +
        `   "${group.name}" (${group.id})\n` +
        `   Pass the id explicitly to target a different group:\n` +
        `   npx tsx scripts/seed-fixture-event.ts ${group.id}\n`
    )
  }

  // ── Upsert fixture event ───────────────────────────────────────────────────
  const event = await prisma.event.upsert({
    where: { id: FIXTURE_EVENT_ID },
    create: {
      id: FIXTURE_EVENT_ID,
      groupId: targetGroupId,
      title: "Climbing Sunday",
      activityLabel: "Bouldering",
      startsAt: new Date("2026-07-19T17:00:00Z"), // Sat, Jul 19 · 10am PDT
    },
    update: {
      groupId: targetGroupId,
      title: "Climbing Sunday",
      activityLabel: "Bouldering",
      startsAt: new Date("2026-07-19T17:00:00Z"),
    },
  })

  // ── Upsert fixture venue ───────────────────────────────────────────────────
  await prisma.venue.upsert({
    where: { id: FIXTURE_VENUE_ID },
    create: {
      id: FIXTURE_VENUE_ID,
      eventId: FIXTURE_EVENT_ID,
      name: "Red Rock Canyon",
      displayLabel: "Red Rock Canyon",
    },
    update: {
      name: "Red Rock Canyon",
      displayLabel: "Red Rock Canyon",
    },
  })

  // ── Upsert synthetic members + memberships + RSVPs ─────────────────────────
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

    // RSVP (only for users who have replied)
    if (fixture.rsvp) {
      await prisma.rsvp.upsert({
        where: { eventId_userId: { eventId: FIXTURE_EVENT_ID, userId: fixture.id } },
        create: { eventId: FIXTURE_EVENT_ID, userId: fixture.id, status: fixture.rsvp },
        update: { status: fixture.rsvp },
      })
    }
  }

  // ── Upsert Orbit welcome messages ─────────────────────────────────────────
  // authorType: ORBIT, authorId: null — Orbit is not a User row.
  for (const msg of FIXTURE_MESSAGES) {
    await prisma.message.upsert({
      where: { id: msg.id },
      create: {
        id: msg.id,
        groupId: targetGroupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: msg.body,
      },
      update: {
        groupId: targetGroupId,
        body: msg.body,
      },
    })
  }

  console.log(`\n✓ Fixture seeded successfully.`)
  console.log(`  Event id:  ${FIXTURE_EVENT_ID}`)
  console.log(`  Group id:  ${targetGroupId}`)
  console.log(`  Home url:  /groups/${targetGroupId}`)
  console.log(`  Event url: /events/${FIXTURE_EVENT_ID}`)
  console.log(`\n  Roster:`)
  console.log(`    IN:              Alex, Sam`)
  console.log(`    OUT:             Jordan`)
  console.log(`    HAVEN'T REPLIED: Casey (+ you, if you haven't RSVP'd yet)`)
  console.log(`\n  Feed: 2 Orbit welcome messages`)
  console.log(`\n  Re-run anytime to reset the fixture to this state.\n`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  prisma.$disconnect()
  process.exit(1)
})
