// src/lib/orbit/rhythm.ts
//
// GroupRhythm is the typed view of one element from Group.recurringActivities
// (a Prisma Json? column).  parseRhythm validates the raw value and returns a
// typed object or null — no external validation library, just runtime checks.

export interface GroupRhythm {
  activity: string           // event activity noun, e.g. "climbing" — used in announcement copy
  title: string              // -> Event.title, e.g. "Climbing Sunday"
  daysOfWeek: number[]       // 0=Sun … 6=Sat (JS getUTCDay convention)
  timeLocal: string          // "HH:mm" 24h wall-clock local time, e.g. "08:00"
  cadence: "weekly"          // only value in MVP
  durationMinutes?: number | null
}

const TIME_LOCAL_RE = /^\d{2}:\d{2}$/

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
  }
}
