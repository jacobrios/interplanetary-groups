// src/lib/orbit/gap.ts
//
// Pure decision logic for the onboarding gap-ask loop: question validation,
// the fire-exit fallback to static templates, and the round/cap control
// flow. This is the CI-covered seam — the server action is plumbing over
// these functions, and the model's generated question is a claim that
// nothing renders until validateQuestion has passed it.
//
// Copy rules honored here: no em/en dashes, plain warm Orbit voice, soft
// phrasing. The templates are the fire exit, not the front door: they only
// surface when generation fails or violates its constraints.

import type { MissingField, NormalizedOnboarding } from "./normalize"

/** Gaps the conversational loop can ask about. nothing_schedulable has no
 * partial card to anchor a conversation, so it stays on (or escapes to) the
 * describe screen. */
export type GapAskable = Exclude<MissingField, "nothing_schedulable">

/** Two founder answers maximum, then the edit-description escape hatch. */
export const MAX_GAP_ROUNDS = 2

/** Code-side cap; the prompt asks for under 120, leaving headroom. */
export const QUESTION_MAX = 140

/** Static fire-exit questions, phrased for the message input (the founder
 * answers in a box, not by editing their description — REASK_COPY in
 * playback.ts keeps the description-editing phrasing for Step 1). */
export const GAP_REASK_COPY: Record<GapAskable, string> = {
  time: "What time do you usually meet?",
  day: "What days do you usually meet?",
  both: "What day and time do you usually meet?",
  cadence: "Is that every week?",
  ambiguous_time: "Is that in the morning or the evening?",
}

/** Deterministic bubble lead-ins per round, composed by code around the one
 * validated model sentence (structured-extract-then-format). */
export const GAP_ROUND_INTRO: [string, string] = [
  "Here's what I got. One question:",
  "Thanks. One more thing:",
]

/** Hint line under the message input, per gap. Display-ready. The examples
 * deliberately model answerable answers: "we start at 7pm", never the
 * ambiguous "we start at 7" (a recorded deviation from the mockup copy). */
export const GAP_HINT_EXAMPLES: Record<GapAskable, string> = {
  time: "e.g. “around 9am” · “we start at 7pm”",
  day: "e.g. “Tuesdays” · “Mon and Wed”",
  both: "e.g. “Tuesdays at 7pm” · “Saturday mornings at 9”",
  cadence: "e.g. “yep, every week” · “once a month”",
  ambiguous_time: "e.g. “in the morning” · “7 at night”",
}

/** Read the model's question off raw output without trusting it. */
export function readClarifyingQuestion(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null
  const q = (raw as Record<string, unknown>).clarifyingQuestion
  return typeof q === "string" ? q : null
}

/**
 * The hard gate between generated prose and the screen. One sentence ending
 * in exactly one question mark, 8 to QUESTION_MAX characters, no em/en
 * dashes, no newlines, no earlier sentence enders (a period or exclamation
 * mark before the ? means two sentences). Returns the trimmed question, or
 * null so the caller falls back to a template.
 */
export function validateQuestion(q: unknown): string | null {
  if (typeof q !== "string") return null
  const trimmed = q.trim()
  if (trimmed.length < 8 || trimmed.length > QUESTION_MAX) return null
  if (!trimmed.endsWith("?")) return null
  if (trimmed.indexOf("?") !== trimmed.length - 1) return null
  if (/[—–\n\r.!]/.test(trimmed)) return null
  return trimmed
}

/** Validated model question, else the static template. */
export function resolveGapQuestion(missing: GapAskable, rawQuestion: unknown): string {
  return validateQuestion(rawQuestion) ?? GAP_REASK_COPY[missing]
}

export type GapOutcome =
  | { kind: "ready" }
  | { kind: "ask"; missing: GapAskable; question: string }
  | { kind: "escape" }

/**
 * All round/cap/fallback control flow, pure. answersGiven counts founder
 * answers submitted so far, including the one just merged (0 when deciding
 * off the initial extraction). Ready discards any rider question; a state
 * with nothing schedulable to show escapes to the describe screen no matter
 * the round; the round cap enforces the two-answer maximum.
 */
export function decideGapOutcome(
  normalized: NormalizedOnboarding,
  rawQuestion: unknown,
  answersGiven: number
): GapOutcome {
  if (normalized.status === "ready") return { kind: "ready" }
  if (normalized.missing === "nothing_schedulable" || normalized.rhythms.length === 0) {
    return { kind: "escape" }
  }
  if (answersGiven >= MAX_GAP_ROUNDS) return { kind: "escape" }
  return {
    kind: "ask",
    missing: normalized.missing,
    question: resolveGapQuestion(normalized.missing, rawQuestion),
  }
}
