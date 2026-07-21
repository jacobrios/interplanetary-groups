// src/lib/orbit/normalize.ts
//
// Turns raw extraction output (a claim) into the normalized onboarding profile
// (a fact) — CLAUDE.md guardrail: nothing branches on model output until it
// has been validated and normalized here. Structured outputs enforces the wire
// shape; this layer owns semantics: range checks, cadence whitelist, primary
// promotion, the position-zero guarantee, and the completeness gate.
// Pure and synchronous by design so every rule is unit-testable.

import type { StoredRhythm } from "./rhythm"

export type MissingField = "time" | "day" | "both" | "cadence" | "nothing_schedulable"

export type NormalizedOnboarding =
  | { status: "ready"; groupName: string; rhythms: StoredRhythm[] }
  | { status: "incomplete"; missing: MissingField }

const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const NAME_MAX = 50

interface Candidate {
  activity: string
  cadence: "weekly" | "monthly" | null
  daysOfWeek: number[] | null
  timeLocal: string | null
  isPrimary: boolean
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

    rhythms.push({ activity, cadence, daysOfWeek, timeLocal, isPrimary: o.isPrimary === true })
  }
  return { rhythms, suggestedName }
}

/** Complete enough to put an event on the card: weekly cadence, ≥1 day, a time. */
function isSchedulable(c: Candidate): boolean {
  return c.cadence === "weekly" && c.daysOfWeek !== null && c.timeLocal !== null
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Event title, derived deterministically — never extracted. */
function deriveTitle(c: Candidate): string {
  return isSchedulable(c)
    ? `${titleCase(c.activity)} ${WEEKDAY_FULL[c.daysOfWeek![0]]}`
    : titleCase(c.activity)
}

/**
 * The one model-suggested string that reaches the founder: normalized (trim,
 * strip em/en dashes per the copy rules, collapse whitespace, cap length)
 * with a deterministic fallback composed from the schedulable primary.
 * The playback row is editable, so this is a starting point, not a decision.
 */
function normalizeName(suggested: string | null, primary: Candidate): string {
  const cleaned = (suggested ?? "").replace(/[—–]/g, " ").replace(/\s+/g, " ").trim()
  if (cleaned.length > 0) return cleaned.slice(0, NAME_MAX).trim()
  return `${WEEKDAY_FULL[primary.daysOfWeek![0]]} ${titleCase(primary.activity)}`
}

export function normalizeExtraction(raw: unknown): NormalizedOnboarding {
  const { rhythms, suggestedName } = sanitize(raw)
  if (rhythms.length === 0) return { status: "incomplete", missing: "nothing_schedulable" }

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

  if (!isSchedulable(primary)) {
    // Targeted re-asks where we can name the gap; the generic re-ask
    // otherwise. We never invent a weekly schedule the founder didn't state:
    // a complete day+time with unknown cadence asks "is that every week?"
    // instead of guessing (guessing wrong would silently create weekly
    // events for a monthly group).
    if (primary.cadence === null && primary.daysOfWeek !== null && primary.timeLocal !== null) {
      return { status: "incomplete", missing: "cadence" }
    }
    if (primary.cadence === "weekly" || primary.cadence === null) {
      const noDay = primary.daysOfWeek === null
      const noTime = primary.timeLocal === null
      if (noDay && noTime) return { status: "incomplete", missing: "both" }
      if (noTime) return { status: "incomplete", missing: "time" }
      if (noDay) return { status: "incomplete", missing: "day" }
    }
    // Confidently non-weekly (monthly-only) — nothing this slice can schedule.
    return { status: "incomplete", missing: "nothing_schedulable" }
  }

  // Position-zero guarantee: the schedulable primary is stored first, so the
  // engine's parseRhythm (which reads [0]) always finds it.
  const ordered = [primary, ...rhythms.filter((_, i) => i !== primaryIdx)]
  const stored: StoredRhythm[] = ordered.map((c) => ({
    activity: c.activity,
    title: deriveTitle(c),
    cadence: c.cadence,
    daysOfWeek: c.daysOfWeek,
    timeLocal: c.timeLocal,
  }))

  return {
    status: "ready",
    groupName: normalizeName(suggestedName, primary),
    rhythms: stored,
  }
}
