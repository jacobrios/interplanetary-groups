// src/lib/orbit/__tests__/reconcile.test.ts
//
// Integration tests for reconcileScheduledEvents — hits the real dev DB.
// Each test uses a fresh User + Group with a weekly Sunday rhythm in UTC.
//
// EVERY call here is scoped with { groupId }. Do not remove that, and do not
// add an unscoped `reconcileScheduledEvents(NOW)` back.
//
// The dev-test database is shared, and an unscoped sweep does not just read it:
// it CREATES a real event and a real ORBIT announcement in every group that has
// a rhythm, and this file only cleans up rows in its own fixture group. Those
// leak permanently. Because NOW here is in 2099, the leaked events are also
// "upcoming" forever, which then suppresses the real cron for those groups.
//
// This cost something concrete: during the spark part two walkthrough the
// residue put a phantom third card on a QA group's home screen, and it took a
// database query to establish that it was junk rather than a product bug. A
// test that quietly corrupts the evidence a later verification depends on is
// worse than no test (build-notes §11, spark part two follow-up).
//
// The one thing scoping gives up is exercising the loop across many groups. That
// is deliberate: the loop is trivial, the groupId-filter test below covers the
// scoped path, and the only way to exercise the sweep honestly is a database
// nobody else is using.
//
// Cleanup order (FK constraints):
//   Message (groupId) → Rsvp (eventId cascade) → Event (groupId) → Membership (groupId) → Group (founderId) → User

import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor } from "@prisma/client"
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
//   (b) the created Event's startsAt is in the future from NOW, so
//       hasUpcomingScheduledEvent detects it as "upcoming" on the second run of
//       the idempotency test. (Spark part two: that guard reads the injected
//       clock, not the real wall clock, so (b) is now about NOW rather than
//       about today's date.)
// 2099-06-14 is a Sunday.  "now" = 06:00 UTC → next occurrence = 08:00 UTC same day.
const NOW = new Date("2099-06-14T06:00:00Z")
const EXPECTED_STARTS_AT = new Date("2099-06-14T08:00:00Z")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUserAndGroup(recurringActivities: unknown, timeZone = "UTC") {
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
      timeZone,
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
    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

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
    const first = await reconcileScheduledEvents(NOW, { groupId: group.id })
    const firstResult = first.find((r) => r.groupId === group.id)
    expect(firstResult?.status).toBe("created")
    if (firstResult?.status === "created") {
      eventIds.push(firstResult.eventId)
    }

    // Collect the message for cleanup
    const messagesAfterFirst = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messagesAfterFirst) messageIds.push(m.id)

    // Second run
    const second = await reconcileScheduledEvents(NOW, { groupId: group.id })
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

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

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

  it("with a groupId filter, touches only that group", async () => {
    const { user, group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // Second group with the same valid rhythm, cleaned up inside the test
    // (the shared afterEach tracking handles only one group).
    const other = await prisma.group.create({
      data: {
        name: "[TEST] Reconcile Other Group",
        founderId: user.id,
        timeZone: "UTC",
        recurringActivities: SUNDAY_RHYTHM as never,
        memberships: { create: { userId: user.id } },
      },
    })

    try {
      const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

      // Only the filtered group appears in results and gets an event
      expect(results).toHaveLength(1)
      expect(results[0].groupId).toBe(group.id)
      expect(results[0].status).toBe("created")
      if (results[0].status === "created") eventIds.push(results[0].eventId)

      const messages = await prisma.message.findMany({ where: { groupId: group.id } })
      for (const m of messages) messageIds.push(m.id)

      // The other group was not touched
      const otherEvents = await prisma.event.count({ where: { groupId: other.id } })
      expect(otherEvents).toBe(0)
      const otherMessages = await prisma.message.count({ where: { groupId: other.id } })
      expect(otherMessages).toBe(0)
    } finally {
      await prisma.membership.deleteMany({ where: { groupId: other.id } }).catch(() => {})
      await prisma.group.delete({ where: { id: other.id } }).catch(() => {})
    }
  })

  it("renders a non-UTC group's event and announcement both in group time (no divergence)", async () => {
    // Los Angeles is UTC-7 in summer. A Sunday-8am rhythm must produce an event
    // at 15:00 UTC (8am PDT, still Sunday there) AND an announcement that says
    // "Sun at 8am". The zone is deliberately not the test machine's own zone,
    // so a reconcile that dropped the argument (rendering the announcement in
    // the machine's local zone) would produce a different hour and fail here.
    // This is the card/announcement divergence the slice prevents.
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM, "America/Los_Angeles")

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("created")
    if (results[0].status !== "created") throw new Error("narrowing")
    eventIds.push(results[0].eventId)

    const event = await prisma.event.findUnique({ where: { id: results[0].eventId } })
    // 2099-06-14 08:00 America/Los_Angeles (PDT, UTC-7) = 15:00 UTC.
    expect(event!.startsAt.toISOString()).toBe("2099-06-14T15:00:00.000Z")

    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    expect(messages).toHaveLength(1)
    messageIds.push(messages[0].id)
    expect(messages[0].body).toBe("Next up: climbing Sun at 8am. RSVP up top.")
  })

  it("snapshots the rhythm's venueName into a Venue row ({name} only)", async () => {
    const { group } = await createTestUserAndGroup([
      { ...SUNDAY_RHYTHM[0], venueName: "Summit Gym" },
    ])

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("created")
    if (results[0].status !== "created") throw new Error("narrowing")
    eventIds.push(results[0].eventId)

    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messages) messageIds.push(m.id)

    // Venue rows cascade-delete with their Event, so eventIds cleanup covers them.
    const venue = await prisma.venue.findFirst({ where: { eventId: results[0].eventId } })
    expect(venue).not.toBeNull()
    expect(venue!.name).toBe("Summit Gym")
    expect(venue!.displayLabel).toBeNull()
    expect(venue!.address).toBeNull()
    expect(venue!.url).toBeNull()
  })

  // Regression pin, not a TDD test: this passes before the reconcile change
  // (no venue is ever created today) and can only fail if the change
  // over-reaches, e.g. by always passing a venue object. That is exactly
  // what it guards: the no-venue flow stays byte-identical at the DB level.
  it("a rhythm without venueName creates no Venue row (no-venue flow unchanged)", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("created")
    if (results[0].status !== "created") throw new Error("narrowing")
    eventIds.push(results[0].eventId)

    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messages) messageIds.push(m.id)

    const venueCount = await prisma.venue.count({ where: { eventId: results[0].eventId } })
    expect(venueCount).toBe(0)
  })

  it("group with pre-existing upcoming SCHEDULED event is skipped", async () => {
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // Seed a future SCHEDULED event before calling reconcile. Two details this
    // test had to gain in spark part two, both deliberate:
    //   - a scheduledKey, because only the schedule's own rows now count as
    //     evidence the schedule has run (a sparked row must not block it), and
    //   - a startsAt after NOW rather than 2099-01-01, because the guard now
    //     reads the injected clock instead of the real wall clock. Under the old
    //     wall-clock comparison a January 2099 event was "upcoming" while the
    //     test's own now said June.
    const seeded = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Pre-existing Event",
        startsAt: new Date("2099-07-01T10:00:00Z"),
        scheduledKey: `${group.id}:2099-07-01T10:00:00.000Z`,
      },
    })
    eventIds.push(seeded.id)

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

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

  it("does not recreate an occurrence the group called off", async () => {
    // The whole reason cancel sets a status instead of deleting the row.
    // Without the retained row this sweep would schedule the same slot again
    // and announce it, within the hour, undoing the cancellation nobody asked
    // to undo.
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    const scheduledEvent = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Called-off Occurrence",
        startsAt: new Date("2099-07-01T10:00:00Z"),
        scheduledKey: `${group.id}:2099-07-01T10:00:00.000Z`,
      },
    })
    eventIds.push(scheduledEvent.id)

    await prisma.event.update({
      where: { id: scheduledEvent.id },
      data: { status: EventStatus.CANCELLED, cancelledAt: new Date() },
    })

    const messagesBefore = await prisma.message.count({ where: { groupId: group.id } })

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })
    for (const r of results) if (r.status === "created") eventIds.push(r.eventId)

    const events = await prisma.event.findMany({ where: { groupId: group.id } })
    for (const e of events) if (!eventIds.includes(e.id)) eventIds.push(e.id)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe(EventStatus.CANCELLED)

    const allMessages = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of allMessages) if (!messageIds.includes(m.id)) messageIds.push(m.id)
    expect(allMessages).toHaveLength(messagesBefore)
  })

  it("still schedules the standing rhythm when a sparked event is upcoming", async () => {
    // The bug this slice had to fix: the old guard counted any upcoming event,
    // so a sparked beers night on Friday suppressed Sunday's climb entirely.
    // Nothing about that failure was visible until someone noticed a missing
    // card, which is why it gets a test rather than an assertion.
    const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

    // A sparked event: carries a gaugeId, and sits in the future. The gaugeId is
    // what the guard keys off, so a fixture without one is not a sparked event.
    const src = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.MEMBER, authorId: userId!, body: "beers?" },
    })
    const orbitMsg = await prisma.message.create({
      data: { groupId: group.id, authorType: MessageAuthor.ORBIT, authorId: null, body: "Anyone in for beers?" },
    })
    messageIds.push(src.id, orbitMsg.id)
    const gauge = await prisma.gauge.create({
      data: {
        groupId: group.id,
        sourceMessageId: src.id,
        orbitMessageId: orbitMsg.id,
        activity: "beers",
        proposedDate: new Date("2099-06-19T00:00:00Z"),
        proposedTime: "19:00",
      },
    })
    const sparked = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Sparked Beers",
        startsAt: new Date("2099-06-19T19:00:00Z"),
        gaugeId: gauge.id,
      },
    })
    eventIds.push(sparked.id)

    const results = await reconcileScheduledEvents(NOW, { groupId: group.id })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("created")
    if (results[0].status === "created") eventIds.push(results[0].eventId)

    const messages = await prisma.message.findMany({ where: { groupId: group.id } })
    for (const m of messages) messageIds.push(m.id)

    // Exactly one scheduled event, beside the sparked one that did not block it.
    expect(
      await prisma.event.count({ where: { groupId: group.id, scheduledKey: { not: null } } })
    ).toBe(1)
    expect(await prisma.event.count({ where: { groupId: group.id } })).toBe(2)
  })

  describe("a moved occurrence relocates its slot rather than freeing it", () => {
    it("skips recreating the original slot after a moved-earlier event has passed, then heals the following week", async () => {
      const { group } = await createTestUserAndGroup(SUNDAY_RHYTHM)

      // Cron creates Sunday 08:00 with its scheduledKey.
      const first = await reconcileScheduledEvents(NOW, { groupId: group.id })
      expect(first[0].status).toBe("created")
      const event = await prisma.event.findFirst({ where: { groupId: group.id } })
      if (!event) throw new Error("expected the scheduled event")
      eventIds.push(event.id)

      // The group moves it a day earlier (Saturday 08:00). Key untouched: a
      // move relocates the occurrence, it does not free the slot.
      const movedTo = new Date(EXPECTED_STARTS_AT.getTime() - 24 * 60 * 60 * 1000)
      await prisma.event.update({
        where: { id: event.id },
        data: { startsAt: movedTo, previousStartsAt: event.startsAt },
      })

      // Saturday has passed, Sunday 08:00 has not. The cron computes the next
      // occurrence (Sunday 08:00), collides with the stale key, and skips.
      // That skip is the product behavior: this occurrence already happened,
      // on its moved time.
      const betweenNow = new Date(movedTo.getTime() + 2 * 60 * 60 * 1000)
      const second = await reconcileScheduledEvents(betweenNow, { groupId: group.id })
      expect(second[0]).toEqual({ groupId: group.id, status: "skipped", reason: "duplicate" })

      // The following week heals itself: a fresh slot, a fresh key.
      const afterSunday = new Date(EXPECTED_STARTS_AT.getTime() + 60 * 60 * 1000)
      const third = await reconcileScheduledEvents(afterSunday, { groupId: group.id })
      expect(third[0].status).toBe("created")
      const events = await prisma.event.findMany({ where: { groupId: group.id } })
      for (const e of events) if (!eventIds.includes(e.id)) eventIds.push(e.id)
      const messages = await prisma.message.findMany({ where: { groupId: group.id } })
      for (const m of messages) if (!messageIds.includes(m.id)) messageIds.push(m.id)
      expect(events).toHaveLength(2)
      const nextWeek = new Date(EXPECTED_STARTS_AT.getTime() + 7 * 24 * 60 * 60 * 1000)
      expect(events.map((e) => e.startsAt.getTime()).sort()).toEqual(
        [movedTo.getTime(), nextWeek.getTime()].sort()
      )
    })
  })
})
