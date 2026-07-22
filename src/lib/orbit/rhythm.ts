// src/lib/orbit/rhythm.ts
//
// Two typed views of Group.recurringActivities (a Prisma Json? column):
//
// - StoredRhythm / parseStoredRhythms: the widened storage shape written by
//   onboarding. Cadence is a real field (weekly | monthly | null = loose),
//   and day/time are nullable so loose rhythms ("beers once a month") can be
//   stored and displayed without inventing a schedule.
// - GroupRhythm / parseRhythm: the scheduling engine's contract. It answers
//   "is there a schedulable rhythm at position 0" — the stored primary must
//   be complete (activity, title, ≥1 day, range-valid time) on a weekly
//   cadence, or the engine skips the group.
//
// No external validation library, just runtime checks.

export interface GroupRhythm {
  activity: string           // event activity noun, e.g. "climbing" — used in announcement copy
  title: string              // -> Event.title, e.g. "Climbing Sunday"
  daysOfWeek: number[]       // 0=Sun … 6=Sat (JS getUTCDay convention)
  timeLocal: string          // "HH:mm" 24h wall-clock local time, e.g. "08:00"
  cadence: "weekly"          // only schedulable cadence in MVP
  durationMinutes?: number | null
  venueName?: string | null  // standing place; snapshotted into a per-event Venue row
}

export interface StoredRhythm {
  activity: string                     // non-empty, founder's words
  title: string                        // derived deterministically, non-empty
  cadence: "weekly" | "monthly" | null // null = loose (yearly/unknown cadence)
  daysOfWeek: number[] | null          // 0=Sun … 6=Sat; null = not stated
  timeLocal: string | null             // "HH:mm" 24h, range-valid; null = not stated
  durationMinutes?: number | null      // legacy field; never written by onboarding
  venueName?: string | null            // standing place, founder's words; optional like
                                       // durationMinutes so pre-slice rows parse as null
}

// 24-hour wall-clock with range enforcement ("99:99" is not a time).
const TIME_LOCAL_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const VENUE_NAME_MAX = 80

/**
 * Trim, cap at VENUE_NAME_MAX, empty → null. The one definition of venue
 * string hygiene, shared by both parsers here and sanitize() in normalize.ts.
 * Never rejects: venue is a refinable detail, and an unusable value must
 * degrade to "no venue", not block anything (venue never gates).
 */
export function cleanVenueName(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().slice(0, VENUE_NAME_MAX).trim()
  return t.length > 0 ? t : null
}

/**
 * Parse and validate the raw value of `Group.recurringActivities`.
 *
 * The column is `Json?` in Prisma so it can be anything.  This slice only
 * uses the first element of the array; any invalid shape returns null so
 * callers can skip scheduling without throwing.
 */
export function parseRhythm(json: unknown): GroupRhythm | null {
  if (!Array.isArray(json) || json.length === 0) return null

  const raw = json[0]

  if (raw === null || typeof raw !== "object") return null

  const r = raw as Record<string, unknown>

  // activity — non-empty string
  if (typeof r.activity !== "string" || r.activity.length === 0) return null

  // title — non-empty string
  if (typeof r.title !== "string" || r.title.length === 0) return null

  // daysOfWeek — non-empty array of integers 0–6
  if (!Array.isArray(r.daysOfWeek) || r.daysOfWeek.length === 0) return null
  for (const d of r.daysOfWeek) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) return null
  }

  // timeLocal — "HH:mm"
  if (typeof r.timeLocal !== "string" || !TIME_LOCAL_RE.test(r.timeLocal)) return null

  // cadence — must be exactly "weekly"
  if (r.cadence !== "weekly") return null

  // durationMinutes — optional; if present must be number or null
  const dm = r.durationMinutes
  if (dm !== undefined && dm !== null && typeof dm !== "number") return null

  return {
    activity: r.activity,
    title: r.title,
    daysOfWeek: r.daysOfWeek as number[],
    timeLocal: r.timeLocal,
    cadence: "weekly",
    durationMinutes: dm === undefined ? undefined : (dm as number | null),
    // Lenient on purpose: an unusable venueName degrades to null instead of
    // rejecting, because a null here means the group never schedules again,
    // and no venue value may ever have that power (venue never gates).
    venueName: cleanVenueName(r.venueName),
  }
}

/**
 * Validate the full recurringActivities array as the widened storage shape.
 *
 * Strict: any invalid entry rejects the whole array. This validates our own
 * writes (normalize.ts output) and the confirm-action payload from the client,
 * so partial acceptance would hide bugs rather than tolerate them.
 *
 * Absent optional fields are treated as null — rhythms written before this
 * slice (seed fixtures) carry no explicit nulls.
 */
export function parseStoredRhythms(json: unknown): StoredRhythm[] | null {
  if (!Array.isArray(json) || json.length === 0) return null

  const out: StoredRhythm[] = []
  for (const raw of json) {
    if (raw === null || typeof raw !== "object") return null
    const r = raw as Record<string, unknown>

    if (typeof r.activity !== "string" || r.activity.length === 0) return null
    if (typeof r.title !== "string" || r.title.length === 0) return null

    let cadence: StoredRhythm["cadence"]
    if (r.cadence === "weekly" || r.cadence === "monthly") cadence = r.cadence
    else if (r.cadence === null || r.cadence === undefined) cadence = null
    else return null

    let daysOfWeek: number[] | null = null
    if (r.daysOfWeek !== null && r.daysOfWeek !== undefined) {
      if (!Array.isArray(r.daysOfWeek) || r.daysOfWeek.length === 0) return null
      for (const d of r.daysOfWeek) {
        if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) return null
      }
      daysOfWeek = r.daysOfWeek as number[]
    }

    let timeLocal: string | null = null
    if (r.timeLocal !== null && r.timeLocal !== undefined) {
      if (typeof r.timeLocal !== "string" || !TIME_LOCAL_RE.test(r.timeLocal)) return null
      timeLocal = r.timeLocal
    }

    const dm = r.durationMinutes
    if (dm !== undefined && dm !== null && typeof dm !== "number") return null

    // Strict on type (a non-string value is a writer bug, same philosophy as
    // durationMinutes above), but a string is cleaned rather than judged:
    // empty degrades to null, because the Step 2 input legitimately produces
    // empty strings and rejecting them would gate creation on a venue.
    if (r.venueName !== undefined && r.venueName !== null && typeof r.venueName !== "string") {
      return null
    }

    out.push({
      activity: r.activity,
      title: r.title,
      cadence,
      daysOfWeek,
      timeLocal,
      durationMinutes: dm === undefined ? undefined : (dm as number | null),
      venueName: cleanVenueName(r.venueName),
    })
  }
  return out
}
