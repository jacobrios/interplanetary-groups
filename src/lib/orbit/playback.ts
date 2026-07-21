// src/lib/orbit/playback.ts
//
// Deterministic composition of the onboarding playback rows and the static
// re-ask templates (§7 structured-extract-then-format): the playback card is
// a promise about what Orbit will do, so it is composed from the same
// normalized fields the engine consumes and can never contradict the created
// event. The model writes none of these strings.
//
// Copy rules honored here: three-letter weekday abbreviations, no em/en
// dashes, plain warm Orbit voice.

import type { StoredRhythm } from "./rhythm"
import type { MissingField } from "./normalize"

const WEEKDAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * "08:00" -> "8am", "14:30" -> "2:30pm". Mirrors the hour/minute logic of
 * formatTime in src/lib/events/format.ts but takes a wall-clock "HH:mm"
 * string instead of a UTC Date (rhythms are wall-clock by definition).
 */
export function formatTimeLocal(timeLocal: string): string {
  const [h, m] = timeLocal.split(":").map(Number) as [number, number]
  const ampm = h < 12 ? "am" : "pm"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

function formatDays(days: number[]): string {
  return days.map((d) => WEEKDAY_ABBREV[d]).join(" & ")
}

/**
 * One playback row per rhythm. The label is the founder's own activity word,
 * uppercased and capped at two words (§7 dynamic row labels). The value reads
 * as understood-but-not-scheduled for loose rhythms without apologizing.
 */
export function formatRhythmRow(r: StoredRhythm): { label: string; value: string } {
  const label = r.activity.split(/\s+/).slice(0, 2).join(" ").toUpperCase()

  let value: string
  if (r.cadence === "weekly" && r.daysOfWeek !== null && r.timeLocal !== null) {
    value =
      r.daysOfWeek.length === 7
        ? `every day at ${formatTimeLocal(r.timeLocal)}`
        : `${formatDays(r.daysOfWeek)} at ${formatTimeLocal(r.timeLocal)}, every week`
  } else if (r.cadence === "monthly") {
    const dayPart = r.daysOfWeek !== null ? formatDays(r.daysOfWeek) : null
    const timePart = r.timeLocal !== null ? `at ${formatTimeLocal(r.timeLocal)}` : null
    const parts = [dayPart, timePart].filter(Boolean).join(" ")
    value = parts ? `${parts}, once a month` : "once a month, we'll pick a day later"
  } else {
    value = "we'll sort out timing later"
  }

  return { label, value }
}

/**
 * Static re-ask templates, selected by which fields the completeness gate
 * found missing. Never model-written. The first three open with "Got it"
 * because Orbit did understand something and should say so rather than
 * implying the founder failed.
 */
export const REASK_COPY: Record<MissingField, string> = {
  time: "Got it. What time do you usually meet? Add that to your description and I'll set up the schedule.",
  day: "Got it. What days do you usually meet? Add that and I'll set up the schedule.",
  both: "I need a day and a time to set up your schedule. Add those to your description and try again.",
  cadence:
    "Got it. Is that every week? Say so in your description and I'll set up the schedule.",
  nothing_schedulable:
    "Tell me a bit more about what your group does together and when. I need an activity, a day, and a time to get your schedule going.",
}
