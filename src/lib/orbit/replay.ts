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
 * what a remembered answer is for, so it stays as merged.
 *
 * A merged rhythm with no name match is paired by position instead, but
 * only when the merged and fresh lists are the same length (so the list was
 * not restructured; the primary is index 0 on both) and only onto a fresh
 * rhythm no other merged rhythm already matched by name. That covers the
 * merge renaming the activity ("climbing" drifting to "climb", or an answer
 * saying "bouldering at 7") while also changing the days, which is exactly
 * when enforceActivityCarryOver declines to restore the name; without this
 * the description would lose on every field. A positional pairing also
 * restores the fresh activity, because the name is something the
 * description said. When the lengths differ, an unmatched merged rhythm is
 * left alone, like the other guards, so nothing is ever "corrected" onto a
 * rhythm it does not belong to.
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

  const key = (a: unknown) => (typeof a === "string" ? a.trim().toLowerCase() : "")
  const freshKeys = fresh.map((r) => key(r.activity))
  const mergedKeys = out.rhythms.map((item) =>
    item !== null && typeof item === "object" ? key((item as Record<string, unknown>).activity) : ""
  )
  const samePositions = out.rhythms.length === fresh.length

  out.rhythms.forEach((item, i) => {
    if (item === null || typeof item !== "object") return
    const o = item as Record<string, unknown>
    let f = mergedKeys[i] ? fresh.find((_, j) => freshKeys[j] === mergedKeys[i]) : undefined
    if (!f && samePositions && !mergedKeys.includes(freshKeys[i])) {
      f = fresh[i]
      o.activity = f.activity
    }
    if (!f) return

    if (f.daysOfWeek !== null) o.daysOfWeek = [...f.daysOfWeek]
    if (f.timeLocal !== null) {
      o.timeLocal = f.timeLocal
      o.timeAmbiguous = false
    }
    if (f.venueName) o.venueName = f.venueName
    if (f.cadence !== null) o.cadence = f.cadence
  })
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
 * before this existed), and "failed" covers more than a thrown merge: a
 * merged claim that normalizes to nothing schedulable, or to fewer rhythms
 * than the description alone gave (an empty or unparseable list, a dropped
 * primary), is discarded for the plain extraction too, so a replay can never
 * leave the founder worse off than the description would have. A failed
 * extraction, including ModelUnavailableError, propagates unchanged so the
 * action's existing error states still apply.
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
    raw = enforceFreshFieldsWin(raw, fresh.rhythms, fresh.groupName)

    const merged = normalizeExtraction(raw)
    const worse =
      merged.rhythms.length === 0 ||
      merged.rhythms.length < fresh.rhythms.length ||
      (merged.status === "incomplete" && merged.missing === "nothing_schedulable")
    return worse ? extracted : raw
  } catch (err) {
    console.error("[onboarding] prior-answer replay failed:", err)
    return extracted
  }
}
