// src/lib/orbit/announce.ts
//
// Generates deterministic, structured-extract-then-format feed copy from
// an event and rhythm (per CLAUDE.md §7 and build-notes §7).
//
// The announcement is generated from the just-created event and rhythm,
// so it can never contradict the card. Copy is soft, warm, plain voice.

import type { GroupRhythm } from "./rhythm"
import { formatTime } from "@/lib/events/format"

/**
 * Builds an announcement string for a newly created event, with the weekday and
 * time rendered in the group's `timeZone` (an IANA zone).
 *
 * Template: "Next up: {activity} {weekday} at {time}. RSVP up top."
 *
 * - activity: from rhythm.activity (used as-is; rhythm parser stores it in the desired case)
 * - weekday: 3-letter abbreviation of event.startsAt in the group's timezone
 * - time: formatTime(event.startsAt, timeZone), e.g. "8am", "2:30pm"
 *
 * The announcement is a single stored string in a shared feed (it cannot be
 * per-viewer), so it renders in group time to match the pinned card exactly.
 * Rendering it in UTC while the card converted (or vice versa) is the
 * card/announcement divergence the timezone-capture slice exists to prevent
 * (build-notes §11). The zone is required for the same reason formatEventDate's
 * is: no silent UTC fallback.
 *
 * Example output: "Next up: climbing Sun at 8am. RSVP up top."
 */
export function buildAnnouncement(
  event: { startsAt: Date },
  rhythm: { activity: string },
  timeZone: string
): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(event.startsAt)

  const time = formatTime(event.startsAt, timeZone)
  const activity = rhythm.activity

  return `Next up: ${activity} ${weekday} at ${time}. RSVP up top.`
}
