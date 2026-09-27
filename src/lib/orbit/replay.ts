// src/lib/orbit/replay.ts
//
// "Remembered answers" for onboarding step 1: when a founder goes back to
// step 1 and re-describes the group, answers they already gave Orbit in the
// gap-ask conversation fill whatever the new description still leaves
// missing, so they are not asked again for something they already told us.
// The new description always wins a disagreement: an old "Tuesdays" answer
// can fill a day the description never named, but it can never overwrite a
// "Thursdays" the founder just wrote.
//
// No new model call and no prompt change: the answers are replayed through
// the same merge call a live gap round uses (merge.ts), joined into one
// answer, followed by the same carry-over guards merge-gap.ts runs, and then
// one more guard of our own (enforceFreshFieldsWin) that makes "the
// description wins" a property of code rather than a hope about the model.
//
// This is also the seam the onboarding bench's `replay-*` cases call
// (evals/onboarding/run.ts), so the bench grades exactly the production path.

import { extractGroupProfile } from "./extract"
import { mergeGapAnswer } from "./merge"
import { normalizeExtraction } from "./normalize"
import {
  ANSWER_MAX,
  GAP_ASKABLE_KINDS,
  enforceActivityCarryOver,
  enforceVenueCarryOver,
  type GapAskable,
} from "./gap"
import type { StoredRhythm } from "./rhythm"

/** Answers kept for a replay. A full gap conversation is at most three
 * answers; six leaves room for a second pass through step 1 without letting
 * a forged field grow the merge prompt without bound. */
const PRIOR_ANSWERS_MAX = 6

/**
 * Read the browser's remembered answers without trusting them. The wizard
 * sends a JSON array of strings; anything else (junk, a non-array, a File,
 * nothing at all) is treated as no answers rather than an error, because a
 * missing memory only costs the founder a question they would have been
 * asked anyway. Each answer gets the same trim and cap a live answer gets,
 * and only the most recent six are kept. Never throws.
 */
export function parsePriorAnswers(raw: unknown): string[] {
  if (typeof raw !== "string") return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim().slice(0, ANSWER_MAX))
    .filter((a) => a.length > 0)
    .slice(-PRIOR_ANSWERS_MAX)
}

/**
 * "The description wins", on the raw merged claim, after the carry-over
 * guards and before normalization. For each merged rhythm whose activity
 * matches a rhythm from the fresh extraction (case-insensitive, trimmed),
 * every field the fresh rhythm actually stated (non-null) is put back:
 * days, time, spot, cadence. A field the fresh rhythm left empty is exactly
 * what a remembered answer is for, so it stays as merged. A merged rhythm
 * with no fresh match is left alone, like the other guards, so nothing is
 * ever "corrected" onto a rhythm it does not belong to.
 *
 * A restored time also clears `timeAmbiguous`: a non-null fresh time is a
 * definite one (normalize nulls ambiguous guesses into candidateTimeLocal),
 * and leaving the flag set would let normalization null the very time this
 * guard just restored.
 *
 * The fresh group name, when there is one, likewise beats the merged
 * suggestion; it lands on `suggestedGroupName`, the raw claim's field.
 */
export function enforceFreshFieldsWin(
  raw: unknown,
  fresh: StoredRhythm[],
  freshGroupName: string | null
): unknown {
  if (raw === null || typeof raw !== "object") return raw
  const rhythms = (raw as Record<string, unknown>).rhythms
  if (!Array.isArray(rhythms)) return raw

  const out = structuredClone(raw) as Record<string, unknown> & { rhythms: unknown[] }
  if (freshGroupName !== null) out.suggestedGroupName = freshGroupName

  for (const item of out.rhythms) {
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const activity = typeof o.activity === "string" ? o.activity.trim().toLowerCase() : ""
    if (!activity) continue
    const f = fresh.find((r) => r.activity.trim().toLowerCase() === activity)
    if (!f) continue

    if (f.daysOfWeek !== null) o.daysOfWeek = [...f.daysOfWeek]
    if (f.timeLocal !== null) {
      o.timeLocal = f.timeLocal
      o.timeAmbiguous = false
    }
    if (f.venueName) o.venueName = f.venueName
    if (f.cadence !== null) o.cadence = f.cadence
  }
  return out
}

function isGapAskable(m: string): m is GapAskable {
  return (GAP_ASKABLE_KINDS as readonly string[]).includes(m)
}

/**
 * Extract the description, then let remembered answers fill what it still
 * leaves missing. Returns a raw claim either way, so the caller normalizes
 * it exactly as it normalizes a plain extraction.
 *
 * The answers are skipped when there are none, and when the fresh
 * extraction is already ready or has nothing schedulable: a complete
 * description needs no help, and an unusable one gives the merge nothing to
 * anchor to. A failed replay is fail-soft (the founder is simply asked, as
 * before this existed); a failed extraction, including ModelUnavailableError,
 * propagates unchanged so the action's existing error states still apply.
 */
export async function extractWithPriorAnswers(
  description: string,
  priorAnswers: string[]
): Promise<unknown> {
  const extracted = await extractGroupProfile(description)
  if (priorAnswers.length === 0) return extracted

  const fresh = normalizeExtraction(extracted)
  if (fresh.status === "ready") return extracted
  if (fresh.rhythms.length === 0 || !isGapAskable(fresh.missing)) return extracted

  // Same order as merge-gap.ts: activity first, so a drift-restored activity
  // lets the venue guard's same-activity match succeed, then our own guard
  // last so nothing after it can undo the description's word.
  const answer = priorAnswers.join("\n")
  try {
    let raw = await mergeGapAnswer({
      description,
      groupName: fresh.groupName,
      currentState: fresh.rhythms,
      candidateTimeLocal: fresh.candidateTimeLocal,
      askedAbout: fresh.missing,
      answer,
    })
    raw = enforceActivityCarryOver(raw, fresh.rhythms, answer)
    raw = enforceVenueCarryOver(raw, fresh.rhythms)
    return enforceFreshFieldsWin(raw, fresh.rhythms, fresh.groupName)
  } catch (err) {
    console.error("[onboarding] prior-answer replay failed:", err)
    return extracted
  }
}
