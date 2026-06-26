// src/lib/orbit/__tests__/reconcile.test.ts
//
// Integration tests for reconcileScheduledEvents — hits the real dev DB.
// Each test uses a fresh User + Group with a weekly Sunday rhythm in UTC.
//
// Cleanup order (FK constraints):
//   Message (groupId) → Rsvp (eventId cascade) → Event (groupId) → Membership (groupId) → Group (founderId) → User

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { reconcileScheduledEvents } from "../reconcile"

// ---------------------------------------------------------------------------
// Shared test-data tracking for afterEach cleanup
// ---------------------------------------------------------------------------

let userId: string | null = null
let groupId: string | null = null
const eventIds: string[] = []
const messageIds: string[] = []

async function cleanup() {
  // Delete messages first (reference groupId)
  for (const id of messageIds) {
    await prisma.message.delete({ where: { id } }).catch(() => {})
  }
  messageIds.length = 0

  // Delete events (Rsvp rows cascade-delete from event)
  for (const id of eventIds) {
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
  eventIds.length = 0

  // Delete group (removes Memberships via cascade, then Group)
  if (groupId) {
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }

  // Delete user last (Group.founderId is Restrict)
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    userId = null
  }
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Shared rhythm fixture — weekly Sunday @ 08:00 UTC
// ---------------------------------------------------------------------------
const SUNDAY_RHYTHM = [
  {
    activity: "climbing",
    title: "Climbing Sunday",
    daysOfWeek: [0], // 0 = Sunday
    timeLocal: "08:00",
    cadence: "weekly",
  },
]

// A "now" that is always a Sunday morning *before* 08:00, so the next
// occurrence is later the same day.  We use a far-future Sunday so that:
//   (a) computeNextOccurrence finds an occurrence strictly after NOW, and
//   (b) the created Event's startsAt is in the future from the real wall clock,
//       so findSoonestUpcomingEvent (which uses new Date() internally) correctly
//       detects it as "upcoming" on the second run of the idempotency test.
// 2099-06-14 is a Sunday.  "now" = 06:00 UTC → next occurrence = 08:00 UTC same day.
const NOW = new Date("2099-06-14T06:00:00Z")
const EXPECTED_STARTS_AT = new Date("2099-06-14T08:00:00Z")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUserAndGroup(recurringActivities: unknown) {
  const suffix = Date.now()
  const user = await prisma.user.create({
    data: {
      name: "[TEST] Reconcile User",
      supabaseAuthId: `test-reconcile-${suffix}`,
    },
  })
  userId = user.id

  const group = await prisma.group.create({
    data: {
      name: "[TEST] Reconcile Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: recurringActivities as never,
      memberships: { create: { userId: user.id } },
    },
  })
  groupId = group.id

  return { user, group }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reconcileScheduledEvents", () => {
  it("happy path: creates one Event and one ORBIT Message for a group with a valid rhythm", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // Act
    const results = await reconcileScheduledEvents(NOW)

    // Only our test group should appear in results (filter by groupId)
    const result = results.find((r) => r.groupId === group.id)
    expect(result).toBeDefined()
    expect(result!.status).toBe("created")
    if (result!.status !== "created") throw new Error("narrowing")
    eventIds.push(result!.eventId)

    // Verify: exactly one Event with correct title and startsAt
    const event = await prisma.event.findUnique({ where: { id: result!.eventId } })
    expect(event).not.toBeNull()
    expect(event!.title).toBe("Climbing Sunday")
    expect(event!.startsAt.toISOString()).toBe(EXPECTED_STARTS_AT.toISOString())

    // Verify: exactly one ORBIT Message in the group feed with correct body
    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    expect(messages).toHaveLength(1)
    messageIds.push(messages[0].id)

    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].body).toMatch(/^Next up:/)
  })

  it("second run is a no-op: returns upcoming_exists and does not create duplicates", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // First run
    const first = await reconcileScheduledEvents(NOW)
    const firstResult = first.find((r) => r.groupId === group.id)
    expect(firstResult?.status).toBe("created")
    if (firstResult?.status === "created") {
      eventIds.push(firstResult.eventId)
    }

    // Collect the message for cleanup
    const messagesAfterFirst = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messagesAfterFirst) messageIds.push(m.id)

    // Second run
    const second = await reconcileScheduledEvents(NOW)
    const secondResult = second.find((r) => r.groupId === group.id)
    expect(secondResult?.status).toBe("skipped")
    expect((secondResult as { status: "skipped"; reason: string })?.reason).toBe("upcoming_exists")

    // Still exactly one Event and one Message — no duplicates
    const eventCount = await prisma.event.count({ where: { groupId: group.id } })
    expect(eventCount).toBe(1)

    const messageCount = await prisma.message.count({ where: { groupId: group.id } })
    expect(messageCount).toBe(1)
  })

  it("no-rhythm group is skipped: no Event or Message created", async () => {
    const { group } = await createTestUserAndGroup(null)

    const results = await reconcileScheduledEvents(NOW)

    const result = results.find((r) => r.groupId === group.id)
    expect(result).toBeDefined()
    expect(result!.status).toBe("skipped")
    expect((result as { status: "skipped"; reason: string }).reason).toBe("no_rhythm")

    // Verify: nothing created
    const eventCount = await prisma.event.count({ where: { groupId: group.id } })
    expect(eventCount).toBe(0)

    const messageCount = await prisma.message.count({ where: { groupId: group.id } })
    expect(messageCount).toBe(0)
  })

  it("group with pre-existing upcoming event is skipped", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // Seed a future event before calling reconcile
    const seeded = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Pre-existing Event",
        startsAt: new Date("2099-01-01T10:00:00Z"),
      },
    })
    eventIds.push(seeded.id)

    const results = await reconcileScheduledEvents(NOW)

    const result = results.find((r) => r.groupId === group.id)
    expect(result).toBeDefined()
    expect(result!.status).toBe("skipped")
    expect((result as { status: "skipped"; reason: string }).reason).toBe("upcoming_exists")

    // Verify: still only the seeded event, no new one, and no spurious announcement
    const eventCount = await prisma.event.count({ where: { groupId: group.id } })
    expect(eventCount).toBe(1)

    const messageCount = await prisma.message.count({ where: { groupId: group.id } })
    expect(messageCount).toBe(0)
  })
})
