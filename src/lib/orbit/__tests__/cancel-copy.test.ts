// Pure copy tests: no database, no model call, no clock of their own.
import { describe, it, expect } from "vitest"
import { buildCancelAnnouncement, buildRestoreAnnouncement } from "../cancel-copy"

const TZ = "America/New_York"
// A Tuesday. NOW is the Sunday two days before, so whenPhrase renders
// "this Tue" rather than the dated form.
const START = new Date("2026-09-08T23:00:00Z")
const NOW = new Date("2026-09-06T15:00:00Z")

describe("buildCancelAnnouncement", () => {
  it("leads with the capitalized label and state, names who, and points up top", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Tennis this Tue is OFF. Sam called it off. Anyone can put it back on, tap the plan up top."
    )
  })

  it("uses the dated phrasing for a plan more than a week out", () => {
    const farOff = new Date("2026-09-22T23:00:00Z")
    const body = buildCancelAnnouncement("Sam", "tennis", farOff, TZ, NOW)
    expect(body).toContain("on Tue, Sep 22")
  })

  it("capitalizes the label at the start of the sentence", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body.startsWith("Tennis")).toBe(true)
  })

  it("carries no em dash or en dash", () => {
    const body = buildCancelAnnouncement("Sam", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})

describe("buildRestoreAnnouncement", () => {
  it("leads with the capitalized label and state, names who, and says RSVPs are unchanged", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).toBe(
      "Tennis this Tue is back ON. Jordan put it back, and everyone's RSVPs are the same as before."
    )
  })

  it("capitalizes the label at the start of the sentence", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body.startsWith("Tennis")).toBe(true)
  })

  it("carries no em dash or en dash", () => {
    const body = buildRestoreAnnouncement("Jordan", "tennis", START, TZ, NOW)
    expect(body).not.toMatch(/[–—]/)
  })
})
