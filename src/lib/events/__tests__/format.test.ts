// src/lib/events/__tests__/format.test.ts
//
// Pure unit tests — no database, no async.  formatEventDate and formatTime
// are extracted from the inline helpers in events/[id]/page.tsx and shared
// with the compact home-screen card.
import { describe, it, expect } from "vitest"
import { formatEventDate } from "../format"

describe("formatEventDate", () => {
  it("formats a start-only date as 'Weekday, Mon D · Hpm'", () => {
    // 2026-07-19 17:00 UTC is a Sunday
    const result = formatEventDate(new Date("2026-07-19T17:00:00Z"), null)
    expect(result).toBe("Sun, Jul 19 · 5pm")
  })

  it("uses three-letter weekday abbreviations", () => {
    // 2026-07-20 is a Monday
    const result = formatEventDate(new Date("2026-07-20T10:00:00Z"), null)
    expect(result).toMatch(/^Mon,/)
  })

  it("includes minutes when the time is not on the hour", () => {
    const result = formatEventDate(new Date("2026-07-19T10:30:00Z"), null)
    expect(result).toContain("10:30am")
  })

  it("formats am hours correctly", () => {
    const result = formatEventDate(new Date("2026-07-19T10:00:00Z"), null)
    expect(result).toContain("10am")
  })

  it("formats noon as 12pm", () => {
    const result = formatEventDate(new Date("2026-07-19T12:00:00Z"), null)
    expect(result).toContain("12pm")
  })

  it("formats midnight as 12am", () => {
    const result = formatEventDate(new Date("2026-07-19T00:00:00Z"), null)
    expect(result).toContain("12am")
  })

  it("appends 'to endTime' when an endsAt is provided", () => {
    const result = formatEventDate(
      new Date("2026-07-19T17:00:00Z"),
      new Date("2026-07-19T20:00:00Z")
    )
    expect(result).toBe("Sun, Jul 19 · 5pm to 8pm")
  })

  it("uses 'to' (no dashes) between start and end — per copy rules", () => {
    const result = formatEventDate(
      new Date("2026-07-19T17:00:00Z"),
      new Date("2026-07-19T20:00:00Z")
    )
    expect(result).not.toContain("–")
    expect(result).not.toContain("—")
    expect(result).toContain(" to ")
  })
})
