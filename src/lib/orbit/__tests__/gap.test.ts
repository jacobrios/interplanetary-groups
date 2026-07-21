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
  MAX_GAP_ROUNDS,
  QUESTION_MAX,
  decideGapOutcome,
  readClarifyingQuestion,
  resolveGapQuestion,
  validateQuestion,
} from "../gap"
import type { NormalizedOnboarding } from "../normalize"

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

describe("copy rules", () => {
  it("no em or en dashes in any gap copy", () => {
    const all = [
      ...Object.values(GAP_REASK_COPY),
      ...GAP_ROUND_INTRO,
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
})
