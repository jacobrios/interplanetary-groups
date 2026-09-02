// src/lib/digest/__tests__/cancellations.test.ts
//
// Pure: rows in, decided lines out. No Prisma, no clock of its own.
import { describe, it, expect } from "vitest"
import { deriveCancellations } from "../cancellations"

const TZ = "America/New_York"
const NOW = new Date("2026-09-06T15:00:00Z")
const JOINED = new Date("2026-08-01T00:00:00Z")

function row(over: Partial<Parameters<typeof deriveCancellations>[0]["events"][0]> = {}) {
  return {
    id: "e1",
    title: "Tennis",
    activityLabel: "tennis",
    startsAt: new Date("2026-09-08T23:00:00Z"),
    cancelledAt: new Date("2026-09-06T12:00:00Z"),
    ...over,
  }
}

describe("deriveCancellations", () => {
  it("reports a cancellation the member has not seen", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T09:00:00Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([{ title: "Tennis", whenLine: "this Tue" }])
  })

  it("says nothing about a cancellation the member already saw", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T14:00:00Z"),
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("uses the later of the visit and the last email as the read position", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: new Date("2026-09-06T09:00:00Z"),
      lastDigestSentAt: new Date("2026-09-06T14:00:00Z"),
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("falls back to the join time when the member has neither", () => {
    const lines = deriveCancellations({
      events: [row()],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toHaveLength(1)
  })

  it("ignores a row carrying no cancelledAt", () => {
    const lines = deriveCancellations({
      events: [row({ cancelledAt: null })],
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: JOINED,
      timeZone: TZ,
      now: NOW,
    })
    expect(lines).toEqual([])
  })

  it("caps at three, newest first", () => {
    const events = [1, 2, 3, 4, 5].map((n) =>
      row({
        id: `e${n}`,
        title: `Game ${n}`,
        cancelledAt: new Date(`2026-09-0${n}T12:00:00Z`),
      })
    )
    const lines = deriveCancellations({
      events,
      lastSeenAt: null,
      lastDigestSentAt: null,
      joinedAt: new Date("2026-08-01T00:00:00Z"),
      timeZone: TZ,
      now: NOW,
    })
    expect(lines.map((l) => l.title)).toEqual(["Game 5", "Game 4", "Game 3"])
  })
})
