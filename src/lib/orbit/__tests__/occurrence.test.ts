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

  it("multi-day rhythm picks nearest: Mon+Wed, after Tuesday → next is Wednesday", () => {
    const mwRhythm: GroupRhythm = { ...SUNDAY_RHYTHM, daysOfWeek: [1, 3] } // Mon=1, Wed=3
    const after2 = new Date("2026-07-14T12:00:00Z") // Tuesday noon UTC = Tuesday 5am PDT
    const result = computeNextOccurrence(mwRhythm, "America/Los_Angeles", after2)
    // Next Wed in LA is 2026-07-15, 8am PDT = 15:00 UTC
    expect(result.toISOString()).toBe("2026-07-15T15:00:00.000Z")
  })
})
