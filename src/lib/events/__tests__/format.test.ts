// src/lib/events/__tests__/format.test.ts
//
// Pure unit tests — no database, no async.  formatEventDate and formatTime
// render an event's instant in the group's timezone (the required third/second
// argument).  The existing cases pass "UTC" explicitly, so they still exercise
// the same composition logic; non-UTC cases below prove the zone conversion.
import { describe, it, expect } from "vitest"
import { formatEventDate } from "../format"

describe("formatEventDate", () => {
  it("formats a start-only date as 'Weekday, Mon D · Hpm'", () => {
    // 2026-07-19 17:00 UTC is a Sunday
    const result = formatEventDate(new Date("2026-07-19T17:00:00Z"), null, "UTC")
    expect(result).toBe("Sun, Jul 19 · 5pm")
  })

  it("uses three-letter weekday abbreviations", () => {
    // 2026-07-20 is a Monday
    const result = formatEventDate(new Date("2026-07-20T10:00:00Z"), null, "UTC")
    expect(result).toMatch(/^Mon,/)
  })

  it("includes minutes when the time is not on the hour", () => {
    const result = formatEventDate(new Date("2026-07-19T10:30:00Z"), null, "UTC")
    expect(result).toContain("10:30am")
  })

  it("formats am hours correctly", () => {
    const result = formatEventDate(new Date("2026-07-19T10:00:00Z"), null, "UTC")
    expect(result).toContain("10am")
  })

  it("formats noon as 12pm", () => {
    const result = formatEventDate(new Date("2026-07-19T12:00:00Z"), null, "UTC")
    expect(result).toContain("12pm")
  })

  it("formats midnight as 12am", () => {
    const result = formatEventDate(new Date("2026-07-19T00:00:00Z"), null, "UTC")
    expect(result).toContain("12am")
  })

  it("appends 'to endTime' when an endsAt is provided", () => {
    const result = formatEventDate(
      new Date("2026-07-19T17:00:00Z"),
      new Date("2026-07-19T20:00:00Z"),
      "UTC"
    )
    expect(result).toBe("Sun, Jul 19 · 5pm to 8pm")
  })

  it("uses 'to' (no dashes) between start and end — per copy rules", () => {
    const result = formatEventDate(
      new Date("2026-07-19T17:00:00Z"),
      new Date("2026-07-19T20:00:00Z"),
      "UTC"
    )
    expect(result).not.toContain("–")
    expect(result).not.toContain("—")
    expect(result).toContain(" to ")
  })

  it("renders in the group's timezone, shifting the hour (8am Chicago from 13:00 UTC)", () => {
    // 2026-07-19 13:00 UTC = 8am CDT (Chicago, UTC-5 in summer), still Sunday.
    const result = formatEventDate(new Date("2026-07-19T13:00:00Z"), null, "America/Chicago")
    expect(result).toBe("Sun, Jul 19 · 8am")
  })

  it("shifts the weekday and date backward when the group is west of UTC across midnight", () => {
    // 2026-01-12 01:00 UTC = 7pm CST on 2026-01-11 (Chicago, UTC-6). The card
    // must name the LOCAL day (Sun, Jan 11), not the UTC day (Mon, Jan 12).
    const result = formatEventDate(new Date("2026-01-12T01:00:00Z"), null, "America/Chicago")
    expect(result).toBe("Sun, Jan 11 · 7pm")
  })

  it("honors DST: 8am Los Angeles is 15:00 UTC in summer, 16:00 UTC in winter", () => {
    const summer = formatEventDate(new Date("2026-07-19T15:00:00Z"), null, "America/Los_Angeles")
    const winter = formatEventDate(new Date("2026-01-11T16:00:00Z"), null, "America/Los_Angeles")
    expect(summer).toBe("Sun, Jul 19 · 8am")
    expect(winter).toBe("Sun, Jan 11 · 8am")
  })
})
