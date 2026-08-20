// src/lib/orbit/__tests__/normalize.test.ts
//
// Pure unit tests for the normalization layer — the boundary where raw model
// output (a claim) becomes the normalized onboarding profile (a fact).
// No database, no async, no API.

import { describe, it, expect } from "vitest"
import { normalizeExtraction } from "../normalize"
import { VENUE_NAME_MAX } from "../rhythm"

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

  it("derives a day-free title regardless of how many days the rhythm covers", () => {
    // The date already sits under the title on every surface that shows one,
    // so a weekday in the title would be duplicated information whose only
    // possible future is to go stale (a Mon/Wed/Fri rhythm's Friday event
    // still reading "Climbing Monday"). Seven days was never a special case
    // needing its own rule; every schedulable rhythm gets the bare activity.
    const threeDay = normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: [1, 3, 5] }]))
    if (threeDay.status !== "ready") throw new Error("expected ready")
    expect(threeDay.rhythms[0].title).toBe("Climbing")

    const everyDay = normalizeExtraction(
      raw([{ ...CLIMB, activity: "walks", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeLocal: "06:00" }])
    )
    if (everyDay.status !== "ready") throw new Error("expected ready")
    expect(everyDay.rhythms[0].title).toBe("Walks")
  })

  it("derives titles deterministically", () => {
    const r = normalizeExtraction(raw([CLIMB, BEERS]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].title).toBe("Climbing") // the activity, no weekday
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
    expect(r).toMatchObject({ status: "incomplete", missing: "time" })
  })

  it("filters invalid day numbers; all-invalid becomes missing day", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: [7, -1] }]))).toMatchObject({
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
    expect(normalizeExtraction(null)).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction(undefined)).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction("climbing")).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction({ rhythms: "nope" })).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction({ rhythms: [null, 42, "x"] })).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
  })
})

describe("normalizeExtraction — completeness gate", () => {
  it("missing time only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, timeLocal: null }]))).toMatchObject({
      status: "incomplete",
      missing: "time",
    })
  })

  it("missing day only", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null }]))).toMatchObject({
      status: "incomplete",
      missing: "day",
    })
  })

  it("missing both", () => {
    expect(
      normalizeExtraction(raw([{ ...CLIMB, daysOfWeek: null, timeLocal: null }]))
    ).toMatchObject({ status: "incomplete", missing: "both" })
  })

  it("day+time with unconfident cadence gets the targeted cadence re-ask, never silent weekly inference", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, cadence: null }]))).toMatchObject({
      status: "incomplete",
      missing: "cadence",
    })
  })

  it("monthly-only description is not schedulable", () => {
    expect(
      normalizeExtraction(
        raw([{ ...BEERS, isPrimary: true, daysOfWeek: [5], timeLocal: "18:00" }])
      )
    ).toMatchObject({ status: "incomplete", missing: "nothing_schedulable" })
  })

  it("no usable activity at all", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, activity: "  " }]))).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
    expect(normalizeExtraction(raw([]))).toMatchObject({
      status: "incomplete",
      missing: "nothing_schedulable",
    })
  })
})

describe("normalizeExtraction — ambiguous time (the flag is a claim too)", () => {
  // "Tuesdays at 7": the model's best guess rides in timeLocal, the flag says
  // it was a guess. The guess must never reach stored shape as a fact.
  const AMBIG = { ...CLIMB, daysOfWeek: [2], timeLocal: "19:00", timeAmbiguous: true }

  it("primary with a known day and an ambiguous time classifies as ambiguous_time", () => {
    const r = normalizeExtraction(raw([AMBIG]))
    expect(r).toMatchObject({ status: "incomplete", missing: "ambiguous_time" })
    if (r.status !== "incomplete") return
    expect(r.candidateTimeLocal).toBe("19:00")
    expect(r.rhythms[0].timeLocal).toBeNull() // the guess never sits in stored shape
  })

  it("ambiguous time with no day collapses into both, candidate still carried", () => {
    // One question covers day and am/pm together; the candidate still travels
    // so the question and the merge can name the number the founder used.
    const r = normalizeExtraction(raw([{ ...AMBIG, daysOfWeek: null }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "both" })
    if (r.status !== "incomplete") return
    expect(r.candidateTimeLocal).toBe("19:00")
  })

  it("a flagged rhythm with no stated time is just a missing time", () => {
    const r = normalizeExtraction(raw([{ ...AMBIG, timeLocal: null }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "time" })
    if (r.status !== "incomplete") return
    expect(r.candidateTimeLocal).toBeNull()
  })

  it("non-boolean timeAmbiguous degrades to false", () => {
    const r = normalizeExtraction(raw([{ ...AMBIG, timeAmbiguous: "yes" }]))
    expect(r.status).toBe("ready")
  })

  it("an ambiguous time on a secondary rhythm degrades to null and never gates", () => {
    const r = normalizeExtraction(
      raw([CLIMB, { ...BEERS, timeLocal: "19:00", timeAmbiguous: true }])
    )
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[1].timeLocal).toBeNull()
  })

  it("a designated ambiguous primary is passed over for a fully complete rhythm", () => {
    const r = normalizeExtraction(
      raw([{ ...AMBIG, isPrimary: true }, { ...CLIMB, isPrimary: false }])
    )
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.rhythms[0].timeLocal).toBe("08:00")
  })

  it("asks about ambiguity before cadence when both are open", () => {
    // A stated weekday implies weekly per the prompt, so this combination is
    // rare; when it happens, the am/pm answer often settles cadence for free.
    const r = normalizeExtraction(raw([{ ...AMBIG, cadence: null }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "ambiguous_time" })
  })
})

describe("normalizeExtraction — incomplete partial state", () => {
  it("carries the gapped primary at position zero with derived titles", () => {
    const r = normalizeExtraction(raw([BEERS, { ...CLIMB, timeLocal: null, isPrimary: true }]))
    expect(r).toMatchObject({ status: "incomplete", missing: "time" })
    if (r.status !== "incomplete") return
    expect(r.rhythms).toHaveLength(2)
    expect(r.rhythms[0].activity).toBe("climbing")
    expect(r.rhythms[0].title).toBe("Climbing") // unschedulable: bare activity title
    expect(r.rhythms[1].activity).toBe("beers")
  })

  it("carries the cleaned suggestion as the group name", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: null }], " Sunday — Climbers "))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.groupName).toBe("Sunday Climbers")
  })

  it("group name is null when no usable suggestion, never the derived fallback", () => {
    // The derived fallback dereferences the primary's day, which incomplete
    // states may not have; and a made-up name on the gap card would be a
    // promise the extraction didn't earn.
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: null }], null))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.groupName).toBeNull()
  })

  it("nothing_schedulable with no usable rhythm carries empty partial state", () => {
    const r = normalizeExtraction(raw([]))
    expect(r).toMatchObject({ status: "incomplete", missing: "nothing_schedulable" })
    if (r.status !== "incomplete") return
    expect(r.rhythms).toEqual([])
    expect(r.candidateTimeLocal).toBeNull()
  })

  it("normalizes a merged claim like any other: latest word wins arrives as new values", () => {
    // Merge semantics (the founder's answer overriding prior fields) live in
    // the model + schema; the pure path simply normalizes the latest claim.
    const merged = raw([{ ...CLIMB, daysOfWeek: [6], timeLocal: "10:00", timeAmbiguous: false }])
    const r = normalizeExtraction(merged)
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].daysOfWeek).toEqual([6])
    expect(r.rhythms[0].timeLocal).toBe("10:00")
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
    expect(r.groupName).toBe("Climbing")
  })

  it("falls back deterministically when the suggestion is whitespace or wrong type", () => {
    const blank = normalizeExtraction(raw([CLIMB], "   "))
    if (blank.status !== "ready") throw new Error("expected ready")
    expect(blank.groupName).toBe("Climbing")

    const wrongType = normalizeExtraction(raw([CLIMB], 42))
    if (wrongType.status !== "ready") throw new Error("expected ready")
    expect(wrongType.groupName).toBe("Climbing")
  })
})

describe("normalizeExtraction — venueName", () => {
  it("carries a trimmed venueName per rhythm on the ready path", () => {
    const r = normalizeExtraction(
      raw([
        { ...CLIMB, venueName: "  Summit Gym " },
        { ...BEERS, venueName: "Lucky Lab" },
      ])
    )
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].venueName).toBe("Summit Gym")
    expect(r.rhythms[1].venueName).toBe("Lucky Lab") // loose rhythms carry venues too
  })

  it("absent, null, wrong-type, and empty venueName all become null", () => {
    for (const venueName of [undefined, null, 42, ""]) {
      const r = normalizeExtraction(raw([{ ...CLIMB, venueName }]))
      if (r.status !== "ready") throw new Error("expected ready")
      expect(r.rhythms[0].venueName).toBeNull()
    }
  })

  it("caps venueName at VENUE_NAME_MAX", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, venueName: "x".repeat(200) }]))
    if (r.status !== "ready") throw new Error("expected ready")
    expect(r.rhythms[0].venueName!.length).toBeLessThanOrEqual(VENUE_NAME_MAX)
  })

  it("carries venueName into the incomplete partial state so a gap round cannot lose it", () => {
    const r = normalizeExtraction(raw([{ ...CLIMB, timeLocal: null, venueName: "Summit Gym" }]))
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.rhythms[0].venueName).toBe("Summit Gym")
  })

  it("keeps the venue when an ambiguous time guess is nulled (only the guess is unconfirmed)", () => {
    const r = normalizeExtraction(
      raw([{ ...CLIMB, timeLocal: "07:00", timeAmbiguous: true, venueName: "Summit Gym" }])
    )
    if (r.status !== "incomplete") throw new Error("expected incomplete")
    expect(r.rhythms[0].timeLocal).toBeNull()
    expect(r.rhythms[0].venueName).toBe("Summit Gym")
  })
})

// Regression pins, not TDD tests: these pass on first run by design, because
// isSchedulable and classifyGap do not read venueName and this slice forbids
// touching them. They exist so any future change that lets venue participate
// in the completeness gate fails loudly. Nothing environmental (timezone,
// locale, clock) affects them.
describe("normalizeExtraction — venue never gates (regression pins)", () => {
  it("a full schedule with no venue is still ready", () => {
    expect(normalizeExtraction(raw([{ ...CLIMB, venueName: null }])).status).toBe("ready")
  })

  it("venueName does not change gap classification", () => {
    const gapCases: Array<[Record<string, unknown>, string]> = [
      [{ ...CLIMB, timeLocal: null, venueName: "Summit Gym" }, "time"],
      [{ ...CLIMB, daysOfWeek: null, venueName: "Summit Gym" }, "day"],
      [{ ...CLIMB, daysOfWeek: null, timeLocal: null, venueName: "Summit Gym" }, "both"],
      [{ ...CLIMB, cadence: null, venueName: "Summit Gym" }, "cadence"],
      [
        { ...CLIMB, timeLocal: "07:00", timeAmbiguous: true, venueName: "Summit Gym" },
        "ambiguous_time",
      ],
    ]
    for (const [rhythm, expected] of gapCases) {
      const r = normalizeExtraction(raw([rhythm]))
      if (r.status !== "incomplete") throw new Error(`expected incomplete for ${expected}`)
      expect(r.missing).toBe(expected)
    }
  })
})
