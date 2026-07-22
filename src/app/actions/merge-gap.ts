// src/app/actions/merge-gap.ts
//
// One gap-ask round: the founder's answer goes up with the description and
// the current partial state, the merged extraction comes back, and the pure
// decision seam (gap.ts) picks the outcome. This action is plumbing over
// tested pure functions; it holds no decision logic of its own.
//
// The gap payload round-trips through the client, so nothing in it is
// trusted: rhythms re-validated through parseStoredRhythms, the gap kind
// whitelisted, the candidate re-checked, the round clamped. Even a fully
// forged ready profile would still hit the unchanged server gate in
// createGroupAction before anything is created.

"use server"

import { mergeGapAnswer } from "@/lib/orbit/merge"
import { normalizeExtraction } from "@/lib/orbit/normalize"
import {
  MAX_GAP_ROUNDS,
  decideGapOutcome,
  enforceActivityCarryOver,
  enforceVenueCarryOver,
  gapAnswerMoved,
  readClarifyingQuestion,
  type GapAskable,
} from "@/lib/orbit/gap"
import { parseStoredRhythms, type StoredRhythm } from "@/lib/orbit/rhythm"
import type { GapPayload } from "./extract-group"

const DESCRIPTION_MAX = 2000
const ANSWER_MAX = 500
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const GAP_KINDS: readonly GapAskable[] = ["time", "day", "both", "cadence", "ambiguous_time"]

export interface MergeGapInput {
  description: string
  answer: string
  /** Answers given before this one: 0 or 1. */
  round: number
  gap: {
    missing: GapAskable
    groupName: string | null
    rhythms: unknown
    candidateTimeLocal: string | null
  }
}

export type MergeGapResult =
  | { status: "error" }
  | { status: "ready"; profile: { groupName: string; rhythms: StoredRhythm[] } }
  | {
      status: "incomplete"
      gap: GapPayload
      round: number
      /** False when the answer moved nothing; the next lead-in acknowledges
       * that plainly instead of thanking the founder for nothing. */
      progressed: boolean
    }
  | { status: "exhausted" }

export async function mergeGapAction(input: MergeGapInput): Promise<MergeGapResult> {
  const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX)
  const answer = (input.answer ?? "").trim().slice(0, ANSWER_MAX)
  if (!description || !answer) return { status: "error" }

  if (!GAP_KINDS.includes(input.gap?.missing)) return { status: "error" }
  const currentState = parseStoredRhythms(input.gap.rhythms)
  if (currentState === null || currentState.length === 0) return { status: "error" }

  const groupName =
    typeof input.gap.groupName === "string" && input.gap.groupName.trim().length > 0
      ? input.gap.groupName.trim().slice(0, 50)
      : null
  const candidateTimeLocal =
    typeof input.gap.candidateTimeLocal === "string" && TIME_RE.test(input.gap.candidateTimeLocal)
      ? input.gap.candidateTimeLocal
      : null

  // A tampered or drifted round can only shorten the loop, never extend it.
  const round = Number.isInteger(input.round)
    ? Math.min(Math.max(input.round, 0), MAX_GAP_ROUNDS)
    : MAX_GAP_ROUNDS

  let raw: unknown
  try {
    raw = await mergeGapAnswer({
      description,
      groupName,
      currentState,
      candidateTimeLocal,
      askedAbout: input.gap.missing,
      answer,
    })
  } catch (err) {
    // Same soft-retry contract as extraction: the founder keeps their draft
    // and the round is not consumed.
    console.error("[onboarding] gap merge failed:", err)
    return { status: "error" }
  }

  // Carry-verbatim enforcement before normalization: an activity the answer
  // never mentioned must not drift just because the model re-read the
  // description (observed in QA: CLIMBING became CLIMB after "not sure").
  raw = enforceActivityCarryOver(raw, currentState, answer)
  // Activity first, so a drift-restored activity lets the venue guard's
  // same-activity match succeed.
  raw = enforceVenueCarryOver(raw, currentState)

  const normalized = normalizeExtraction(raw)
  const outcome = decideGapOutcome(normalized, readClarifyingQuestion(raw), round + 1)

  if (outcome.kind === "ready") {
    if (normalized.status !== "ready") return { status: "error" } // unreachable; type guard
    return {
      status: "ready",
      profile: { groupName: normalized.groupName, rhythms: normalized.rhythms },
    }
  }

  if (outcome.kind === "escape") return { status: "exhausted" }

  if (normalized.status !== "incomplete") return { status: "error" } // unreachable; type guard
  return {
    status: "incomplete",
    round: round + 1,
    progressed: gapAnswerMoved(
      { rhythms: currentState, groupName },
      { rhythms: normalized.rhythms, groupName: normalized.groupName }
    ),
    gap: {
      missing: outcome.missing,
      question: outcome.question,
      groupName: normalized.groupName,
      rhythms: normalized.rhythms,
      candidateTimeLocal: normalized.candidateTimeLocal,
    },
  }
}
