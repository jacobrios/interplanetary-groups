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
    const result1 = buildAnnouncement(event, rhythm, "UTC")
    const result2 = buildAnnouncement(event, rhythm, "UTC")
    expect(result1).toBe(result2)
  })

  it("includes 3-letter weekday abbreviation (e.g. 'Sun' not 'Sunday')", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") } // Sunday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("Sun")
    expect(result).not.toContain("Sunday")
  })

  it("contains no em-dash character (—)", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).not.toContain("—")
  })

  it("uses soft, warm voice: contains 'Next up' and 'RSVP'", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("Next up")
    expect(result).toContain("RSVP")
  })

  it("includes the activity from rhythm (lowercased)", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = { activity: "climbing" }
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("climbing")
  })

  it("formats time correctly (e.g. '8am' not '08:00')", () => {
    const event = { startsAt: new Date("2026-07-19T08:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("8am")
    expect(result).not.toContain("08:00")
  })

  it("works for Sunday", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") } // Sunday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("Sun")
    expect(result).toMatch(/Next up: climbing Sun at \d{1,2}/)
  })

  it("works for Monday", () => {
    const event = { startsAt: new Date("2026-07-20T13:00:00Z") } // Monday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("Mon")
    expect(result).toMatch(/Next up: climbing Mon at \d{1,2}/)
  })

  it("handles times with minutes (e.g. '9:30am')", () => {
    const event = { startsAt: new Date("2026-07-19T09:30:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("9:30am")
  })

  it("works for Wednesday", () => {
    const event = { startsAt: new Date("2026-07-22T13:00:00Z") } // Wednesday
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("Wed")
  })

  it("works for afternoon times", () => {
    const event = { startsAt: new Date("2026-07-19T14:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("2pm")
  })

  it("produces expected format: 'Next up: climbing Sun at 8am. RSVP up top.'", () => {
    const event = { startsAt: new Date("2026-07-19T08:00:00Z") } // Sunday at 8am UTC
    const rhythm = { activity: "climbing" }
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toBe("Next up: climbing Sun at 8am. RSVP up top.")
  })

  it("uses the activity from rhythm unchanged when already lowercase", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = { activity: "running" }
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toContain("running")
  })

  it("ends with a period after 'RSVP up top'", () => {
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const rhythm = BASE_RHYTHM
    const result = buildAnnouncement(event, rhythm, "UTC")
    expect(result).toMatch(/RSVP up top\./)
  })

  it("renders the weekday and time in the group's timezone, not UTC", () => {
    // 2026-07-19 13:00 UTC = 8am CDT (Chicago, UTC-5 in summer), still Sunday.
    const event = { startsAt: new Date("2026-07-19T13:00:00Z") }
    const result = buildAnnouncement(event, { activity: "climbing" }, "America/Chicago")
    expect(result).toBe("Next up: climbing Sun at 8am. RSVP up top.")
  })

  it("names the LOCAL day when it diverges from the UTC day (the anti-divergence guard)", () => {
    // 2026-07-19 01:00 UTC is a Sunday, but in Chicago (UTC-5) it is 8pm on
    // Saturday 2026-07-18. The announcement must say Sat 8pm — the same local
    // day the pinned card shows — so card and announcement never contradict.
    const event = { startsAt: new Date("2026-07-19T01:00:00Z") }
    const result = buildAnnouncement(event, { activity: "climbing" }, "America/Chicago")
    expect(result).toBe("Next up: climbing Sat at 8pm. RSVP up top.")
  })
})
