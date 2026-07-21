// src/lib/orbit/__tests__/normalize.test.ts
//
// Pure unit tests for the normalization layer — the boundary where raw model
// output (a claim) becomes the normalized onboarding profile (a fact).
// No database, no async, no API.

import { describe, it, expect } from "vitest"
import { normalizeExtraction } from "../normalize"

const CLIMB = {
  activity: "climbing",
  cadence: "weekly",
  daysOfWeek: [0],
  timeLocal: "08:00",
  isPrimary: true,
}

const BEERS = {
  activity: "beers",
  cadence: "monthly",
  daysOfWeek: null,
  timeLocal: null,
  isPrimary: false,
}

const raw = (rhythms: unknown[], name: unknown = "Sunday Climbers") => ({
  suggestedGroupName: name,
  rhythms,
})

describe("normalizeExtraction — ready path", () => {
  it("returns ready with the schedulable primary at position 0 and loose second", () => {
    const r = normalizeExtraction(raw([BEERS, { ...CLIMB, isPrimary: true }]))
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].activity).toBe("climbing") // position-zero guarantee
    expect(r.rhythms[0].cadence).toBe("weekly")
    expect(r.rhythms[1].activity).toBe("beers")
    expect(r.groupName).toBe("Sunday Climbers")
  })

  it("derives a day-free title for every-day rhythms", () => {
    // A seven-day rhythm's events fall on any weekday, so the title must not
    // name one ("Walks Sunday" on a Wednesday event would be wrong).
    const r = normalizeExtraction(
      raw([{ ...CLIMB, activity: "walks", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeLocal: "06:00" }])
    )
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].title).toBe("Walks")
  })

  it("derives titles deterministically", () => {
    const r = normalizeExtraction(raw([CLIMB, BEERS]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].title).toBe("Climbing Sunday") // schedulable: activity + weekday
    expect(r.rhythms[1].title).toBe("Beers") // loose: activity only
  })

  it("promotes a complete rhythm when the designated primary is incomplete", () => {
    const r = normalizeExtraction(
      raw([{ ...BEERS, isPrimary: true }, { ...CLIMB, isPrimary: false }])
    )
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].activity).toBe("climbing")
    expect(r.rhythms[1].activity).toBe("beers")
  })

  it("treats no primary designation as first rhythm primary", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, isPrimary: false }, BEERS]))
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].activity).toBe("climbing")
  })

  it("never writes durationMinutes", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, durationMinutes: 90 }]))
    if (r.status !== "ready") throw new Error("expected ready")
    const first = r.rhythms[0] as unknown as Record<string, unknown>
    expect(first.durationMinutes == null).toBe(true)
  })
})

describe("normalizeExtraction — sanitization (raw output is a claim)", () => {
  it("range-checks time: 99:99 becomes null (missing), not a pass-through", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: "99:99" }]))
    expect(r).toEqual({ status: "incomplete", missing: "time" })
  })

  it("filters invalid day numbers; all-invalid becomes missing day", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: [7, -1] }]))).toEqual({
      status: "incomplete",
      missing: "day",
    })
  })

  it("dedupes and keeps valid day numbers", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: [1, 1, 3, 9] }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].daysOfWeek).toEqual([1, 3])
  })

  it("unknown cadence string becomes loose, not an error", () => {
    const r = normalizeExtraction(raw([CLIMB, { ...BEERS, cadence: "quarterly" }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[1].cadence).toBeNull()
  })

  it("drops rhythms with empty activity rather than failing the whole extraction", () => {
    const r = normalizeExtraction(raw([{ ...BEERS, activity: "  " }, CLIMB]))
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms).toHaveLength(1)
  })

  it("tolerates garbage input shapes", () => {
    expect(normalizeExtraction(null)).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction(undefined)).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction("climbing")).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction({ rhythms: "nope" })).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction({ rhythms: [null, 42, "x"] })).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
  })
})

describe("normalizeExtraction — completeness gate", () => {
  it("missing time only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, timeLocal: null }]))).toEqual({
      status: "incomplete",
      missing: "time",
    })
  })

  it("missing day only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null }]))).toEqual({
      status: "incomplete",
      missing: "day",
    })
  })

  it("missing both", () => {
    expect(
      normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null, timeLocal: null }]))
    ).toEqual({ status: "incomplete", missing: "both" })
  })

  it("day+time with unconfident cadence gets the targeted cadence re-ask, never silent weekly inference", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, cadence: null }]))).toEqual({
      status: "incomplete",
      missing: "cadence",
    })
  })

  it("monthly-only description is not schedulable", () => {
    expect(
      normalizeExtraction(
        raw([{ ...BEERS, isPrimary: true, daysOfWeek: [5], timeLocal: "18:00" }])
      )
    ).toEqual({ status: "incomplete", missing: "nothing_schedulable" })
  })

  it("no usable activity at all", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, activity: "  " }]))).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction(raw([]))).toEqual({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
  })
})

describe("normalizeExtraction — group name", () => {
  it("caps, strips em/en dashes, collapses whitespace", () => {
    const r = normalizeExtraction(raw([CLIMB], "  Sunday — Climbers   Club  "))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.groupName).toBe("Sunday Climbers Club")
  })

  it("caps overly long suggestions at 50 characters", () => {
    const r = normalizeExtraction(raw([CLIMB], "x".repeat(80)))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.groupName.length).toBeLessThanOrEqual(50)
  })

  it("falls back deterministically when the suggestion is missing", () => {
    const r = normalizeExtraction(raw([CLIMB], null))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.groupName).toBe("Sunday Climbing")
  })

  it("falls back deterministically when the suggestion is whitespace or wrong type", () => {
    const blank = normalizeExtraction(raw([CLIMB], "   "))
    if (blank.status !== "ready") throw new Error("expected ready")
    expect(blank.groupName).toBe("Sunday Climbing")

    const wrongType = normalizeExtraction(raw([CLIMB], 42))
    if (wrongType.status !== "ready") throw new Error("expected ready")
    expect(wrongType.groupName).toBe("Sunday Climbing")
  })
})
