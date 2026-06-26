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
 */
function getLocalParts(
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
 * DEBT: The first-pass candidate treats (year, month, day, hour, minute) as-if-UTC,
 * which only works when that UTC instant maps to a local time on the same calendar
 * day. For timeLocal values in the pre-dawn hours (roughly < 05:00) in large
 * negative-offset zones (e.g. America/Los_Angeles, UTC-8), the candidate can land on
 * the prior local day and the hour-delta offset math diverges. MVP rhythms are
 * daytime-only, so this never fires — but callers must not supply timeLocal < "05:00"
 * with a large western offset until this is replaced with a proper iteration-based
 * approach (e.g. binary-search on the offset, or a date library).
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
  // Pass 1: treat the inputs as UTC to get an initial candidate, then derive
  // the local-to-UTC offset and apply it.
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const local1 = getLocalParts(candidate, timeZone)

  // Offset in minutes: how many minutes to subtract from UTC to get local time
  const offsetMinutes1 =
    (local1.hour - hour) * 60 + (local1.minute - minute)

  const refined = new Date(candidate.getTime() - offsetMinutes1 * 60_000)

  // Pass 2: re-derive the offset from the refined instant to handle the case
  // where the refinement landed on the other side of a DST transition.
  const local2 = getLocalParts(refined, timeZone)
  const offsetMinutes2 =
    (local2.hour - hour) * 60 + (local2.minute - minute)

  if (offsetMinutes2 === 0) {
    return refined
  }

  return new Date(refined.getTime() - offsetMinutes2 * 60_000)
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
