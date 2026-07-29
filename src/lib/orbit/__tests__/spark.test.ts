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
import { normalizeSpark, normalizeIntent, detectIntentClaim, INTENT_SCHEMA } from "../spark"
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

// Part two widened NormalizedSpark with three time fields, so a strict
// toEqual on a spark now has to state them. Kept as toEqual rather than
// relaxed to toMatchObject on purpose: strict equality is what catches a field
// appearing that nobody intended.
const NO_TIME = { statedTime: null, timeAmbiguous: false, partOfDay: null }

describe("normalizeSpark", () => {
  it("treats a no-spark claim as no spark", () => {
    expect(
      normalizeSpark({ isSpark: false, activity: "beers", statedDayOfWeek: 5 })
    ).toEqual({ spark: false })
  })

  it("carries a valid spark through with its activity and stated day", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "beers", statedDayOfWeek: 5 })
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: 5, ...NO_TIME })
  })

  it("keeps Sunday, which is day zero", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "brunch", statedDayOfWeek: 0 })
    ).toEqual({ spark: true, activity: "brunch", statedDayOfWeek: 0, ...NO_TIME })
  })

  it("carries a spark with no stated day", () => {
    expect(
      normalizeSpark({ isSpark: true, activity: "beers", statedDayOfWeek: null })
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null, ...NO_TIME })
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
      ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null, ...NO_TIME })
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
    ).toEqual({ spark: true, activity: "beers", statedDayOfWeek: null, ...NO_TIME })

    const long = normalizeSpark({
      isSpark: true,
      activity: "b".repeat(500),
      statedDayOfWeek: null,
    })
    expect(long.spark).toBe(true)
    if (long.spark) expect(long.activity.length).toBe(ACTIVITY_MAX)
  })
})

describe("normalizeSpark, time fields", () => {
  const base = { isSpark: true, activity: "beers", statedDayOfWeek: 5 }

  it("keeps a valid stated time", () => {
    const r = normalizeSpark({ ...base, statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening" })
    expect(r).toEqual({
      spark: true, activity: "beers", statedDayOfWeek: 5,
      statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening",
    })
  })

  it("treats a malformed time as no time at all", () => {
    // A claim, not a fact: "99:99" and "8pm" are both the model failing the
    // contract, and the product must degrade to its default rather than
    // putting an unparseable string anywhere near an event.
    for (const bad of ["99:99", "8pm", "8", "", null, 20]) {
      const r = normalizeSpark({ ...base, statedTime: bad, timeAmbiguous: false, partOfDay: null })
      expect(r).toMatchObject({ spark: true, statedTime: null, timeAmbiguous: false })
    }
  })

  it("cannot report ambiguity when there is no time to be ambiguous about", () => {
    const r = normalizeSpark({ ...base, statedTime: null, timeAmbiguous: true, partOfDay: null })
    expect(r).toMatchObject({ statedTime: null, timeAmbiguous: false })
  })

  it("rejects a part of day it does not recognise", () => {
    const r = normalizeSpark({ ...base, statedTime: null, timeAmbiguous: false, partOfDay: "afternoon" })
    expect(r).toMatchObject({ partOfDay: null })
  })

  it("still normalizes a spark from a model that omitted the new fields", () => {
    // Defensive: the schema requires them, but normalize is the boundary and
    // must not throw on a response that skipped one.
    const r = normalizeSpark(base)
    expect(r).toMatchObject({ spark: true, statedTime: null, timeAmbiguous: false, partOfDay: null })
  })
})

describe("detectIntentClaim", () => {
  it("calls the model with the intent schema", async () => {
    await detectIntentClaim("we should finally grab beers", {
      upcomingLines: [],
      conversationBlock: "",
      openProposalLines: [],
    })
    const call = vi.mocked(callExtractionModel).mock.calls.at(-1)!
    expect(call[2]).toBe(INTENT_SCHEMA)
  })

  it("tells the model to name a day only when exactly one is named", async () => {
    await detectIntentClaim("beers Friday or Saturday?", {
      upcomingLines: [],
      conversationBlock: "",
      openProposalLines: [],
    })
    const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
    expect(system.toLowerCase()).toContain("exactly one")
  })

  it("tells the model to stay quiet when unsure", async () => {
    await detectIntentClaim("sounds good", {
      upcomingLines: [],
      conversationBlock: "",
      openProposalLines: [],
    })
    const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
    expect(system.toLowerCase()).toContain("not sure")
  })

  it("gives the model the message body", async () => {
    await detectIntentClaim("are we still on for that?", {
      upcomingLines: [],
      conversationBlock: "",
      openProposalLines: [],
    })
    const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(user).toContain("are we still on for that?")
  })

  it("gives the model the numbered calendar lines when there are any", async () => {
    await detectIntentClaim("can we do 9 instead?", {
      upcomingLines: ["1. Climbing, Sun Jul 26 at 8am"],
      conversationBlock: "",
      openProposalLines: [],
    })
    const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(user).toContain("1. Climbing, Sun Jul 26 at 8am")
  })

  it("says so plainly when nothing is on the calendar", async () => {
    await detectIntentClaim("we should grab beers", {
      upcomingLines: [],
      conversationBlock: "",
      openProposalLines: [],
    })
    const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(user).toContain("This group has nothing on its calendar right now.")
  })

  it("the conversation window rides the user message", async () => {
    await detectIntentClaim("sorry i meant beers", {
      upcomingLines: ["1. Climbing, Tue Jul 28"],
      conversationBlock: "Right now it is Tue Jul 28, 6:12pm (group time).\n\nWINDOW-SENTINEL",
      openProposalLines: [],
    })
    const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(userMsg).toContain("WINDOW-SENTINEL")
    expect(userMsg.indexOf("On this group's calendar")).toBeLessThan(userMsg.indexOf("WINDOW-SENTINEL"))
  })

  it("open proposals are named between calendar and conversation", async () => {
    await detectIntentClaim("actually 10 works better", {
      upcomingLines: ["1. Beers, Thu Jul 30"],
      conversationBlock: "x",
      openProposalLines: ["A question is already out to the group: move beers to 9pm (asked by Sam)."],
    })
    const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
    expect(userMsg).toContain("already out to the group")
  })

  it("the system prompt teaches corrections and timestamp judgment", async () => {
    await detectIntentClaim("hey", { upcomingLines: [], conversationBlock: "", openProposalLines: [] })
    const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
    expect(system).toContain("correction")
    expect(system.toLowerCase()).toContain("timestamps")
  })
})

describe("chooseProposedDate", () => {
  it("takes a stated weekday at its next occurrence", () => {
    const d = chooseProposedDate(3, null, "UTC", new Date("2026-07-20T12:00:00Z")) // Mon
    expect(d.toISOString()).toBe("2026-07-22T00:00:00.000Z") // Wed
  })

  it("takes a stated day that is today as today, not next week", () => {
    // The two-day buffer is fallback-only. Pushing a stated day out a week
    // would count the person who named it for a day they did not mean.
    const d = chooseProposedDate(5, null, "UTC", new Date("2026-07-24T12:00:00Z")) // Fri
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z") // the same Friday
  })

  it("falls back to the coming Friday when nobody named a day", () => {
    const d = chooseProposedDate(null, null, "UTC", new Date("2026-07-20T12:00:00Z")) // Mon
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("pushes the fallback a week when the coming Friday is under two days out", () => {
    const thu = chooseProposedDate(null, null, "UTC", new Date("2026-07-23T12:00:00Z"))
    expect(thu.toISOString()).toBe("2026-07-31T00:00:00.000Z")

    const fri = chooseProposedDate(null, null, "UTC", new Date("2026-07-24T12:00:00Z"))
    expect(fri.toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("keeps the coming Friday at exactly two days out", () => {
    const wed = chooseProposedDate(null, null, "UTC", new Date("2026-07-22T12:00:00Z"))
    expect(wed.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("reads today in the group's zone, not the server's", () => {
    // Same instant, two zones. In UTC it is already Thursday, so the fallback
    // buffer pushes a week. In Midway it is still Wednesday, so the coming
    // Friday clears the buffer and stands.
    const now = new Date("2026-07-23T02:00:00Z")
    expect(chooseProposedDate(null, null, "UTC", now).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z"
    )
    expect(chooseProposedDate(null, null, MIDWAY, now).toISOString()).toBe(
      "2026-07-24T11:00:00.000Z" // local midnight Fri 24 Jul in UTC-11
    )
  })

  it("returns group-local midnight for a stated day in a far-offset zone", () => {
    const d = chooseProposedDate(4, null, MIDWAY, new Date("2026-07-23T02:00:00Z")) // local Wed
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
      new Date("2026-07-20T12:00:00Z"), // Mon
      null
    )
    expect(msg).toBe(
      "Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up."
    )
  })

  it("promises to set it up, which it can now do", () => {
    // Part one pinned this clause OUT because it could not honor it. Part two
    // creates the event at the third yes, so the promise is now true.
    const msg = buildGaugeMessage(
      "beers",
      new Date("2026-07-24T00:00:00Z"),
      "UTC",
      new Date("2026-07-20T12:00:00Z"),
      null
    )
    expect(msg).toContain("If three of you are in, I'll set it up.")
  })

  it("names the date outright when the day is more than a week away", () => {
    // The fallback buffer can land eight days out, and "this Friday" would
    // then be wrong in the feed.
    const msg = buildGaugeMessage(
      "beers",
      new Date("2026-07-31T00:00:00Z"),
      "UTC",
      new Date("2026-07-23T12:00:00Z"), // Thu
      null
    )
    expect(msg).toBe(
      "Love it. Anyone in for beers on Friday, Jul 31? If three of you are in, I'll set it up."
    )
  })

  it("uses no em or en dashes", () => {
    const msg = buildGaugeMessage(
      "board games",
      new Date("2026-07-24T00:00:00Z"),
      "UTC",
      new Date("2026-07-20T12:00:00Z"),
      null
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
    // Two is also one away from the bar, so part two's countdown rides along.
    expect(buildTallyLine([inVote("u1"), inVote("u2")], names)).toBe(
      "Jesse & Maya are in so far · one more makes it happen"
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

  it("counts down only at one away from the bar", () => {
    // Part one pinned the countdown OUT at every count, because nothing
    // happened when the bar was met. Part two creates the event there, so the
    // clause is now information rather than an empty tease. Still absent at one
    // (pressure, not information) and past three (nothing left to count).
    for (const n of [1, 3, 4, 5]) {
      const votes = ["u1", "u2", "u3", "u4", "u5"].slice(0, n).map(inVote)
      expect(buildTallyLine(votes, names)).not.toContain("makes it happen")
    }
    expect(buildTallyLine([inVote("u1"), inVote("u2")], names)).toContain(
      "one more makes it happen"
    )
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

describe("normalizeIntent", () => {
  const changeClaim = {
    isSpark: false,
    activity: null,
    statedDayOfWeek: null,
    statedTime: null,
    timeAmbiguous: false,
    partOfDay: null,
    isChangeRequest: true,
    targetEventNumber: 1,
    requestedTime: "21:00",
    requestedTimeAmbiguous: true,
    requestedFields: ["time"],
    intentClear: true,
  }

  it("passes a valid change claim through", () => {
    const r = normalizeIntent(changeClaim, 2)
    expect(r).toEqual({
      kind: "change",
      change: {
        targetEventIndex: 0,
        requestedTime: "21:00",
        requestedTimeAmbiguous: true,
        requestedFields: ["time"],
        intentClear: true,
      },
    })
  })

  it("delegates a spark claim to normalizeSpark", () => {
    const r = normalizeIntent(
      { ...changeClaim, isSpark: true, isChangeRequest: false, activity: "beers" },
      1
    )
    expect(r.kind).toBe("spark")
    if (r.kind === "spark") expect(r.spark.activity).toBe("beers")
  })

  it("treats a claim of both spark and change as none", () => {
    expect(normalizeIntent({ ...changeClaim, isSpark: true, activity: "beers" }, 1)).toEqual({
      kind: "none",
    })
  })

  it("bounds-checks the target: out of range degrades to null, not to a wrong event", () => {
    const r = normalizeIntent({ ...changeClaim, targetEventNumber: 3 }, 2)
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.targetEventIndex).toBe(null)
  })

  it("rejects a malformed time and a lone ambiguity flag", () => {
    const r = normalizeIntent(
      { ...changeClaim, requestedTime: "9pm", requestedTimeAmbiguous: true },
      1
    )
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.requestedTime).toBe(null)
    expect(r.change.requestedTimeAmbiguous).toBe(false)
  })

  it("drops unknown fields and dedupes; an unusable field list degrades to empty", () => {
    const r = normalizeIntent(
      { ...changeClaim, requestedFields: ["time", "time", "weather"] },
      1
    )
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.requestedFields).toEqual(["time"])
    // Both of these used to be rejected outright as "not a change request".
    // They now reach the ladder with nothing named, which is the shape the
    // ladder answers with a question rather than silence.
    for (const unusable of [[], "time"]) {
      const degraded = normalizeIntent({ ...changeClaim, requestedFields: unusable }, 1)
      if (degraded.kind !== "change") throw new Error("expected change")
      expect(degraded.change.requestedFields).toEqual([])
    }
  })

  it("keeps a change request that names nothing to change", () => {
    // "can we move it?" names no plan, no time, and no field. The reply ladder
    // answers exactly this shape with a question, so normalize must not
    // convert it to silence before the ladder ever sees it.
    const r = normalizeIntent(
      {
        ...changeClaim,
        targetEventNumber: null,
        requestedTime: null,
        requestedTimeAmbiguous: false,
        requestedFields: [],
      },
      2
    )
    expect(r).toEqual({
      kind: "change",
      change: {
        targetEventIndex: null,
        requestedTime: null,
        requestedTimeAmbiguous: false,
        requestedFields: [],
        intentClear: true,
      },
    })
  })

  it("anything but explicit true intentClear is unclear", () => {
    const r = normalizeIntent({ ...changeClaim, intentClear: "yes" }, 1)
    if (r.kind !== "change") throw new Error("expected change")
    expect(r.change.intentClear).toBe(false)
  })

  it("non-objects and plain chatter are none", () => {
    expect(normalizeIntent(null, 1)).toEqual({ kind: "none" })
    expect(normalizeIntent([], 1)).toEqual({ kind: "none" })
    expect(normalizeIntent({ ...changeClaim, isChangeRequest: false }, 1)).toEqual({ kind: "none" })
  })
})
