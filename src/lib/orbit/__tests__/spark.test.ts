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
import { normalizeSpark, detectSparkClaim, SPARK_SCHEMA } from "../spark"
import {
  chooseProposedDate,
  isGaugeLive,
  buildGaugeMessage,
  buildTallyLine,
  chipLabels,
  ACTIVITY_MAX,
} from "../spark-copy"

// Weekday anchors, verified against Intl before they were written down:
// 2026-07-20 Mon · 07-22 Wed · 07-23 Thu · 07-24 Fri · 07-31 Fri.
// Pacific/Midway is UTC-11 year round, so 2026-07-23T02:00Z is still Wed
// there while it is already Thu in UTC. That gap is what proves the day
// boundary is read in the group's zone and not the server's.
const MIDWAY = "Pacific/Midway"

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

describe("chooseProposedDate", () => {
  it("takes a stated weekday at its next occurrence", () => {
    const d = chooseProposedDate(3, "UTC", new Date("2026-07-20T12:00:00Z")) // Mon
    expect(d.toISOString()).toBe("2026-07-22T00:00:00.000Z") // Wed
  })

  it("takes a stated day that is today as today, not next week", () => {
    // The two-day buffer is fallback-only. Pushing a stated day out a week
    // would count the person who named it for a day they did not mean.
    const d = chooseProposedDate(5, "UTC", new Date("2026-07-24T12:00:00Z")) // Fri
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z") // the same Friday
  })

  it("falls back to the coming Friday when nobody named a day", () => {
    const d = chooseProposedDate(null, "UTC", new Date("2026-07-20T12:00:00Z")) // Mon
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("pushes the fallback a week when the coming Friday is under two days out", () => {
    const thu = chooseProposedDate(null, "UTC", new Date("2026-07-23T12:00:00Z"))
    expect(thu.toISOString()).toBe("2026-07-31T00:00:00.000Z")

    const fri = chooseProposedDate(null, "UTC", new Date("2026-07-24T12:00:00Z"))
    expect(fri.toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("keeps the coming Friday at exactly two days out", () => {
    const wed = chooseProposedDate(null, "UTC", new Date("2026-07-22T12:00:00Z"))
    expect(wed.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("reads today in the group's zone, not the server's", () => {
    // Same instant, two zones. In UTC it is already Thursday, so the fallback
    // buffer pushes a week. In Midway it is still Wednesday, so the coming
    // Friday clears the buffer and stands.
    const now = new Date("2026-07-23T02:00:00Z")
    expect(chooseProposedDate(null, "UTC", now).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z"
    )
    expect(chooseProposedDate(null, MIDWAY, now).toISOString()).toBe(
      "2026-07-24T11:00:00.000Z" // local midnight Fri 24 Jul in UTC-11
    )
  })

  it("returns group-local midnight for a stated day in a far-offset zone", () => {
    const d = chooseProposedDate(4, MIDWAY, new Date("2026-07-23T02:00:00Z")) // local Wed
    expect(d.toISOString()).toBe("2026-07-23T11:00:00.000Z") // local midnight Thu 23 Jul
  })
})

describe("isGaugeLive", () => {
  const proposed = new Date("2026-07-24T00:00:00.000Z") // local midnight Fri, UTC group

  it("is live before the proposed day", () => {
    expect(isGaugeLive(proposed, "UTC", new Date("2026-07-23T12:00:00Z"))).toBe(true)
  })

  it("is live through the last minute of the proposed day", () => {
    expect(isGaugeLive(proposed, "UTC", new Date("2026-07-24T23:59:00Z"))).toBe(true)
  })

  it("is over once the local day has passed", () => {
    expect(isGaugeLive(proposed, "UTC", new Date("2026-07-25T00:00:00Z"))).toBe(false)
    expect(isGaugeLive(proposed, "UTC", new Date("2026-07-26T12:00:00Z"))).toBe(false)
  })

  it("ends the day in the group's zone, not the server's", () => {
    const midwayProposed = new Date("2026-07-24T11:00:00.000Z") // local midnight Fri
    // Already 25 Jul in UTC, still Fri 24 Jul in Midway.
    expect(isGaugeLive(midwayProposed, MIDWAY, new Date("2026-07-25T10:59:00Z"))).toBe(true)
    expect(isGaugeLive(midwayProposed, MIDWAY, new Date("2026-07-25T11:00:00Z"))).toBe(false)
  })
})

describe("buildGaugeMessage", () => {
  it("proposes the day in Orbit's own voice", () => {
    const msg = buildGaugeMessage(
      "beers",
      new Date("2026-07-24T00:00:00Z"), // Fri
      "UTC",
      new Date("2026-07-20T12:00:00Z") // Mon
    )
    expect(msg).toBe("Love it. Anyone in for beers this Friday?")
  })

  it("makes no promise it cannot keep in this half", () => {
    const msg = buildGaugeMessage(
      "beers",
      new Date("2026-07-24T00:00:00Z"),
      "UTC",
      new Date("2026-07-20T12:00:00Z")
    )
    expect(msg).not.toMatch(/three|set it up|makes it happen/i)
  })

  it("names the date outright when the day is more than a week away", () => {
    // The fallback buffer can land eight days out, and "this Friday" would
    // then be wrong in the feed.
    const msg = buildGaugeMessage(
      "beers",
      new Date("2026-07-31T00:00:00Z"),
      "UTC",
      new Date("2026-07-23T12:00:00Z") // Thu
    )
    expect(msg).toBe("Love it. Anyone in for beers on Friday, Jul 31?")
  })

  it("uses no em or en dashes", () => {
    const msg = buildGaugeMessage(
      "board games",
      new Date("2026-07-24T00:00:00Z"),
      "UTC",
      new Date("2026-07-20T12:00:00Z")
    )
    expect(msg).not.toMatch(/[—–]/)
  })
})

describe("chipLabels", () => {
  it("abbreviates the weekday on the different-day chip", () => {
    const labels = chipLabels(new Date("2026-07-24T00:00:00Z"), "UTC")
    expect(labels.notThatDay).toBe("📅 Yes, can't Fri")
  })

  it("keeps the yes and no chips fixed", () => {
    const labels = chipLabels(new Date("2026-07-24T00:00:00Z"), "UTC")
    expect(labels.in).toBe("✋ I'm in")
    expect(labels.out).toBe("🙏 Next time")
  })

  it("reads the weekday off the stored date in the group's zone", () => {
    const labels = chipLabels(new Date("2026-07-25T02:00:00Z"), "Pacific/Midway")
    expect(labels.notThatDay).toBe("📅 Yes, can't Fri")
  })
})

describe("buildTallyLine", () => {
  const names = new Map([
    ["u1", "Jesse"],
    ["u2", "Maya"],
    ["u3", "Sam"],
    ["u4", "Ada"],
    ["u5", "Kit"],
  ])
  const inVote = (userId: string) => ({ userId, answer: "IN" as const })

  it("says nothing at all before anyone has voted", () => {
    expect(buildTallyLine([], names)).toBe("")
  })

  it("names one person", () => {
    expect(buildTallyLine([inVote("u1")], names)).toBe("Jesse is in so far")
  })

  it("names two people", () => {
    expect(buildTallyLine([inVote("u1"), inVote("u2")], names)).toBe(
      "Jesse & Maya are in so far"
    )
  })

  it("collapses to names plus a count beyond two", () => {
    expect(
      buildTallyLine([inVote("u1"), inVote("u2"), inVote("u3")], names)
    ).toBe("Jesse, Maya & 1 other are in so far")

    expect(
      buildTallyLine(
        [inVote("u1"), inVote("u2"), inVote("u3"), inVote("u4")],
        names
      )
    ).toBe("Jesse, Maya & 2 others are in so far")
  })

  it("never counts down to the bar, at any count", () => {
    // The promise and the countdown both land in part two, with the delivery.
    for (const n of [1, 2, 3, 4, 5]) {
      const votes = ["u1", "u2", "u3", "u4", "u5"].slice(0, n).map(inVote)
      expect(buildTallyLine(votes, names)).not.toMatch(/more|happen|three/i)
    }
  })

  it("shows people who want a different day, and only when there are any", () => {
    expect(buildTallyLine([inVote("u1")], names)).toBe("Jesse is in so far")

    expect(
      buildTallyLine(
        [inVote("u1"), { userId: "u2", answer: "NOT_THAT_DAY" as const }],
        names
      )
    ).toBe("Jesse is in so far · 1 wants a different day")

    expect(
      buildTallyLine(
        [
          inVote("u1"),
          { userId: "u2", answer: "NOT_THAT_DAY" as const },
          { userId: "u3", answer: "NOT_THAT_DAY" as const },
        ],
        names
      )
    ).toBe("Jesse is in so far · 2 want a different day")
  })

  it("still speaks when the only answers are different-day ones", () => {
    expect(
      buildTallyLine([{ userId: "u2", answer: "NOT_THAT_DAY" as const }], names)
    ).toBe("1 wants a different day")
  })

  it("leaves declines out of the line entirely", () => {
    expect(
      buildTallyLine(
        [inVote("u1"), { userId: "u2", answer: "OUT" as const }],
        names
      )
    ).toBe("Jesse is in so far")
  })

  it("skips a voter whose name it does not have rather than printing a blank", () => {
    expect(buildTallyLine([inVote("u1"), inVote("ghost")], names)).toBe(
      "Jesse is in so far"
    )
  })
})
