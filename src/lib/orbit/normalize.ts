// src/lib/orbit/normalize.ts
//
// Turns raw extraction output (a claim) into the normalized onboarding profile
// (a fact) — CLAUDE.md guardrail: nothing branches on model output until it
// has been validated and normalized here. Structured outputs enforces the wire
// shape; this layer owns semantics: range checks, cadence whitelist, primary
// promotion, the position-zero guarantee, and the completeness gate (which
// now includes the main activity's spot, checked after primary selection).
// Pure and synchronous by design so every rule is unit-testable.

import { cleanVenueName, titleCaseActivity, type StoredRhythm } from "./rhythm"

/** The schedule-only gap kinds: everything classifyGap can return. */
export type ScheduleGap = "time" | "day" | "both" | "cadence" | "ambiguous_time"

/** A schedule gap kind, or the main activity's spot alone. */
export type SpotGap = "spot" | `${ScheduleGap}_spot`

export type MissingField = ScheduleGap | SpotGap | "nothing_schedulable"

/** True for every kind that still needs the main activity's spot. */
export function needsSpot(m: MissingField): boolean {
  return m === "spot" || m.endsWith("_spot")
}

/** "time" -> "time_spot". */
export function withSpot(g: ScheduleGap): `${ScheduleGap}_spot` {
  return `${g}_spot`
}

/** The schedule half of a kind: "time_spot" -> "time", "spot" and
 * "nothing_schedulable" -> null (neither has a schedule half). */
export function scheduleGapOf(m: MissingField): ScheduleGap | null {
  if (m === "spot" || m === "nothing_schedulable") return null
  return m.endsWith("_spot") ? (m.slice(0, -"_spot".length) as ScheduleGap) : (m as ScheduleGap)
}

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

/**
 * Phrases that mean "I haven't decided" rather than naming an actual place.
 * Exact membership only, checked after normalizing punctuation and case away
 * (so "Not sure yet." and "not sure" match the same entry), which is why
 * "Somewhere Coffee" and "Anywhere Fitness" are untouched: they are not
 * exact matches even though they contain a listed word.
 */
const NON_ANSWER_VENUES = new Set([
  "idk",
  "i dont know",
  "dont know",
  "dunno",
  "not sure",
  "no idea",
  "tbd",
  "tba",
  "to be decided",
  "undecided",
  "somewhere",
  "anywhere",
  "wherever",
  "varies",
  "it varies",
  "well figure it out",
  "we will figure it out",
  "figure it out",
])

/**
 * True when a venue string is a non-answer ("idk", "not sure yet") rather
 * than an actual place. Lower-cases, folds curly and straight apostrophes
 * away, turns every other non-letter into a space, collapses whitespace,
 * and strips one trailing "yet" or "later" before checking exact membership
 * in NON_ANSWER_VENUES, so "we'll figure it out later" and "We’ll figure it
 * out" both normalize to the same entry.
 */
export function isNonAnswerVenue(v: string): boolean {
  const folded = v
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
  const trimmed = folded.replace(/ (yet|later)$/, "")
  return NON_ANSWER_VENUES.has(trimmed)
}

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

    // The venue is carried data, sanitized like everything else
    // (trim/cap/empty→null), and a non-answer ("idk", "not sure") is not a
    // venue: it degrades to null the same as an empty string, so it can
    // never satisfy the main activity's spot requirement below.
    const venue = cleanVenueName(o.venueName)
    rhythms.push({
      activity,
      cadence,
      daysOfWeek,
      timeLocal,
      timeAmbiguous,
      isPrimary: o.isPrimary === true,
      venueName: venue !== null && isNonAnswerVenue(venue) ? null : venue,
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
 * Weekday words the naming prompt is now allowed to use for a single-day
 * group ("Saturday Morning Runners") but never for a group that meets on
 * more than one day ("Monday Climbers" for a Mon/Wed/Fri rhythm) — the
 * prompt carries that rule in prose (extract.ts), this is the code-side
 * guard over the model's claim, same spirit as enforceActivityCarryOver and
 * enforceVenueCarryOver in gap.ts. Full names plus three-letter
 * abbreviations, matched as whole words and case-insensitively, plus "tues"
 * and "thurs" (the two four-letter abbreviations the bench's own predicate
 * in evals/onboarding/cases.ts documents as a known, accepted blind spot)
 * and an optional trailing "s" on every word so a plural ("Mondays
 * Climbers", the literal shape of the bench's day-prominent case) is caught
 * the same as the singular. Closing these costs nothing extra and a
 * discarded name always has a safe fallback, so there is no reason to
 * inherit either gap. Whole-word matching is what keeps a name like
 * "Satellite Crew" or a surname like "Mondale" clean.
 *
 * One deliberate residual false positive, decided rather than overlooked:
 * bare "sun" is left out of the abbreviation list, even though "mon",
 * "tue", "wed", "thu", and "fri" are in it. "Sun" is a common standalone
 * word in real place and group names ("Sun Valley Climbers", "Rising Sun
 * Runners"), while a model is far more likely to write "Sunday" out in
 * full than to abbreviate it to "sun" — the full word "sunday" is still
 * caught. Weighing a rare true positive against a plausible true name lost
 * to a safe-but-unwanted fallback, the false positive was judged the worse
 * cost, and the fallback being editable makes either choice recoverable.
 */
const WEEKDAY_NAME_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thurs",
  "fri",
  "sat",
]
const WEEKDAY_NAME_RE = new RegExp(`\\b(${WEEKDAY_NAME_WORDS.join("|")})s?\\b`, "i")

/**
 * Discards a cleaned suggestion that names a weekday when the primary
 * rhythm spans more than one day. The owner had twice declined a
 * code-side guard here because rejecting every weekday name would have
 * silently discarded a legitimate "Sunday Climbers" from a single-day
 * founder; the prompt narrowing that removed that cost is what makes this
 * guard safe to add (20 Aug 2026, narrow-weekday-rule slice). Fires only
 * when the day count is actually known and greater than one — an unknown
 * or single-day primary passes the name through untouched, same as the
 * rest of this file degrading an unusable claim rather than guessing.
 * Returns null on discard, exactly like "no usable suggestion": the caller
 * already knows how to fall back for its own path (the derived title on
 * ready, nothing invented on incomplete, per cleanSuggestedName's own doc
 * comment above).
 */
function rejectWeekdayNameOnMultiDay(
  name: string | null,
  daysOfWeek: number[] | null
): string | null {
  if (name === null) return null
  if (daysOfWeek === null || daysOfWeek.length <= 1) return name
  return WEEKDAY_NAME_RE.test(name) ? null : name
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
function classifyGap(primary: Candidate): ScheduleGap | "nothing_schedulable" {
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

  // The main activity's spot (onboarding step 2 cleanup, 26 Sept 2026): a
  // separate requirement on position 0 only, checked AFTER primary
  // selection so it can never change which rhythm is the main one, and kept
  // out of isSchedulable, which parseRhythm and reconcile rely on meaning
  // "the schedule is complete" and nothing more.
  const spotMissing = primary.venueName === null
  if (!isSchedulable(primary)) {
    const schedule = classifyGap(primary)
    return {
      status: "incomplete",
      missing: schedule === "nothing_schedulable" || !spotMissing ? schedule : withSpot(schedule),
      rhythms: stored,
      groupName: rejectWeekdayNameOnMultiDay(cleanSuggestedName(suggestedName), primary.daysOfWeek),
      candidateTimeLocal: primary.timeAmbiguous ? primary.timeLocal : null,
    }
  }
  if (spotMissing) {
    return {
      status: "incomplete",
      missing: "spot",
      rhythms: stored,
      groupName: rejectWeekdayNameOnMultiDay(cleanSuggestedName(suggestedName), primary.daysOfWeek),
      candidateTimeLocal: null,
    }
  }

  return {
    status: "ready",
    groupName:
      rejectWeekdayNameOnMultiDay(cleanSuggestedName(suggestedName), primary.daysOfWeek) ??
      titleCaseActivity(primary.activity),
    rhythms: stored,
  }
}
