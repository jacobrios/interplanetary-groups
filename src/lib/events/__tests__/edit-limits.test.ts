// src/lib/events/__tests__/edit-limits.test.ts
//
// Pure tests, no database. See edit-limits.ts for the reasoning behind the
// limit itself.

import { describe, it, expect } from "vitest"
import { checkEditedStart } from "../edit-limits"

const RHYTHM = [
  { activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00" },
]
const SAT = new Date("2099-06-13T09:00:00Z")
const NEXT_SAT = new Date("2099-06-20T09:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")
const rhythmEvent = { startsAt: SAT, gaugeId: null, scheduledKey: `g1:${SAT.toISOString()}` }

describe("checkEditedStart", () => {
  it("fixture sanity: SAT is a Saturday", () => {
    expect(SAT.getUTCDay()).toBe(6)
  })

  it("refuses a time before now", () => {
    const proposedStartsAt = new Date("2099-06-09T09:00:00Z")
    const result = checkEditedStart({
      event: rhythmEvent,
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: false, reason: "past" })
  })

  it("refuses a time before now for a floated plan too", () => {
    const proposedStartsAt = new Date("2099-06-09T09:00:00Z")
    const result = checkEditedStart({
      event: { startsAt: SAT, gaugeId: "g1", scheduledKey: null },
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: false, reason: "past" })
  })

  it("allows moving Saturday to Sunday of the same week", () => {
    const proposedStartsAt = new Date("2099-06-14T09:00:00Z")
    const result = checkEditedStart({
      event: rhythmEvent,
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: true })
  })

  it("refuses moving exactly to the next regular slot", () => {
    const result = checkEditedStart({
      event: rhythmEvent,
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt: NEXT_SAT,
      now: NOW,
    })
    expect(result).toEqual({
      ok: false,
      reason: "past_next_occurrence",
      nextOccurrence: NEXT_SAT,
    })
  })

  it("allows moving to the Friday before the next regular slot", () => {
    const proposedStartsAt = new Date("2099-06-19T09:00:00Z")
    const result = checkEditedStart({
      event: rhythmEvent,
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: true })
  })

  it("has no limit for a floated plan, even moved three weeks out", () => {
    const proposedStartsAt = new Date("2099-07-04T09:00:00Z")
    const result = checkEditedStart({
      event: { startsAt: SAT, gaugeId: "x", scheduledKey: null },
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: true })
  })

  it("measures the limit from the original slot, not a plan already moved once", () => {
    const SUN = new Date("2099-06-14T09:00:00Z")
    const alreadyMovedEvent = {
      startsAt: SUN,
      gaugeId: null,
      scheduledKey: `g1:${SAT.toISOString()}`,
    }
    const result = checkEditedStart({
      event: alreadyMovedEvent,
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt: NEXT_SAT,
      now: NOW,
    })
    expect(result).toEqual({
      ok: false,
      reason: "past_next_occurrence",
      nextOccurrence: NEXT_SAT,
    })
  })

  it("has no limit for a group with no parseable rhythm", () => {
    const proposedStartsAt = new Date("2099-07-04T09:00:00Z")
    const result = checkEditedStart({
      event: rhythmEvent,
      recurringActivities: [],
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({ ok: true })
  })

  it("falls back to startsAt when the scheduledKey tail is not a date", () => {
    const proposedStartsAt = NEXT_SAT
    const result = checkEditedStart({
      event: { startsAt: SAT, gaugeId: null, scheduledKey: "g1:not-a-date" },
      recurringActivities: RHYTHM,
      timeZone: "UTC",
      proposedStartsAt,
      now: NOW,
    })
    expect(result).toEqual({
      ok: false,
      reason: "past_next_occurrence",
      nextOccurrence: NEXT_SAT,
    })
  })
})
