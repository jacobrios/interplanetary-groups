// src/lib/orbit/__tests__/main-activity.test.ts
//
// Pure unit tests — no database, no async. splitMainActivity picks the one
// rhythm onboarding stores (position zero) out of the founder's full list
// and names the rest, which are never stored as rhythms.

import { describe, it, expect } from "vitest"
import { splitMainActivity } from "../main-activity"
import type { StoredRhythm } from "../rhythm"

describe("splitMainActivity", () => {
  const r = (activity: string): StoredRhythm => ({
    activity,
    title: "x",
    cadence: null,
    daysOfWeek: null,
    timeLocal: null,
  })

  it("empty in, empty out", () => {
    expect(splitMainActivity([])).toEqual({ rhythms: [], otherActivities: [] })
  })

  it("a single rhythm has no other activities", () => {
    expect(splitMainActivity([r("climbing")])).toEqual({
      rhythms: [r("climbing")],
      otherActivities: [],
    })
  })

  it("keeps only the main rhythm, and lists the rest as names", () => {
    const result = splitMainActivity([r("climbing"), r("beers"), r("board games")])
    expect(result.rhythms).toEqual([r("climbing")])
    expect(result.otherActivities).toEqual(["beers", "board games"])
  })

  it("trims other activity names", () => {
    const result = splitMainActivity([r("climbing"), r("  beers  ")])
    expect(result.otherActivities).toEqual(["beers"])
  })

  it("drops empty other activity names", () => {
    const result = splitMainActivity([r("climbing"), r("   "), r("beers")])
    expect(result.otherActivities).toEqual(["beers"])
  })

  it("deduplicates other activities case-insensitively, first spelling wins", () => {
    const result = splitMainActivity([r("climbing"), r("Beers"), r("beers"), r("BEERS")])
    expect(result.otherActivities).toEqual(["Beers"])
  })

  it("drops an other activity equal to the main activity, case-insensitively", () => {
    const result = splitMainActivity([r("Climbing"), r("climbing"), r("beers")])
    expect(result.otherActivities).toEqual(["beers"])
  })

  it("preserves order", () => {
    const result = splitMainActivity([r("climbing"), r("board games"), r("beers")])
    expect(result.otherActivities).toEqual(["board games", "beers"])
  })
})
