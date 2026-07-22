// src/lib/orbit/__tests__/occurrence.test.ts
//
// Correctness tests for zonedWallTimeToUtc and computeNextOccurrence.
// No external dependencies — only native Intl and Date.

import { describe, it, expect } from "vitest"
import { zonedWallTimeToUtc, computeNextOccurrence } from "../occurrence"
import type { GroupRhythm } from "../rhythm"

const SUNDAY_RHYTHM: GroupRhythm = {
  activity: "climbing",
  title: "Climbing Sunday",
  daysOfWeek: [0],
  timeLocal: "08:00",
  cadence: "weekly",
}

describe("zonedWallTimeToUtc", () => {
  it("converts 2026-07-12 8am PDT (UTC-7) to 15:00 UTC", () => {
    const d = zonedWallTimeToUtc(2026, 7, 12, 8, 0, "America/Los_Angeles")
    expect(d.toISOString()).toBe("2026-07-12T15:00:00.000Z")
  })

  it("converts 2026-11-15 8am PST (UTC-8) to 16:00 UTC", () => {
    const d2 = zonedWallTimeToUtc(2026, 11, 15, 8, 0, "America/Los_Angeles")
    expect(d2.toISOString()).toBe("2026-11-15T16:00:00.000Z")
  })

  // Early-morning wall times below the zone's offset magnitude. On the old
  // (hour-delta-only) offset math these returned the right wall time on the
  // WRONG (previous) local day; the date-inclusive offset fixes them. The
  // measured failure envelope is: local hour < |UTC offset|. These cases sit
  // at and below that boundary for each zone, in both DST states.
  describe("day-boundary: early-morning wall times in negative-offset zones", () => {
    it("7am PST (UTC-8), below the boundary, stays on the same local day → 15:00 UTC", () => {
      // 2026-01-12 is a Monday; the event must be Monday, not Sunday.
      const d = zonedWallTimeToUtc(2026, 1, 12, 7, 0, "America/Los_Angeles")
      expect(d.toISOString()).toBe("2026-01-12T15:00:00.000Z")
    })

    it("7am PDT (UTC-7), below the boundary (summer) → 14:00 UTC same day", () => {
      const d = zonedWallTimeToUtc(2026, 7, 13, 7, 0, "America/Los_Angeles")
      expect(d.toISOString()).toBe("2026-07-13T14:00:00.000Z")
    })

    it("6am AKST (UTC-9), below the boundary → 15:00 UTC same day", () => {
      const d = zonedWallTimeToUtc(2026, 1, 12, 6, 0, "America/Anchorage")
      expect(d.toISOString()).toBe("2026-01-12T15:00:00.000Z")
    })

    it("8am AKDT (UTC-8), below the boundary (summer) → 16:00 UTC same day", () => {
      const d = zonedWallTimeToUtc(2026, 7, 13, 8, 0, "America/Anchorage")
      expect(d.toISOString()).toBe("2026-07-13T16:00:00.000Z")
    })

    it("9am HST (UTC-10), below the boundary → 19:00 UTC same day", () => {
      // Honolulu observes no DST; UTC-10 year-round.
      const d = zonedWallTimeToUtc(2026, 1, 12, 9, 0, "Pacific/Honolulu")
      expect(d.toISOString()).toBe("2026-01-12T19:00:00.000Z")
    })

    it("5am CST (UTC-6), below the boundary → 11:00 UTC same day", () => {
      const d = zonedWallTimeToUtc(2026, 1, 12, 5, 0, "America/Chicago")
      expect(d.toISOString()).toBe("2026-01-12T11:00:00.000Z")
    })

    it("5am CDT (UTC-5), below the boundary (summer) → 10:00 UTC same day", () => {
      const d = zonedWallTimeToUtc(2026, 7, 13, 5, 0, "America/Chicago")
      expect(d.toISOString()).toBe("2026-07-13T10:00:00.000Z")
    })
  })
})

describe("computeNextOccurrence", () => {
  it("PDT (UTC-7, summer): Sunday 8am LA = 15:00 UTC", () => {
    // 2026-07-12 is a Sunday; PDT is UTC-7
    const after = new Date("2026-07-11T00:00:00Z") // Saturday
    const result = computeNextOccurrence(SUNDAY_RHYTHM, "America/Los_Angeles", after)
    expect(result.toISOString()).toBe("2026-07-12T15:00:00.000Z") // 8am PDT = 15:00 UTC
  })

  it("PST (UTC-8, winter): Sunday 8am LA = 16:00 UTC", () => {
    // 2026-11-15 is a Sunday; PST is UTC-8 (DST ended Nov 1)
    const after = new Date("2026-11-14T00:00:00Z") // Saturday
    const result = computeNextOccurrence(SUNDAY_RHYTHM, "America/Los_Angeles", after)
    expect(result.toISOString()).toBe("2026-11-15T16:00:00.000Z") // 8am PST = 16:00 UTC
  })

  it("UTC passthrough: wall time equals UTC instant", () => {
    // UTC zone: wall time = UTC instant.
    // after is 8:01am on Sunday 2026-07-12 — just past the 8am slot — so the
    // next valid occurrence is the following Sunday (2026-07-19) at 8am UTC.
    const after = new Date("2026-07-12T08:01:00Z")
    const result = computeNextOccurrence(SUNDAY_RHYTHM, "UTC", after)
    expect(result.toISOString()).toBe("2026-07-19T08:00:00.000Z") // next Sunday 8am UTC
  })

  it("strictly after — same day already past: returns NEXT Sunday", () => {
    // It's already Sunday 9:01am in LA — next occurrence is NEXT Sunday, not today
    const after = new Date("2026-07-12T16:01:00Z") // 9:01am PDT (past the 8am slot)
    const result = computeNextOccurrence(SUNDAY_RHYTHM, "America/Los_Angeles", after)
    expect(result.toISOString()).toBe("2026-07-19T15:00:00.000Z") // next Sunday PDT
  })

  it("archetype: a Monday-7am Pacific rhythm lands on Monday, not the Sunday before", () => {
    // The failure the fold-in prevents: 7am is below LA's winter offset (8), so
    // the old conversion returned Monday's 7am wall time stamped on Sunday.
    const monday7am: GroupRhythm = {
      activity: "climbing",
      title: "Climbing Monday",
      daysOfWeek: [1], // Monday
      timeLocal: "07:00",
      cadence: "weekly",
    }
    // 2026-01-12 is a Monday. Ask from the preceding Thursday.
    const after = new Date("2026-01-08T12:00:00Z")
    const result = computeNextOccurrence(monday7am, "America/Los_Angeles", after)
    // 7am PST (UTC-8) on Monday 2026-01-12 = 15:00 UTC, and it must be a Monday.
    expect(result.toISOString()).toBe("2026-01-12T15:00:00.000Z")
    const weekdayInLA = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "America/Los_Angeles",
    }).format(result)
    expect(weekdayInLA).toBe("Mon")
  })

  it("multi-day rhythm picks nearest: Mon+Wed, after Tuesday → next is Wednesday", () => {
    const mwRhythm: GroupRhythm = { ...SUNDAY_RHYTHM, daysOfWeek: [1, 3] } // Mon=1, Wed=3
    const after2 = new Date("2026-07-14T12:00:00Z") // Tuesday noon UTC = Tuesday 5am PDT
    const result = computeNextOccurrence(mwRhythm, "America/Los_Angeles", after2)
    // Next Wed in LA is 2026-07-15, 8am PDT = 15:00 UTC
    expect(result.toISOString()).toBe("2026-07-15T15:00:00.000Z")
  })
})
