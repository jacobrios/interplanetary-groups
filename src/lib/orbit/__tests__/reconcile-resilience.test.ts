// src/lib/orbit/__tests__/reconcile-resilience.test.ts
//
// One group's failure must not take out the rest of the sweep.
//
// This file mocks the database rather than hitting it, deliberately, and it is
// the exception to the repo's integration-test idiom. The reason is the hard
// rule at the top of reconcile.test.ts: an UNSCOPED reconcile against the
// shared dev-test database creates a real event and a real ORBIT announcement
// in every group that has a rhythm, and those leak permanently. Proving "group
// A fails, group B still gets its event" needs more than one group in a single
// sweep, and { groupId } scoping only ever admits one. So the loop's error
// handling is unit-tested with no database at all, and reconcile.test.ts keeps
// covering the real thing, scoped.
//
// parseRhythm and computeNextOccurrence are left REAL. Fewer mocks, and the
// fixture rhythms below are the genuine stored shape.
import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { group: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

const hasUpcoming = vi.fn()
vi.mock("@/lib/events/upcoming-list", () => ({
  hasUpcomingScheduledEvent: (...a: unknown[]) => hasUpcoming(...a),
}))

const createEvent = vi.fn()
vi.mock("@/lib/events/create", () => ({
  createEvent: (...a: unknown[]) => createEvent(...a),
}))

const createMessage = vi.fn()
vi.mock("@/lib/messages/create", () => ({
  createMessage: (...a: unknown[]) => createMessage(...a),
}))

import { reconcileScheduledEvents } from "../reconcile"

const NOW = new Date("2099-01-07T12:00:00.000Z") // a Wednesday

// The genuine stored shape, validated by the REAL parseRhythm: daysOfWeek is
// integers 0=Sun..6=Sat, timeLocal is "HH:mm", and cadence must be exactly
// the lowercase "weekly" (rhythm.ts:82-106). Get any of these wrong and
// parseRhythm returns null, every group comes back "skipped: no_rhythm", and
// the test passes or fails for a reason that has nothing to do with the fix.
function group(id: string) {
  return {
    id,
    timeZone: "UTC",
    recurringActivities: [
      {
        activity: "climbing",
        title: "Climbing",
        daysOfWeek: [0],
        timeLocal: "09:00",
        cadence: "weekly",
      },
    ],
  }
}

describe("reconcileScheduledEvents resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasUpcoming.mockResolvedValue(false)
    createMessage.mockResolvedValue({ id: "msg" })
  })

  it("keeps going when one group's event creation throws", async () => {
    findMany.mockResolvedValue([group("bad"), group("good")])
    createEvent
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly"))
      .mockResolvedValueOnce({ id: "evt-good", startsAt: NOW, title: "Climbing" })

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "good", status: "created" })
    )
    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "bad", status: "failed" })
    )
  })

  it("keeps going when the upcoming-event lookup throws, which runs before the existing guard", async () => {
    findMany.mockResolvedValue([group("bad"), group("good")])
    hasUpcoming
      .mockRejectedValueOnce(new Error("too many connections"))
      .mockResolvedValueOnce(false)
    createEvent.mockResolvedValue({ id: "evt-good", startsAt: NOW, title: "Climbing" })

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "good", status: "created" })
    )
    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "bad", status: "failed" })
    )
  })

  it("still skips a duplicate rather than calling it a failure", async () => {
    findMany.mockResolvedValue([group("dupe")])
    createEvent.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }))

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toEqual([
      { groupId: "dupe", status: "skipped", reason: "duplicate" },
    ])
  })
})
