// src/lib/orbit/__tests__/spark.test.ts
//
// The claim-to-fact seam for spark detection. normalizeSpark is the only door
// between the model's answer and anything the group ever sees, mirroring
// normalize.ts for onboarding. Every test here is about refusing to trust the
// model: Orbit staying quiet is free, Orbit interjecting wrongly is not.

import { describe, it, expect, vi } from "vitest"

vi.mock("../extract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../extract")>()),
  callExtractionModel: vi.fn(async () => ({})),
}))

import { callExtractionModel } from "../extract"
import {
  normalizeSpark,
  detectSparkClaim,
  SPARK_SCHEMA,
  ACTIVITY_MAX,
} from "../spark"

describe("normalizeSpark", () => {
  it("treats a no-spark claim as no spark", () => {
    expect(
      normalizeSpark({ isSpark: false, activity: "beers", statedDayOfWeek: 5 })
    ).toEqual({ spark: false })
  })

  it("carries a valid spark through with its activity and stated day", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "beers", statedDayOfWeek: 5 })
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: 5 })
  })

  it("keeps Sunday, which is day zero", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "brunch", statedDayOfWeek: 0 })
    ).toEqual({ spark: true, activity: "brunch", statedDayOfWeek: 0 })
  })

  it("carries a spark with no stated day", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "beers", statedDayOfWeek: null })
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null })
  })

  it("is not a spark when there is no activity to gauge", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: null, statedDayOfWeek: 5 })
    ).toEqual({ spark: false })
    expect(
      normalizeSpark({ isSpark: true, activity: "   ", statedDayOfWeek: 5 })
    ).toEqual({ spark: false })
    expect(
      normalizeSpark({ isSpark: true, statedDayOfWeek: 5 })
    ).toEqual({ spark: false })
  })

  it("degrades a day outside 0 to 6 to no stated day rather than rejecting the spark", () => {
    for (const bad of [7, -1, 9, 1.5, "5", true, null]) {
      expect(
        normalizeSpark({ isSpark: true, activity: "beers", statedDayOfWeek: bad })
      ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null })
    }
  })

  it("is not a spark when the claim is not an object at all", () => {
    for (const junk of [null, undefined, "yes", 42, []]) {
      expect(normalizeSpark(junk)).toEqual({ spark: false })
    }
  })

  it("trims and caps the activity", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "  beers  ", statedDayOfWeek: null })
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null })

    const long = normalizeSpark({
      isSpark: true,
      activity: "b".repeat(500),
      statedDayOfWeek: null,
    })
    expect(long.spark).toBe(true)
    if (long.spark) expect(long.activity.length).toBe(ACTIVITY_MAX)
  })
})

describe("detectSparkClaim", () => {
  it("calls the model with the spark schema, not the onboarding one", async () => {
    await detectSparkClaim("we should finally grab beers", { upcomingEvent: null })
    const call = vi.mocked(callExtractionModel).mock.calls.at(-1)!
    expect(call[2]).toBe(SPARK_SCHEMA)
  })

  it("tells the model to name a day only when exactly one is named", async () => {
    await detectSparkClaim("beers Friday or Saturday?", { upcomingEvent: null })
    const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
    expect(system.toLowerCase()).toContain("exactly one")
  })

  it("tells the model to stay quiet when unsure", async () => {
    await detectSparkClaim("sounds good", { upcomingEvent: null })
    const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
    expect(system.toLowerCase()).toContain("not sure")
  })

  it("gives the model the event already on the calendar so chatter about it is not a spark", async () => {
    await detectSparkClaim("are we still on for that?", {
      upcomingEvent: "Climbing, Sun Jul 26 at 8am",
    })
    const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(user).toContain("Climbing, Sun Jul 26 at 8am")
    expect(user).toContain("are we still on for that?")
  })

  it("says so plainly when nothing is on the calendar", async () => {
    await detectSparkClaim("we should grab beers", { upcomingEvent: null })
    const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(user).toContain("we should grab beers")
  })
})
