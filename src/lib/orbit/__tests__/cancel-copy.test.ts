// Pure copy tests: no database, no model call, no clock of their own.
import { describe, it, expect } from "vitest"
import { buildCancelAnnouncement, buildRestoreAnnouncement } from "../cancel-copy"

const TZ = "America/New_York"
// A Tuesday. NOW is the Sunday two days before, so whenPhrase renders
// "this Tue" rather than the dated form.
const START = new Date("2026-09-08T23:00:00Z")
const NOW = new Date("2026-09-06T15:00:00Z")

describe("buildCancelAnnouncement", () => {
  it("names the person, the activity, and when, and points at the undo", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Sam called off tennis this Tue. If that's not right, anyone can put it back on the plan's page."
    )
  })

  it("uses the dated phrasing for a plan more than a week out", () => {
    const farOff = new Date("2026-09-22T23:00:00Z")
    const body = buildCancelAnnouncement("Sam", "tennis", farOff, TZ, NOW)
    expect(body).toContain("on Tue, Sep 22")
  })

  it("carries no em dash or en dash", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})

describe("buildRestoreAnnouncement", () => {
  it("names the person and says the RSVPs are unchanged", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Jordan put tennis this Tue back on. Everyone's RSVPs are the same as before."
    )
  })

  it("carries no em dash or en dash", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})
