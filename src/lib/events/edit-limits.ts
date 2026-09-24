// src/lib/events/edit-limits.ts
//
// The limits on moving a plan to a new start via the edit form.
//
// The hourly job skips a group while a rhythm plan is upcoming
// (`hasUpcomingScheduledEvent`), so a rhythm plan moved on or past its
// rhythm's next regular slot makes that week's plan silently never exist:
// the guard sees nothing due yet, and the group's next occurrence is simply
// never created. Floated plans (`gaugeId` set) are invisible to that guard
// and have no limit.
//
// The limit is measured from the plan's ORIGINAL slot (the ISO after the
// first ":" in `scheduledKey`), not its current time, so a plan already
// moved once cannot creep a week at a time by being moved again from
// wherever it currently sits.

import { parseRhythm } from "../orbit/rhythm"
import { computeNextOccurrence } from "../orbit/occurrence"

export type EditedStartCheck =
  | { ok: true }
  | { ok: false; reason: "past" }
  | { ok: false; reason: "past_next_occurrence"; nextOccurrence: Date }

export function checkEditedStart(input: {
  event: { startsAt: Date; gaugeId: string | null; scheduledKey: string | null }
  recurringActivities: unknown
  timeZone: string
  proposedStartsAt: Date
  now: Date
}): EditedStartCheck {
  const { event, recurringActivities, timeZone, proposedStartsAt, now } = input

  if (proposedStartsAt.getTime() < now.getTime()) {
    return { ok: false, reason: "past" }
  }

  // Floated plans (sparked from a gauge) are invisible to the rhythm-skip
  // guard, so they carry no limit.
  if (event.gaugeId !== null) {
    return { ok: true }
  }

  const rhythm = parseRhythm(recurringActivities)
  if (rhythm === null) {
    return { ok: true }
  }

  const originalSlot = parseOriginalSlot(event.scheduledKey) ?? event.startsAt

  let next: Date
  try {
    next = computeNextOccurrence(rhythm, timeZone, originalSlot)
  } catch {
    // An invalid rhythm can't produce a next occurrence to violate.
    return { ok: true }
  }

  if (proposedStartsAt.getTime() >= next.getTime()) {
    return { ok: false, reason: "past_next_occurrence", nextOccurrence: next }
  }

  return { ok: true }
}

/**
 * The ISO instant after the first ":" in a `scheduledKey`
 * (`${groupId}:${isoString}`). Returns null when the key is absent or its
 * tail doesn't parse as a date, so callers can fall back to `startsAt`.
 */
function parseOriginalSlot(scheduledKey: string | null): Date | null {
  if (scheduledKey === null) return null
  const idx = scheduledKey.indexOf(":")
  if (idx === -1) return null
  const tail = scheduledKey.slice(idx + 1)
  const d = new Date(tail)
  return Number.isNaN(d.getTime()) ? null : d
}
