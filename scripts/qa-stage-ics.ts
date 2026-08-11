// scripts/qa-stage-ics.ts
//
// Stages one event for the .ics add-to-calendar walkthrough.
//
// Usage:
//   1. npm run db:which   (always, before any script that writes)
//   2. npx tsx --env-file=.env scripts/qa-stage-ics.ts
//
// What it creates: a "[QA] ICS" group with one event that has a venue
// carrying BOTH a display label and a street address, and no stored end
// time. That single event exercises the two claims the walkthrough has to
// show and no existing QA row covers: the street address reaching the
// calendar entry's location (its first surface anywhere in the product),
// and the one-hour fallback standing in for a missing end time.
//
// An event with no venue at all, which proves the location line is omitted
// rather than left empty, already exists in the dev-test database; the
// walkthrough uses one of those directly instead of staging a second row.
//
// WHERE IT WRITES: whichever database .env points at; requireDevTest refuses
// to run unless all three env sources agree on the dev-test ref, the same
// guard every other qa-stage script uses.
//
// This is QA tooling, deliberately outside the test suite: it writes real
// rows to a shared database. Not named *.test.ts, which is what keeps
// Vitest from collecting it.

import { prisma } from "../src/lib/prisma"
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

async function main(): Promise<void> {
  requireDevTest()

  const founder = await prisma.user.create({
    data: {
      name: "[QA] ICS Founder",
      supabaseAuthId: `qa-ics-founder-${Date.now()}`,
    },
  })

  const group = await prisma.group.create({
    data: {
      name: "[QA] ICS",
      founderId: founder.id,
      timeZone: "America/Chicago",
      memberships: { create: { userId: founder.id } },
    },
  })

  // Tomorrow at 18:30 UTC, so the entry lands in the near future on any
  // machine running the walkthrough, and no end time so the one-hour
  // fallback is the thing under test.
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  startsAt.setUTCHours(18, 30, 0, 0)

  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "Climb, then tacos",
      startsAt,
      activityLabel: "CLIMBING",
      venues: {
        create: {
          name: "Movement Gym LLC",
          displayLabel: "Movement",
          address: "1622 W Belmont Ave, Chicago, IL",
        },
      },
    },
  })

  console.log(`group:  ${group.id}  ([QA] ICS)`)
  console.log(`event:  ${event.id}  (${event.title})`)
  console.log(`detail: /events/${event.id}`)
  console.log(`file:   /events/${event.id}/calendar.ics`)
  console.log(`starts: ${startsAt.toISOString()} (no stored end; expect a one-hour block)`)

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
