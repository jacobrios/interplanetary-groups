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
import { needsSpot, scheduleGapOf, type MissingField, type ScheduleGap } from "./normalize"
import type { GapAskable } from "./gap"

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
 * Every value row starts with a capital letter so the rows read consistently
 * ("Once a month, ..." alongside "Tue at 6:30pm, ...").
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
    value = parts ? `${parts}, once a month` : "once a month, no set day yet"
  } else {
    value = "no set schedule yet"
  }

  return { label, value: value.charAt(0).toUpperCase() + value.slice(1) }
}

/**
 * "19:00" -> "7", "19:30" -> "7:30", "12:00" -> "12". The candidate reading
 * of an ambiguous time, shown without am/pm — deliberately honest about the
 * one thing Orbit doesn't know yet.
 */
function bareTime(timeLocal: string): string {
  const [h, m] = timeLocal.split(":").map(Number) as [number, number]
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`
}

/** The gap-row marker for each schedule gap, when the spot is not also
 * missing. */
const MARKER: Record<ScheduleGap, string> = {
  time: "what time?",
  day: "what days?",
  both: "what day and time?",
  cadence: "every week?",
  ambiguous_time: "morning or evening?",
}

/** The gap-row marker for each schedule gap, when the main activity's spot
 * is missing alongside it. */
const MARKER_WITH_SPOT: Record<ScheduleGap, string> = {
  time: "what time and where?",
  day: "what days and where?",
  both: "when and where?",
  cadence: "every week, and where?",
  ambiguous_time: "morning or evening, and where?",
}

/**
 * The gap card's gapped row: the known part of the value (null when nothing
 * usable is known) plus the short lime-underlined marker naming the gap.
 * Composed entirely by code from normalized fields, like every other row.
 * The classification in normalize.ts guarantees the fields each gap needs
 * (a time gap has days, an ambiguous gap has days and a candidate); the
 * defensive branches below degrade gracefully rather than trusting that.
 *
 * `spot` alone (the main activity's whole schedule is known, only the place
 * is missing) keeps the entire schedule as the known part; every other kind
 * splits into its schedule half (via scheduleGapOf) for the known
 * calculation and picks its marker from MARKER or MARKER_WITH_SPOT depending
 * on whether it also needs the spot.
 */
export function formatGapRhythmRow(
  r: StoredRhythm,
  missing: GapAskable,
  candidateTimeLocal: string | null
): { label: string; known: string | null; marker: string } {
  const label = r.activity.split(/\s+/).slice(0, 2).join(" ").toUpperCase()
  const days = r.daysOfWeek !== null ? formatDays(r.daysOfWeek) : null
  const time = r.timeLocal !== null ? `at ${formatTimeLocal(r.timeLocal)}` : null

  // An ambiguous gap with no candidate degrades to the plain time gap
  // (spot-combined or not): nothing usable is known about the time either way.
  const gap: GapAskable =
    (missing === "ambiguous_time" || missing === "ambiguous_time_spot") &&
    candidateTimeLocal === null
      ? missing === "ambiguous_time_spot"
        ? "time_spot"
        : "time"
      : missing

  if (gap === "spot") {
    const known =
      r.daysOfWeek !== null && r.daysOfWeek.length === 7 && time !== null
        ? `every day ${time}`
        : [days, time].filter(Boolean).join(" ") || null
    return {
      label,
      known: known !== null ? known.charAt(0).toUpperCase() + known.slice(1) : null,
      marker: "where?",
    }
  }

  const schedule = scheduleGapOf(gap) as ScheduleGap
  let known: string | null
  switch (schedule) {
    case "time":
      known = days
      break
    case "day":
      known = time
      break
    case "both":
      known = null
      break
    case "cadence":
      known = [days, time].filter(Boolean).join(" ") || null
      break
    case "ambiguous_time":
      known = [days, `at ${bareTime(candidateTimeLocal!)}`].filter(Boolean).join(" ")
      break
  }
  if (known !== null) known = known.charAt(0).toUpperCase() + known.slice(1)
  const marker = needsSpot(gap) ? MARKER_WITH_SPOT[schedule] : MARKER[schedule]
  return { label, known, marker }
}

/** "a" / "a and b" / "a, b, and c" / "the other things you mentioned" (4+). */
function formatActivityList(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`
  return "the other things you mentioned"
}

/**
 * The onboarding note explaining that only the main activity gets stored and
 * scheduled; everything else the founder mentioned is never stored as a
 * rhythm, and this is Orbit telling them how to use it anyway: float it in
 * chat when it comes up. Null when there is nothing else to explain.
 */
export function formatOtherActivitiesNote(main: string, others: string[]): string | null {
  if (others.length === 0) return null

  const list = formatActivityList(others)
  return `I'll put ${main} on the calendar every week. For ${list}, just say it in the group chat when someone's up for it, like “${others[0]} Friday?” I'll take it from there.`
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
  ambiguous_time:
    "Got it. Is that morning or evening? Add am or pm to your description and I'll set up the schedule.",
  nothing_schedulable:
    "Tell me a bit more about what your group does together and when. I need an activity, a day, and a time to get your schedule going.",
  spot: "Got it. Where do you usually meet? Add that to your description and I'll set up the schedule.",
  time_spot:
    "Got it. What time do you meet, and where? Add that to your description and I'll set up the schedule.",
  day_spot:
    "Got it. What days do you meet, and where? Add that and I'll set up the schedule.",
  both_spot:
    "I need a day, a time, and a place to set up your schedule. Add those to your description and try again.",
  cadence_spot:
    "Got it. Is that every week, and where do you meet? Say so in your description and I'll set up the schedule.",
  ambiguous_time_spot:
    "Got it. Is that morning or evening, and where do you meet? Add those to your description and I'll set up the schedule.",
}

/**
 * Step 1's escape-hatch copy after the founder's three answers run out,
 * one per MissingField so the founder is told what is actually missing (the
 * old single "day and time" string for every kind was the bug front section
 * decision 4 fixes: it named the wrong gap whenever only the spot, or only
 * the day, or only the time was outstanding).
 */
export const EXHAUSTED_COPY: Record<MissingField, string> = {
  time: "I still need to know what time you meet. Add it to your description, like “at 7pm”, and I'll take another look.",
  day: "I still need to know what days you meet. Add them to your description, like “on Tuesdays”, and I'll take another look.",
  both: "I still need to know what day and time you meet. Add them to your description, like “Tuesdays at 7pm”, and I'll take another look.",
  cadence:
    "I still need to know if that's every week. Add it to your description, like “every Tuesday”, and I'll take another look.",
  ambiguous_time:
    "I still need to know if that's morning or evening. Add am or pm to your description, like “7pm”, and I'll take another look.",
  spot: "I still need to know where you meet. Add it to your description, like “at Movement Gowanus”, and I'll take another look.",
  time_spot:
    "I still need to know what time you meet, and where. Add them to your description, like “7pm at Movement Gowanus”, and I'll take another look.",
  day_spot:
    "I still need to know what days you meet, and where. Add them to your description, like “Tuesdays at Movement Gowanus”, and I'll take another look.",
  both_spot:
    "I still need to know when and where you meet. Add them to your description, like “Tuesdays at 7pm, at Movement Gowanus”, and I'll take another look.",
  cadence_spot:
    "I still need to know if that's every week, and where you meet. Add them to your description, like “every Tuesday at Movement Gowanus”, and I'll take another look.",
  ambiguous_time_spot:
    "I still need to know if that's morning or evening, and where you meet. Add them to your description, like “7pm at Movement Gowanus”, and I'll take another look.",
  nothing_schedulable: REASK_COPY.nothing_schedulable,
}
