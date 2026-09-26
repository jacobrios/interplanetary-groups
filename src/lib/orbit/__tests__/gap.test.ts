// src/lib/orbit/__tests__/gap.test.ts
//
// Pure unit tests for the gap-ask decision seam: question validation, the
// fire-exit fallback to static templates, and the round/cap control flow.
// The model's question is a claim like any other output — nothing renders it
// until validateQuestion has passed it.

import { describe, it, expect } from "vitest"
import {
  GAP_HINT_EXAMPLES,
  GAP_REASK_COPY,
  GAP_ROUND_INTRO,
  GAP_STALLED_INTRO,
  MAX_GAP_ROUNDS,
  QUESTION_MAX,
  decideGapOutcome,
  enforceActivityCarryOver,
  enforceVenueCarryOver,
  gapAnswerMoved,
  gapBubbleLine,
  readClarifyingQuestion,
  resolveGapQuestion,
  validateQuestion,
} from "../gap"
import type { NormalizedOnboarding } from "../normalize"
import type { StoredRhythm } from "../rhythm"

const PARTIAL_RHYTHM = {
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly" as const,
  daysOfWeek: [2],
  timeLocal: null,
}

const incomplete = (
  overrides: Partial<Extract<NormalizedOnboarding, { status: "incomplete" }>> = {}
): NormalizedOnboarding => ({
  status: "incomplete",
  missing: "time",
  rhythms: [PARTIAL_RHYTHM],
  groupName: "Tuesday Climbers",
  candidateTimeLocal: null,
  ...overrides,
})

const ready: NormalizedOnboarding = {
  status: "ready",
  groupName: "Tuesday Climbers",
  rhythms: [{ ...PARTIAL_RHYTHM, timeLocal: "19:00" }],
}

describe("validateQuestion", () => {
  it("accepts a short single-sentence question and trims it", () => {
    expect(validateQuestion("  What time do you usually climb?  ")).toBe(
      "What time do you usually climb?"
    )
  })

  it("rejects non-strings and null", () => {
    expect(validateQuestion(null)).toBeNull()
    expect(validateQuestion(undefined)).toBeNull()
    expect(validateQuestion(42)).toBeNull()
    expect(validateQuestion(["What time?"])).toBeNull()
  })

  it("rejects empty and too-short strings", () => {
    expect(validateQuestion("")).toBeNull()
    expect(validateQuestion("   ")).toBeNull()
    expect(validateQuestion("When?")).toBeNull()
  })

  it("rejects a missing trailing question mark", () => {
    expect(validateQuestion("Tell me what time you meet.")).toBeNull()
    expect(validateQuestion("What time do you meet")).toBeNull()
  })

  it("rejects more than one question mark (two questions)", () => {
    expect(validateQuestion("What day? And what time?")).toBeNull()
  })

  it("rejects a second sentence before the question", () => {
    expect(validateQuestion("Got it. What time do you meet?")).toBeNull()
    expect(validateQuestion("Nice! What time do you meet?")).toBeNull()
  })

  it("rejects em and en dashes (copy rule)", () => {
    expect(validateQuestion("What time — roughly — do you meet?")).toBeNull()
    expect(validateQuestion("What time – roughly?")).toBeNull()
  })

  it("rejects newlines", () => {
    expect(validateQuestion("What time\ndo you meet?")).toBeNull()
  })

  it("rejects questions over the length cap", () => {
    expect(validateQuestion(`${"what ".repeat(40)}time?`)).toBeNull()
    expect(QUESTION_MAX).toBe(140)
  })
})

describe("resolveGapQuestion", () => {
  it("passes a valid model question through", () => {
    expect(resolveGapQuestion("time", "What time do you usually climb?")).toBe(
      "What time do you usually climb?"
    )
  })

  it("falls back to the template when the question is invalid", () => {
    expect(resolveGapQuestion("time", "Got it. What time?")).toBe(GAP_REASK_COPY.time)
  })

  it("falls back to the template when the question is null", () => {
    expect(resolveGapQuestion("ambiguous_time", null)).toBe(GAP_REASK_COPY.ambiguous_time)
  })

  it("every fire-exit template passes the validator (self-consistency)", () => {
    for (const template of Object.values(GAP_REASK_COPY)) {
      expect(validateQuestion(template)).toBe(template)
    }
  })
})

describe("readClarifyingQuestion", () => {
  it("reads a string question off raw output", () => {
    expect(readClarifyingQuestion({ clarifyingQuestion: "What time?" })).toBe("What time?")
  })

  it("returns null for absent, null, and non-string values", () => {
    expect(readClarifyingQuestion({})).toBeNull()
    expect(readClarifyingQuestion({ clarifyingQuestion: null })).toBeNull()
    expect(readClarifyingQuestion({ clarifyingQuestion: 7 })).toBeNull()
  })

  it("tolerates garbage shapes", () => {
    expect(readClarifyingQuestion(null)).toBeNull()
    expect(readClarifyingQuestion("What time?")).toBeNull()
    expect(readClarifyingQuestion(undefined)).toBeNull()
  })
})

describe("decideGapOutcome", () => {
  it("ready proceeds, discarding any rider question", () => {
    expect(decideGapOutcome(ready, "Want to double check the time?", 1)).toEqual({
      kind: "ready",
    })
  })

  it("incomplete under the cap asks, with the validated model question", () => {
    const outcome = decideGapOutcome(incomplete(), "What time do you usually climb?", 1)
    expect(outcome).toEqual({
      kind: "ask",
      missing: "time",
      question: "What time do you usually climb?",
    })
  })

  it("incomplete with an invalid question asks with the template", () => {
    const outcome = decideGapOutcome(incomplete(), "Hmm — not sure. What time?", 1)
    expect(outcome).toEqual({ kind: "ask", missing: "time", question: GAP_REASK_COPY.time })
  })

  it("escapes after two answers still leave the rhythm unschedulable", () => {
    expect(decideGapOutcome(incomplete(), "What time do you meet?", MAX_GAP_ROUNDS)).toEqual({
      kind: "escape",
    })
  })

  it("escapes when a merge loses everything schedulable, regardless of round", () => {
    // An empty or activity-less state has no gap card to anchor a
    // conversation; the describe screen is the honest place to recover.
    const lost = incomplete({ missing: "nothing_schedulable" })
    expect(decideGapOutcome(lost, "What do you do together?", 0)).toEqual({ kind: "escape" })
    const empty = incomplete({ rhythms: [] })
    expect(decideGapOutcome(empty, "What time do you meet?", 0)).toEqual({ kind: "escape" })
  })
})

describe("gapBubbleLine", () => {
  it("first ask leads with what Orbit got", () => {
    expect(gapBubbleLine("What time do you meet?", 0, false)).toBe(
      "Here's what I got. One question: What time do you meet?"
    )
  })

  it("a round that moved state says thanks", () => {
    expect(gapBubbleLine("What days do you meet?", 1, false)).toBe(
      "Thanks. One more thing: What days do you meet?"
    )
  })

  it("a stalled round acknowledges plainly instead of thanking", () => {
    expect(gapBubbleLine("What time do you meet?", 1, true)).toBe(
      `${GAP_STALLED_INTRO} What time do you meet?`
    )
    expect(GAP_STALLED_INTRO).not.toContain("Thanks")
  })

  it("the stalled flag is ignored on the first ask (nothing to stall on)", () => {
    expect(gapBubbleLine("What time do you meet?", 0, true)).toBe(
      "Here's what I got. One question: What time do you meet?"
    )
  })
})

describe("gapAnswerMoved", () => {
  const snapshot = (
    over: Partial<{ rhythms: StoredRhythm[]; groupName: string | null }> = {}
  ): { rhythms: StoredRhythm[]; groupName: string | null } => ({
    rhythms: [PARTIAL_RHYTHM],
    groupName: "Tuesday Climbers",
    ...over,
  })

  it("identical state means the answer moved nothing", () => {
    expect(gapAnswerMoved(snapshot(), snapshot())).toBe(false)
  })

  it("a title-only difference is derived display, not movement", () => {
    expect(
      gapAnswerMoved(snapshot(), snapshot({ rhythms: [{ ...PARTIAL_RHYTHM, title: "Climbing Tuesday" }] }))
    ).toBe(false)
  })

  it("a filled field is movement", () => {
    expect(
      gapAnswerMoved(snapshot(), snapshot({ rhythms: [{ ...PARTIAL_RHYTHM, timeLocal: "19:00" }] }))
    ).toBe(true)
  })

  it("a changed group name is movement", () => {
    expect(gapAnswerMoved(snapshot(), snapshot({ groupName: "The Crushers" }))).toBe(true)
  })

  it("an added rhythm is movement", () => {
    expect(
      gapAnswerMoved(snapshot(), snapshot({ rhythms: [PARTIAL_RHYTHM, { ...PARTIAL_RHYTHM, activity: "beers" }] }))
    ).toBe(true)
  })

  it("a venue change is movement (a venue-only answer is not a stalled round)", () => {
    expect(
      gapAnswerMoved(
        snapshot(),
        snapshot({ rhythms: [{ ...PARTIAL_RHYTHM, venueName: "Summit Gym" }] })
      )
    ).toBe(true)
  })
})

describe("enforceActivityCarryOver", () => {
  // The merge model must not re-derive fields the answer never touched. The
  // guard restores an activity that changed while its schedule stayed put
  // and the answer never named the new wording — the signature of the model
  // re-reading the description instead of carrying the prior state verbatim.
  const prior = [
    { activity: "climbing", title: "Climbing", cadence: "weekly" as const, daysOfWeek: [2], timeLocal: null },
    { activity: "beers", title: "Beers", cadence: "monthly" as const, daysOfWeek: null, timeLocal: null },
  ]
  const mergedRaw = (rhythms: unknown[]) => ({
    suggestedGroupName: "Tuesday Climbers",
    clarifyingQuestion: null,
    rhythms,
  })
  const rhythm = (over: Record<string, unknown> = {}) => ({
    activity: "climbing",
    cadence: "weekly",
    daysOfWeek: [2],
    timeLocal: null,
    timeAmbiguous: false,
    isPrimary: true,
    ...over,
  })

  it("restores a drifted activity the answer never mentioned", () => {
    const raw = mergedRaw([rhythm({ activity: "climb" })])
    const out = enforceActivityCarryOver(raw, prior, "hmm not sure") as { rhythms: { activity: string }[] }
    expect(out.rhythms[0].activity).toBe("climbing")
  })

  it("keeps an activity change the answer names", () => {
    const raw = mergedRaw([rhythm({ activity: "yoga" })])
    const out = enforceActivityCarryOver(raw, prior, "actually it's yoga we do") as {
      rhythms: { activity: string }[]
    }
    expect(out.rhythms[0].activity).toBe("yoga")
  })

  it("leaves a rhythm alone when its schedule fields differ (not the same rhythm)", () => {
    // A reordered or restructured list must never be 'corrected' by position.
    const raw = mergedRaw([rhythm({ activity: "beers", cadence: "monthly", daysOfWeek: null })])
    const out = enforceActivityCarryOver(raw, prior, "hmm not sure") as { rhythms: { activity: string }[] }
    expect(out.rhythms[0].activity).toBe("beers")
  })

  it("matches whole words only: brunch does not mention run", () => {
    const raw = mergedRaw([rhythm({ activity: "run" })])
    const out = enforceActivityCarryOver(raw, prior, "brunch plans sound good") as {
      rhythms: { activity: string }[]
    }
    expect(out.rhythms[0].activity).toBe("climbing")
  })

  it("a multi-word activity counts as mentioned when any word appears", () => {
    const raw = mergedRaw([rhythm({ activity: "board games" })])
    const out = enforceActivityCarryOver(raw, prior, "we mostly play games now") as {
      rhythms: { activity: string }[]
    }
    expect(out.rhythms[0].activity).toBe("board games")
  })

  it("tolerates garbage raw and returns it untouched", () => {
    expect(enforceActivityCarryOver(null, prior, "x")).toBeNull()
    expect(enforceActivityCarryOver("nope", prior, "x")).toBe("nope")
    const noRhythms = { suggestedGroupName: null }
    expect(enforceActivityCarryOver(noRhythms, prior, "x")).toEqual(noRhythms)
  })

  it("does not mutate its input", () => {
    const raw = mergedRaw([rhythm({ activity: "climb" })])
    enforceActivityCarryOver(raw, prior, "hmm not sure")
    expect((raw.rhythms[0] as { activity: string }).activity).toBe("climb")
  })
})

describe("enforceVenueCarryOver", () => {
  // A gap answer is about time, day, or cadence; it never legitimately
  // removes a standing venue. A merged rhythm that nulled a previously
  // captured venueName gets it restored, keyed on same-activity so a
  // restructured list is never "corrected" by position.
  const prior: StoredRhythm[] = [
    { activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2], timeLocal: null, venueName: "Summit Gym" },
  ]
  const mergedRaw = (rhythms: unknown[]) => ({
    suggestedGroupName: "Tuesday Climbers",
    clarifyingQuestion: null,
    rhythms,
  })
  const rhythm = (over: Record<string, unknown> = {}) => ({
    activity: "climbing",
    cadence: "weekly",
    daysOfWeek: [2],
    timeLocal: "19:00",
    timeAmbiguous: false,
    isPrimary: true,
    venueName: null,
    ...over,
  })

  it("restores a venueName the merged output nulled (a time answer never removes a venue)", () => {
    const out = enforceVenueCarryOver(mergedRaw([rhythm()]), prior) as {
      rhythms: { venueName: unknown }[]
    }
    expect(out.rhythms[0].venueName).toBe("Summit Gym")
  })

  it("leaves a replacement venue alone (latest word wins)", () => {
    const out = enforceVenueCarryOver(mergedRaw([rhythm({ venueName: "Movement" })]), prior) as {
      rhythms: { venueName: unknown }[]
    }
    expect(out.rhythms[0].venueName).toBe("Movement")
  })

  it("does nothing when prior had no venue", () => {
    const noVenuePrior = [{ ...prior[0], venueName: null }]
    const out = enforceVenueCarryOver(mergedRaw([rhythm()]), noVenuePrior) as {
      rhythms: { venueName: unknown }[]
    }
    expect(out.rhythms[0].venueName).toBeNull()
  })

  it("does not restore across an activity change", () => {
    const out = enforceVenueCarryOver(mergedRaw([rhythm({ activity: "running" })]), prior) as {
      rhythms: { venueName: unknown }[]
    }
    expect(out.rhythms[0].venueName).toBeNull()
  })

  it("passes garbage shapes through untouched", () => {
    expect(enforceVenueCarryOver(null, prior)).toBeNull()
    expect(enforceVenueCarryOver("nope", prior)).toBe("nope")
    const noRhythms = { suggestedGroupName: null }
    expect(enforceVenueCarryOver(noRhythms, prior)).toEqual(noRhythms)
  })

  it("does not mutate its input", () => {
    const raw = mergedRaw([rhythm()])
    enforceVenueCarryOver(raw, prior)
    expect((raw.rhythms[0] as { venueName: unknown }).venueName).toBeNull()
  })
})

describe("copy rules", () => {
  it("no em or en dashes in any gap copy", () => {
    const all = [
      ...Object.values(GAP_REASK_COPY),
      ...GAP_ROUND_INTRO,
      GAP_STALLED_INTRO,
      ...Object.values(GAP_HINT_EXAMPLES),
    ]
    for (const copy of all) {
      expect(copy).not.toMatch(/[—–]/)
    }
  })

  it("hint examples are display-ready strings with an e.g. lead", () => {
    for (const hint of Object.values(GAP_HINT_EXAMPLES)) {
      expect(hint.startsWith("e.g. ")).toBe(true)
    }
  })

  it("cadence hint does not suggest a monthly rhythm, which the product can't schedule", () => {
    expect(GAP_HINT_EXAMPLES.cadence).toBe("e.g. “yep, every week”")
  })
})
