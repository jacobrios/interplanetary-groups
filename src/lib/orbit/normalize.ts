// src/lib/orbit/normalize.ts
//
// Turns raw extraction output (a claim) into the normalized onboarding profile
// (a fact) — CLAUDE.md guardrail: nothing branches on model output until it
// has been validated and normalized here. Structured outputs enforces the wire
// shape; this layer owns semantics: range checks, cadence whitelist, primary
// promotion, the position-zero guarantee, and the completeness gate.
// Pure and synchronous by design so every rule is unit-testable.

import { cleanVenueName, titleCaseActivity, type StoredRhythm } from "./rhythm"

export type MissingField =
  | "time"
  | "day"
  | "both"
  | "cadence"
  | "ambiguous_time"
  | "nothing_schedulable"

export type NormalizedOnboarding =
  | { status: "ready"; groupName: string; rhythms: StoredRhythm[] }
  | {
      status: "incomplete"
      missing: MissingField
      /**
       * Partial state for the gap-ask card and the merge call. The gapped
       * primary is at [0]; empty only when no rhythm survived sanitization.
       * Ambiguous time guesses are nulled here — see candidateTimeLocal.
       */
      rhythms: StoredRhythm[]
      /** Cleaned suggestion or null — never the derived fallback (it needs a schedulable primary). */
      groupName: string | null
      /**
       * The model's best-guess reading of an ambiguous clock time ("Tuesdays
       * at 7" → "19:00"). Carried separately so the unverified guess never
       * sits in a StoredRhythm field a later reader could take as fact.
       */
      candidateTimeLocal: string | null
    }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const NAME_MAX = 50

interface Candidate {
  activity: string
  cadence: "weekly" | "monthly" | null
  daysOfWeek: number[] | null
  timeLocal: string | null
  timeAmbiguous: boolean
  isPrimary: boolean
  venueName: string | null
}

/**
 * Field-level sanitization. Invalid values degrade to "not stated" (null)
 * rather than erroring, so one malformed field never discards a usable
 * extraction — the completeness gate below decides what to do with gaps.
 * Rhythms without a usable activity are dropped entirely.
 */
function sanitize(raw: unknown): { rhythms: Candidate[]; suggestedName: string | null } {
  if (raw === null || typeof raw !== "object") return { rhythms: [], suggestedName: null }
  const r = raw as Record<string, unknown>
  const suggestedName = typeof r.suggestedGroupName === "string" ? r.suggestedGroupName : null
  if (!Array.isArray(r.rhythms)) return { rhythms: [], suggestedName }

  const rhythms: Candidate[] = []
  for (const item of r.rhythms) {
    if (item === null || typeof item !== "object") continue
    const o = item as Record<string, unknown>

    const activity = typeof o.activity === "string" ? o.activity.trim() : ""
    if (!activity) continue

    const cadence = o.cadence === "weekly" || o.cadence === "monthly" ? o.cadence : null

    let daysOfWeek: number[] | null = null
    if (Array.isArray(o.daysOfWeek)) {
      const valid = [
        ...new Set(
          o.daysOfWeek.filter(
            (d): d is number =>
              typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6
          )
        ),
      ]
      if (valid.length > 0) daysOfWeek = valid
    }

    const timeLocal =
      typeof o.timeLocal === "string" && TIME_RE.test(o.timeLocal) ? o.timeLocal : null

    // The flag is only meaningful alongside a stated time; anything non-true,
    // or a flag with no parsed time, degrades to false (just a missing time).
    const timeAmbiguous = o.timeAmbiguous === true && timeLocal !== null

    rhythms.push({
      activity,
      cadence,
      daysOfWeek,
      timeLocal,
      timeAmbiguous,
      isPrimary: o.isPrimary === true,
      // Venue never participates in the completeness gate below; it is
      // carried data, sanitized like everything else (trim/cap/empty→null).
      venueName: cleanVenueName(o.venueName),
    })
  }
  return { rhythms, suggestedName }
}

/** Complete enough to put an event on the card: weekly cadence, ≥1 day, an unambiguous time. */
function isSchedulable(c: Candidate): boolean {
  return (
    c.cadence === "weekly" && c.daysOfWeek !== null && c.timeLocal !== null && !c.timeAmbiguous
  )
}

/**
 * Event title, derived deterministically, never extracted. The title is the
 * founder's activity and nothing else: the date sits directly under the
 * title on every surface that shows one, so naming a weekday in the title
 * too would be duplicated information whose only possible future is to go
 * stale (a Mon/Wed/Fri rhythm's Friday event still reading "Climbing Monday").
 */
function deriveTitle(c: Candidate): string {
  return titleCaseActivity(c.activity)
}

/**
 * The one model-suggested string that reaches the founder: normalized (trim,
 * strip em/en dashes per the copy rules, collapse whitespace, cap length).
 * Null when nothing usable was suggested. The playback row is editable, so
 * this is a starting point, not a decision.
 */
function cleanSuggestedName(suggested: string | null): string | null {
  const cleaned = (suggested ?? "").replace(/[—–]/g, " ").replace(/\s+/g, " ").trim()
  return cleaned.length > 0 ? cleaned.slice(0, NAME_MAX).trim() : null
}

/**
 * Which single gap Orbit should ask about, for an unschedulable primary.
 * Priority: an ambiguous time is asked before an unconfident cadence (a
 * stated weekday implies weekly per the prompt, so that overlap is rare, and
 * the am/pm answer often settles cadence for free). A missing day absorbs an
 * ambiguous time into "both" so one question covers day and am/pm together.
 * We never invent a weekly schedule the founder didn't state: a complete
 * day+time with unknown cadence asks "is that every week?" instead of
 * guessing (guessing wrong would silently create weekly events for a
 * monthly group).
 */
function classifyGap(primary: Candidate): MissingField {
  const timeStated = primary.timeLocal !== null
  const timeKnown = timeStated && !primary.timeAmbiguous
  if (primary.cadence === null && primary.daysOfWeek !== null && timeKnown) {
    return "cadence"
  }
  if (primary.cadence === "weekly" || primary.cadence === null) {
    const noDay = primary.daysOfWeek === null
    if (noDay && !timeKnown) return "both"
    if (noDay) return "day"
    if (!timeStated) return "time"
    if (primary.timeAmbiguous) return "ambiguous_time"
  }
  // Confidently non-weekly (monthly-only) — nothing this slice can schedule.
  return "nothing_schedulable"
}

/**
 * Candidate → stored shape. Ambiguous time guesses are nulled on every path
 * (primary and secondary, ready and incomplete): the guess is a claim the
 * founder never confirmed, so it must not reach a field that confirm would
 * write to the database.
 */
function toStored(c: Candidate): StoredRhythm {
  return {
    activity: c.activity,
    title: deriveTitle(c),
    cadence: c.cadence,
    daysOfWeek: c.daysOfWeek,
    timeLocal: c.timeAmbiguous ? null : c.timeLocal,
    // The venue is confirmed founder input like the activity, not a guess
    // like an ambiguous time, so it survives every path unchanged.
    venueName: c.venueName,
  }
}

export function normalizeExtraction(raw: unknown): NormalizedOnboarding {
  const { rhythms, suggestedName } = sanitize(raw)
  if (rhythms.length === 0) {
    return {
      status: "incomplete",
      missing: "nothing_schedulable",
      rhythms: [],
      groupName: cleanSuggestedName(suggestedName),
      candidateTimeLocal: null,
    }
  }

  // Primary selection with promotion (belt to the prompt's braces): the
  // model's isPrimary designation is honored only if that rhythm is
  // schedulable; when it isn't and another rhythm is, the complete one is
  // promoted so the founder is never re-asked about a description that
  // already contained a full schedule.
  let primaryIdx = rhythms.findIndex((c) => c.isPrimary)
  if (primaryIdx === -1) primaryIdx = 0
  if (!isSchedulable(rhythms[primaryIdx])) {
    const completeIdx = rhythms.findIndex(isSchedulable)
    if (completeIdx !== -1) primaryIdx = completeIdx
  }
  const primary = rhythms[primaryIdx]

  // Position-zero guarantee, on both paths: the primary is stored first, so
  // the engine's parseRhythm (which reads [0]) always finds the schedulable
  // one on ready, and the gap card/merge call always find the gapped one on
  // incomplete.
  const ordered = [primary, ...rhythms.filter((_, i) => i !== primaryIdx)]
  const stored = ordered.map(toStored)

  if (!isSchedulable(primary)) {
    return {
      status: "incomplete",
      missing: classifyGap(primary),
      rhythms: stored,
      groupName: cleanSuggestedName(suggestedName),
      candidateTimeLocal: primary.timeAmbiguous ? primary.timeLocal : null,
    }
  }

  return {
    status: "ready",
    groupName: cleanSuggestedName(suggestedName) ?? titleCaseActivity(primary.activity),
    rhythms: stored,
  }
}
