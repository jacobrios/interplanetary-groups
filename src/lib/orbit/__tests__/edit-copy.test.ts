// Pure copy tests: no database, no model call, no clock of their own.
import { describe, it, expect } from "vitest"
import { buildEditAnnouncement, EDIT_REVERT_LINE, type DetailChange } from "../edit-copy"

const TZ = "America/New_York"
// A Friday. NOW is the Wednesday two days before, so whenPhrase renders
// "this Fri" rather than the dated form.
const START = new Date("2026-09-11T23:00:00Z")
const NOW = new Date("2026-09-09T15:00:00Z")

describe("buildEditAnnouncement", () => {
  it("fixture: START falls on a Friday and NOW two days before it", () => {
    expect(START.toLocaleString("en-US", { timeZone: TZ, weekday: "long" })).toBe("Friday")
    expect(NOW.toLocaleString("en-US", { timeZone: TZ, weekday: "long" })).toBe("Wednesday")
  })

  it("place changed", () => {
    const change: DetailChange = { place: { from: "Rusty Anchor", to: "Sam's place" } }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam changed the spot for Beers this Fri, from Rusty Anchor to Sam's place. Anyone can change it back on the plan's page."
    )
  })

  it("place added", () => {
    const change: DetailChange = { place: { from: null, to: "Sam's place" } }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe("Sam set the spot for Beers this Fri: Sam's place.")
  })

  it("place cleared", () => {
    const change: DetailChange = { place: { from: "Rusty Anchor", to: null } }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam removed the spot for Beers this Fri (it was Rusty Anchor). Anyone can change it back on the plan's page."
    )
  })

  it("renamed", () => {
    const change: DetailChange = { title: { from: "Beers", to: "Pool at Sam's" } }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam renamed Beers this Fri to Pool at Sam's. Anyone can change it back on the plan's page."
    )
  })

  it("renamed and place changed", () => {
    const change: DetailChange = {
      title: { from: "Beers", to: "Pool at Sam's" },
      place: { from: "Rusty Anchor", to: "Sam's place" },
    }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam renamed Beers this Fri to Pool at Sam's, and changed the spot from Rusty Anchor to Sam's place. Anyone can change it back on the plan's page."
    )
  })

  it("renamed and place added", () => {
    const change: DetailChange = {
      title: { from: "Beers", to: "Pool at Sam's" },
      place: { from: null, to: "Sam's place" },
    }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam renamed Beers this Fri to Pool at Sam's, and set the spot: Sam's place. Anyone can change it back on the plan's page."
    )
  })

  it("renamed and place cleared", () => {
    const change: DetailChange = {
      title: { from: "Beers", to: "Pool at Sam's" },
      place: { from: "Rusty Anchor", to: null },
    }
    const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
    expect(body).toBe(
      "Sam renamed Beers this Fri to Pool at Sam's, and removed the spot (it was Rusty Anchor). Anyone can change it back on the plan's page."
    )
  })

  it("carries no em dash or en dash in any shape", () => {
    const shapes: DetailChange[] = [
      { place: { from: "Rusty Anchor", to: "Sam's place" } },
      { place: { from: null, to: "Sam's place" } },
      { place: { from: "Rusty Anchor", to: null } },
      { title: { from: "Beers", to: "Pool at Sam's" } },
      { title: { from: "Beers", to: "Pool at Sam's" }, place: { from: "Rusty Anchor", to: "Sam's place" } },
      { title: { from: "Beers", to: "Pool at Sam's" }, place: { from: null, to: "Sam's place" } },
      { title: { from: "Beers", to: "Pool at Sam's" }, place: { from: "Rusty Anchor", to: null } },
    ]
    for (const change of shapes) {
      const body = buildEditAnnouncement("Sam", "Beers", change, START, TZ, NOW)
      expect(body).not.toMatch(/[–—]/)
    }
  })

  it("throws on an empty DetailChange, a caller bug rather than a feed line", () => {
    expect(() => buildEditAnnouncement("Sam", "Beers", {}, START, TZ, NOW)).toThrow()
  })

  it("exports the revert line verbatim", () => {
    expect(EDIT_REVERT_LINE).toBe("Anyone can change it back on the plan's page.")
  })
})
