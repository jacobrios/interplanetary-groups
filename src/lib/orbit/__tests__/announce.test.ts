// src/lib/orbit/__tests__/announce.test.ts
//
// Pure unit tests — no database, no async. buildAnnouncement generates
// deterministic, structured-extract-then-format feed copy from an event
// and rhythm (per CLAUDE.md §7 and build-notes §7).

import { describe, it, expect } from "vitest"
import { buildAnnouncement } from "../announce"

const BASE_RHYTHM = {
  activity: "climbing",
}

describe("buildAnnouncement", () => {
  it("generates deterministic output for the same inputs", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result1 = buildAnnouncement(event, rhythm)
    const result2 = buildAnnouncement(event, rhythm)
    expect(result1).toBe(result2)
  })

  it("includes 3-letter weekday abbreviation (e.g. 'Sun' not 'Sunday')", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") } // Sunday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("Sun")
    expect(result).not.toContain("Sunday")
  })

  it("contains no em-dash character (—)", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).not.toContain("—")
  })

  it("uses soft, warm voice: contains 'Next up' and 'RSVP'", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("Next up")
    expect(result).toContain("RSVP")
  })

  it("includes the activity from rhythm (lowercased)", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = { activity: "climbing" }
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("climbing")
  })

  it("formats time correctly (e.g. '8am' not '08:00')", () => {
    const event = { startsAt: new Date("2026-07-19T08:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("8am")
    expect(result).not.toContain("08:00")
  })

  it("works for Sunday", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") } // Sunday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("Sun")
    expect(result).toMatch(/Next up: climbing Sun at \d{1,2}/)
  })

  it("works for Monday", () => {
    const event = { startsAt: new Date("2026-07-20T13:00:00Z") } // Monday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("Mon")
    expect(result).toMatch(/Next up: climbing Mon at \d{1,2}/)
  })

  it("handles times with minutes (e.g. '9:30am')", () => {
    const event = { startsAt: new Date("2026-07-19T09:30:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("9:30am")
  })

  it("works for Wednesday", () => {
    const event = { startsAt: new Date("2026-07-22T13:00:00Z") } // Wednesday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("Wed")
  })

  it("works for afternoon times", () => {
    const event = { startsAt: new Date("2026-07-19T14:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("2pm")
  })

  it("produces expected format: 'Next up: climbing Sun at 8am. RSVP up top.'", () => {
    const event = { startsAt: new Date("2026-07-19T08:00:00Z") } // Sunday at 8am UTC
    const rhythm = { activity: "climbing" }
    const result = buildAnnouncement(event, rhythm)
    expect(result).toBe("Next up: climbing Sun at 8am. RSVP up top.")
  })

  it("uses the activity from rhythm unchanged when already lowercase", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = { activity: "running" }
    const result = buildAnnouncement(event, rhythm)
    expect(result).toContain("running")
  })

  it("ends with a period after 'RSVP up top'", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm)
    expect(result).toMatch(/RSVP up top\./)
  })
})
