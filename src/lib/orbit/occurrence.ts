// src/lib/orbit/occurrence.ts
//
// Timezone-aware occurrence computation for GroupRhythm.
// Zero external dependencies — native Intl and Date only.

import type { GroupRhythm } from "./rhythm"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the wall-clock local date/time parts for a given UTC instant in the
 * specified IANA timezone.
 *
 * Exported so src/lib/events/format.ts can read wall-clock parts through the
 * same implementation rather than duplicating the Intl call.
 */
export function getLocalParts(
  utcDate: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  })

  const parts = fmt.formatToParts(utcDate)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0")

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Convert a wall-clock local time in the given IANA timezone to a UTC Date.
 * Uses two refinement passes to handle DST boundaries correctly.
 *
 * The offset is the full, date-inclusive difference between the wall-clock time
 * Intl reports for a candidate instant and the wall-clock time we asked for.
 * Computing it from the whole (y,m,d,h,m) tuple — not just the hour/minute
 * delta — is what keeps early-morning wall times whose UTC instant falls on a
 * later calendar day (e.g. 7am America/Los_Angeles = 15:00 UTC) on the correct
 * local day. (An earlier hour-delta-only version silently shifted any wall time
 * below the zone's offset magnitude to the previous local day; see build-notes
 * §11, timezone-capture slice.)
 *
 * exported for testing only
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  // The wall-clock instant we want, expressed as a UTC epoch for arithmetic.
  const targetMs = Date.UTC(year, month - 1, day, hour, minute)

  // Pass 1: treat the inputs as UTC to get an initial candidate, then derive
  // the local-to-UTC offset (full date-inclusive delta) and apply it.
  const candidate = new Date(targetMs)
  const offsetMinutes1 = wallClockOffsetMinutes(candidate, targetMs, timeZone)
  const refined = new Date(candidate.getTime() - offsetMinutes1 * 60_000)

  // Pass 2: re-derive the offset from the refined instant to handle the case
  // where the refinement landed on the other side of a DST transition.
  const offsetMinutes2 = wallClockOffsetMinutes(refined, targetMs, timeZone)
  if (offsetMinutes2 === 0) {
    return refined
  }

  return new Date(refined.getTime() - offsetMinutes2 * 60_000)
}

/**
 * How many minutes the local wall-clock reading of `instant` (in `timeZone`)
 * runs ahead of the target wall-clock (`targetMs`, a Date.UTC epoch of the
 * desired y/m/d/h/m). Date-inclusive, so a reading that landed on a different
 * calendar day contributes its full day delta, not a wrapped hour delta.
 */
function wallClockOffsetMinutes(
  instant: Date,
  targetMs: number,
  timeZone: string
): number {
  const local = getLocalParts(instant, timeZone)
  const localMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute
  )
  return (localMs - targetMs) / 60_000
}

/**
 * Return the earliest UTC occurrence of the given GroupRhythm strictly after
 * `after`, resolving wall-clock time in `timeZone`.
 *
 * Scans up to 14 local calendar days (sufficient for any weekly rhythm).
 * Throws if no occurrence is found — this is a guard against invalid rhythms.
 */
export function computeNextOccurrence(
  rhythm: GroupRhythm,
  timeZone: string,
  after: Date
): Date {
  // Determine the local calendar date that corresponds to `after`.
  const localAfter = getLocalParts(after, timeZone)

  const [targetHour, targetMinute] = rhythm.timeLocal
    .split(":")
    .map(Number) as [number, number]

  for (let offsetDays = 0; offsetDays < 14; offsetDays++) {
    // Build the local calendar date for this candidate day.
    // We use a UTC-noon anchor so that small timezone shifts don't bleed into
    // the wrong calendar date.
    const candidateUtcNoon = new Date(
      Date.UTC(
        localAfter.year,
        localAfter.month - 1,
        localAfter.day + offsetDays,
        12,
        0
      )
    )

    // Re-derive the actual local date parts (handles month/year rollovers).
    const localCandidate = getLocalParts(candidateUtcNoon, timeZone)

    // Build a temporary Date to check the weekday in local time.
    // getDay() on a UTC-midnight date can return the wrong weekday across
    // timezone boundaries, so we check the local-derived day-of-week instead.
    const localDateForWeekday = new Date(
      Date.UTC(localCandidate.year, localCandidate.month - 1, localCandidate.day)
    )
    const weekday = localDateForWeekday.getUTCDay() // 0=Sun … 6=Sat

    if (!rhythm.daysOfWeek.includes(weekday)) continue

    // Convert the wall-clock occurrence time to UTC.
    const occurrence = zonedWallTimeToUtc(
      localCandidate.year,
      localCandidate.month,
      localCandidate.day,
      targetHour,
      targetMinute,
      timeZone
    )

    // Must be strictly after `after`.
    if (occurrence.getTime() > after.getTime()) {
      return occurrence
    }
  }

  throw new Error("no occurrence found in 14 days")
}
