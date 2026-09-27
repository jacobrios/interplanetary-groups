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

import { needsSpot, isNonAnswerVenue, type MissingField, type NormalizedOnboarding } from "./normalize"
import type { StoredRhythm } from "./rhythm"

/** Gaps the conversational loop can ask about. nothing_schedulable has no
 * partial card to anchor a conversation, so it stays on (or escapes to) the
 * describe screen. */
export type GapAskable = Exclude<MissingField, "nothing_schedulable">

/** Three founder answers maximum, then the edit-description escape hatch. */
export const MAX_GAP_ROUNDS = 3

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
  spot: "Where do you usually meet?",
  time_spot: "What time do you meet, and where?",
  day_spot: "What days do you meet, and where?",
  both_spot: "What day and time do you meet, and where?",
  cadence_spot: "Is that every week, and where do you meet?",
  ambiguous_time_spot: "Is that morning or evening, and where do you meet?",
}

/** All eleven askable kinds, in a fixed order used to drive per-kind checks. */
export const GAP_ASKABLE_KINDS = [
  "time",
  "day",
  "both",
  "cadence",
  "ambiguous_time",
  "spot",
  "time_spot",
  "day_spot",
  "both_spot",
  "cadence_spot",
  "ambiguous_time_spot",
] as const satisfies readonly GapAskable[]

/** Deterministic bubble lead-ins per round, composed by code around the one
 * validated model sentence (structured-extract-then-format). Round 0's
 * lead-in folds straight into the question as one sentence ("...but what
 * time do you meet?"), so it carries no trailing colon and its question is
 * lowercased at the join (see foldQuestionIntoLeadIn). Later rounds keep
 * the question as its own sentence after a colon. */
export const GAP_ROUND_INTRO: [string, string] = [
  "Here's what I got, but",
  "Thanks. One more thing:",
]

/** Lead-in for a round whose answer moved nothing. Honest instead of
 * grateful: no thanks for an answer that gave nothing, no pretending the
 * repeat is a new question, and no scolding — Orbit re-asks softly. */
export const GAP_STALLED_INTRO = "No worries. Let me ask again:"

/** True when a question opens with the standalone word "I" (I'm, I've,
 * I'd...), which must never be lowercased even at the start of a folded
 * sentence: "i'm" is not a word. */
function startsWithStandaloneI(question: string): boolean {
  return /^I['’]|^I\s/.test(question)
}

/** True when the question opens with an acronym or other all-caps word
 * (its first two characters both uppercase letters: "OK", "NYC"...).
 * Lowercasing only the first letter of an acronym produces a non-word
 * ("oK", "nYC"), so these are left exactly as the model or fallback wrote
 * them, same as the standalone "I" case. */
function startsWithAcronym(question: string): boolean {
  return /^[A-Z]{2}/.test(question)
}

/**
 * Round 0's lead-in folds directly into the question as one sentence
 * ("Here's what I got, but what time..."), so the question's first letter
 * is lowercased to read as a continuation rather than a second sentence.
 * Two exceptions: a question that opens with the standalone word "I"
 * (lowercasing would produce "i'm", never a real word), and one that opens
 * with an acronym or other all-caps word (lowercasing only its first
 * letter would produce "oK" or "nYC", not the real word either).
 */
function foldQuestionIntoLeadIn(question: string): string {
  if (startsWithStandaloneI(question) || startsWithAcronym(question)) return question
  return question.charAt(0).toLowerCase() + question.slice(1)
}

/**
 * The full bubble line: deterministic lead-in plus the one validated (or
 * template) question. Round 0 folds the question into the lead-in as one
 * sentence; later rounds thank the founder (or, if stalled, acknowledge
 * plainly) and keep the question as its own sentence, unchanged.
 */
export function gapBubbleLine(question: string, answersGiven: number, stalled: boolean): string {
  if (answersGiven === 0) {
    return `${GAP_ROUND_INTRO[0]} ${foldQuestionIntoLeadIn(question)}`
  }
  const intro = stalled ? GAP_STALLED_INTRO : GAP_ROUND_INTRO[1]
  return `${intro} ${question}`
}

/** The fields a founder's answer can genuinely move. Titles are derived
 * display data and candidate/classification are code-side bookkeeping, so
 * none of them count as movement. */
interface GapStateSnapshot {
  rhythms: StoredRhythm[]
  groupName: string | null
}

function projectRhythms(rhythms: StoredRhythm[]): string {
  return JSON.stringify(
    rhythms.map((r) => ({
      activity: r.activity,
      cadence: r.cadence,
      daysOfWeek: r.daysOfWeek,
      timeLocal: r.timeLocal,
      venueName: r.venueName ?? null,
    }))
  )
}

/**
 * Did the founder's answer move anything? Compares the schedule-bearing
 * fields and the name suggestion between the state sent up and the state
 * that came back. Drives the lead-in choice: a stalled round is
 * acknowledged plainly instead of being thanked for nothing.
 */
export function gapAnswerMoved(prior: GapStateSnapshot, next: GapStateSnapshot): boolean {
  return (
    projectRhythms(prior.rhythms) !== projectRhythms(next.rhythms) ||
    prior.groupName !== next.groupName
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function answerMentions(activity: string, answer: string): boolean {
  return activity
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(answer))
}

/**
 * Carry-verbatim enforcement on the raw merged claim, before normalization.
 * The merge rule is that fields the answer does not touch carry exactly;
 * in practice the model can re-derive the activity from the description
 * ("climbing" drifting to "climb" after an unrelated answer). A genuine
 * founder-driven activity change necessarily names the new activity in the
 * answer, so: when a rhythm's schedule fields (cadence, days) still match
 * the prior rhythm at the same position but its activity changed to wording
 * the answer never mentions, the prior activity is restored. Schedule
 * mismatches are left alone — a restructured or reordered list must never
 * be "corrected" by position.
 */
export function enforceActivityCarryOver(
  raw: unknown,
  prior: StoredRhythm[],
  answer: string
): unknown {
  if (raw === null || typeof raw !== "object") return raw
  const rhythms = (raw as Record<string, unknown>).rhythms
  if (!Array.isArray(rhythms)) return raw

  const out = structuredClone(raw) as { rhythms: unknown[] }
  const n = Math.min(rhythms.length, prior.length)
  for (let i = 0; i < n; i++) {
    const item = out.rhythms[i]
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const p = prior[i]

    const activity = typeof o.activity === "string" ? o.activity.trim() : ""
    if (!activity || activity.toLowerCase() === p.activity.toLowerCase()) continue

    const sameSchedule =
      (o.cadence ?? null) === p.cadence &&
      JSON.stringify(o.daysOfWeek ?? null) === JSON.stringify(p.daysOfWeek)
    if (!sameSchedule) continue

    if (!answerMentions(activity, answer)) {
      o.activity = p.activity
    }
  }
  return out
}

/**
 * Venue carry-over on the raw merged claim, run right after the activity
 * guard. A gap answer can now be about the spot as well as time, day, or
 * cadence, but it never legitimately removes a standing venue, so a merged
 * rhythm that nulled a previously captured venueName gets it restored — but
 * only when the rhythm is recognizably the same one (same activity), so a
 * restructured list is never "corrected" by position. A replacement venue
 * (non-null, and not itself a non-answer like "idk") is the founder's
 * latest word and is left alone; a non-answer in the merged output is
 * treated as empty so "idk" in an answer can never overwrite a spot the
 * founder already gave. Unlike the activity guard this consults no answer
 * text: there is no legitimate path from any answer to "remove the venue",
 * only to "replace it".
 */
export function enforceVenueCarryOver(raw: unknown, prior: StoredRhythm[]): unknown {
  if (raw === null || typeof raw !== "object") return raw
  const rhythms = (raw as Record<string, unknown>).rhythms
  if (!Array.isArray(rhythms)) return raw

  const out = structuredClone(raw) as { rhythms: unknown[] }
  const n = Math.min(rhythms.length, prior.length)
  for (let i = 0; i < n; i++) {
    const item = out.rhythms[i]
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const p = prior[i]
    if (!p.venueName) continue

    const merged = typeof o.venueName === "string" ? o.venueName.trim() : ""
    if (merged && !isNonAnswerVenue(merged)) continue

    const activity = typeof o.activity === "string" ? o.activity.trim().toLowerCase() : ""
    if (activity === p.activity.toLowerCase()) o.venueName = p.venueName
  }
  return out
}

/** Hint line under the message input, per gap. Display-ready. The examples
 * deliberately model answerable answers: "we start at 7pm", never the
 * ambiguous "we start at 7" (a recorded deviation from the mockup copy). */
export const GAP_HINT_EXAMPLES: Record<GapAskable, string> = {
  time: "e.g. “around 9am” · “we start at 7pm”",
  day: "e.g. “Tuesdays” · “Mon and Wed”",
  both: "e.g. “Tuesdays at 7pm” · “Saturday mornings at 9”",
  cadence: "e.g. “yep, every week”",
  ambiguous_time: "e.g. “in the morning” · “7 at night”",
  spot: "e.g. “Movement Gowanus” · “Sam’s place”",
  time_spot: "e.g. “7pm at Movement”",
  day_spot: "e.g. “Tuesdays at Movement”",
  both_spot: "e.g. “Tuesdays at 7pm, at Movement”",
  cadence_spot: "e.g. “yep, every week, at Movement”",
  ambiguous_time_spot: "e.g. “7 at night, at Movement”",
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

/** A question counts as asking for the place only if it says so. */
export const PLACE_WORD_RE = /\b(where|place|spot)\b/i

/** The fire exit. Only `spot` is composed, so it can name the activity the
 * founder used; a composed string that fails the validator (an activity
 * with a period in it, say) falls back to the generic one. */
export function gapFallbackQuestion(missing: GapAskable, activity: string): string {
  if (missing === "spot") {
    return validateQuestion(`Where do you usually meet for ${activity}?`) ?? GAP_REASK_COPY.spot
  }
  return GAP_REASK_COPY[missing]
}

/** Validated model question, else the fire exit. For a kind that still needs
 * the spot, a question that never asks where is treated as invalid: the card
 * marks the place as missing, and front section decision 2 says one message
 * asks for everything, so a time-only question must not reach the screen. */
export function resolveGapQuestion(
  missing: GapAskable,
  rawQuestion: unknown,
  activity: string
): string {
  const q = validateQuestion(rawQuestion)
  if (q !== null && (!needsSpot(missing) || PLACE_WORD_RE.test(q))) return q
  return gapFallbackQuestion(missing, activity)
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
 * the round; the round cap enforces the three-answer maximum.
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
    question: resolveGapQuestion(normalized.missing, rawQuestion, normalized.rhythms[0].activity),
  }
}
