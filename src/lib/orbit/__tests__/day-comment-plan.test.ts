// src/lib/orbit/__tests__/day-comment-plan.test.ts
//
// The pure decision layer for a day comment on a live gauge: which gauge it
// targets, what vote it records, and what Orbit says. No DB, no model.

import { describe, it, expect } from "vitest"
import { planDayComment, type DayCommentGauge } from "../day-comment-plan"
import { zonedWallTimeToUtc } from "../occurrence"

// Sat 2026-08-15, group-local midnight in UTC.
const SATURDAY = zonedWallTimeToUtc(2026, 8, 15, 0, 0, "UTC")

function gauge(overrides: Partial<DayCommentGauge> = {}): DayCommentGauge {
  return {
    id: "g1",
    activity: "beers",
    proposedDate: SATURDAY,
    proposedTime: "20:00",
    viewerAnswer: null,
    ...overrides,
  }
}

const sundayComment = { activity: null, dayOfWeek: 0, time: null, timeAmbiguous: false }

describe("planDayComment", () => {
  it("is quiet when no gauge is live (coupling guard)", () => {
    expect(planDayComment(sundayComment, [], "UTC")).toEqual({ action: "quiet" })
  })

  it("attaches to the only live gauge when the comment names no activity", () => {
    const plan = planDayComment(sundayComment, [gauge()], "UTC")
    expect(plan).toMatchObject({ action: "record", gaugeId: "g1", keepIn: false, dayOfWeek: 0 })
  })

  it("matches a named activity case-insensitively across several gauges", () => {
    const plan = planDayComment(
      { ...sundayComment, activity: "Beers" },
      [gauge({ id: "g1", activity: "climbing" }), gauge({ id: "g2", activity: "beers" })],
      "UTC"
    )
    expect(plan).toMatchObject({ action: "record", gaugeId: "g2" })
  })

  it("asks which when several gauges are live and none was named", () => {
    const plan = planDayComment(
      sundayComment,
      [gauge({ id: "g1", activity: "beers" }), gauge({ id: "g2", activity: "climbing" })],
      "UTC"
    )
    expect(plan).toMatchObject({ action: "which" })
    if (plan.action === "which") {
      expect(plan.question).toContain("beers or climbing")
    }
  })

  it("is quiet when the named activity matches no live gauge (invented situation)", () => {
    const plan = planDayComment(
      { ...sundayComment, activity: "games" },
      [gauge()],
      "UTC"
    )
    expect(plan).toEqual({ action: "quiet" })
  })

  it("discards a comment naming the gauged day itself (decision 10)", () => {
    const plan = planDayComment({ ...sundayComment, dayOfWeek: 6 }, [gauge()], "UTC")
    expect(plan).toEqual({ action: "quiet" })
  })

  it("keeps an explicit IN and adjusts the reply (decision 2)", () => {
    const plan = planDayComment(sundayComment, [gauge({ viewerAnswer: "IN" })], "UTC")
    expect(plan).toMatchObject({ action: "record", keepIn: true })
    if (plan.action === "record") {
      expect(plan.reply).toBe(
        "You're still in for Saturday, and Sunday's noted if it doesn't come together."
      )
    }
  })

  it("flips OUT and NOT_THAT_DAY holders to a recorded can't-that-day", () => {
    for (const answer of ["OUT", "NOT_THAT_DAY"] as const) {
      const plan = planDayComment(sundayComment, [gauge({ viewerAnswer: answer })], "UTC")
      expect(plan).toMatchObject({ action: "record", keepIn: false })
    }
  })

  it("resolves a stated time against the gauge's own half of day", () => {
    // "6" beside a 20:00 gauge reads as 18:00; an unambiguous time stands.
    const ambiguous = planDayComment(
      { ...sundayComment, time: "06:00", timeAmbiguous: true },
      [gauge()],
      "UTC"
    )
    expect(ambiguous).toMatchObject({ action: "record", suggestedTime: "18:00" })
    const stated = planDayComment(
      { ...sundayComment, time: "18:30", timeAmbiguous: false },
      [gauge()],
      "UTC"
    )
    expect(stated).toMatchObject({ action: "record", suggestedTime: "18:30" })
    const none = planDayComment(sundayComment, [gauge()], "UTC")
    expect(none).toMatchObject({ action: "record", suggestedTime: null })
  })
})
