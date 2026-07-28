// src/lib/orbit/change-copy.ts
//
// Every pure decision and every string the change-request flow produces: how a
// requested time is read against the plan it would change, and all of Orbit's
// copy for moves, questions, and honest declines.
//
// SDK-free, like spark-copy.ts and for the same reason: client components pull
// chip labels from here, and the Anthropic SDK must never reach the browser
// bundle.
//
// Structured-extract-then-format: the model supplies fields, code composes
// every string. Nothing in this file is generated prose.

import { formatMonthDay, formatTime, formatWeekdayShort } from "@/lib/events/format"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"
import { formatTimeLocalLabel, startOfLocalDay, THIS_WEEK_DAYS } from "./spark-copy"
import type { ChangeField } from "./spark"

export interface ResolvedChangeTime {
  timeLocal: string
  /** Orbit owning up to reading a bare hour off the plan's part of day, or null. */
  disclosure: string | null
}

/**
 * How a requested time is read against the plan it would change.
 *
 * An explicit or settled time wins outright. A bare clock number ("can we do 9
 * instead?") inherits the event's current part of day: 9 on an 8am plan is
 * 9am, on a 7pm plan it is 9pm, disclosed once. No coin flip here: the
 * existing time is the signal the spark path never had, and flipping against a
 * plan's obvious meaning would read as Orbit being dense.
 *
 * Twelve o'clock is exempt from inheritance (noon and midnight do not map onto
 * "the same half of the day as the plan" in any way a person would recognize)
 * and keeps the model's best reading, undisclosed.
 */
export function resolveChangeTime({
  requestedTime,
  requestedTimeAmbiguous,
  eventStartsAt,
  timeZone,
}: {
  requestedTime: string
  requestedTimeAmbiguous: boolean
  eventStartsAt: Date
  timeZone: string
}): ResolvedChangeTime {
  if (!requestedTimeAmbiguous) return { timeLocal: requestedTime, disclosure: null }

  const [h, m] = requestedTime.split(":").map(Number)
  const h12 = h % 12
  if (h12 === 0) return { timeLocal: requestedTime, disclosure: null }

  const morning = getLocalParts(eventStartsAt, timeZone).hour < 12
  const hour = morning ? h12 : h12 + 12
  const mm = String(m).padStart(2, "0")
  const timeLocal = `${String(hour).padStart(2, "0")}:${mm}`

  const spoken = m === 0 ? `${h12}` : `${h12}:${mm}`
  return {
    timeLocal,
    disclosure: `You said ${spoken}, and since this plan was in the ${morning ? "morning" : "evening"} I took that as ${formatTimeLocalLabel(timeLocal)}.`,
  }
}

/**
 * The instant the plan's current local day starts at wall time `timeLocal`.
 * The day never moves in this slice; only the clock does.
 */
export function changeStartInstant(
  eventStartsAt: Date,
  timeLocal: string,
  timeZone: string
): Date {
  const day = getLocalParts(eventStartsAt, timeZone)
  const [hour, minute] = timeLocal.split(":").map(Number)
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, minute, timeZone)
}

/** "this Sun" inside a week, "on Sun, Jun 21" beyond it, mirroring the gauge copy. */
function whenPhrase(startsAt: Date, timeZone: string, now: Date): string {
  const daysAway = Math.round(
    (startsAt.getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000
  )
  const weekday = formatWeekdayShort(startsAt, timeZone)
  return daysAway >= THIS_WEEK_DAYS
    ? `on ${weekday}, ${formatMonthDay(startsAt, timeZone)}`
    : `this ${weekday}`
}

/**
 * What Orbit says the moment a plan's time moves. Names both times so the feed
 * carries its own history (the original announcement is never edited), owns the
 * RSVP reset out loud, and ends with the recorded revert phrasing: the revert
 * is textual, handled by the same detection as any other change request.
 */
export function buildChangeAnnouncement(
  label: string,
  newStartsAt: Date,
  previousStartsAt: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null
): string {
  const lead = label.charAt(0).toUpperCase() + label.slice(1)
  const oldTime = formatTime(previousStartsAt, timeZone)
  const disclosureClause = disclosure ? ` ${disclosure}` : ""
  return `Done. ${lead} ${whenPhrase(newStartsAt, timeZone, now)} is moving to ${formatTime(newStartsAt, timeZone)}, it was ${oldTime}.${disclosureClause} Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at ${oldTime}? Say the word.`
}

/**
 * The ask-first question: Orbit's single best concrete reading, not an open
 * question. Concrete-first applies to the asking too. The proposed time is
 * named outright, so a confirm needs no re-disclosure.
 */
export function buildChangeQuestion(
  label: string,
  proposedStartsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `Sounds like you want ${label} ${whenPhrase(proposedStartsAt, timeZone, now)} moved to ${formatTime(proposedStartsAt, timeZone)}. Want me to make the change?`
}

/**
 * The honest decline for a clearly understood request this slice cannot act
 * on. Day outranks venue (a day request often names a time too, and acting on
 * half a request is the misread this slice exists to prevent).
 *
 * DEBT (recorded in the spec): each of these hardcodes what Orbit cannot do.
 * The slice that ships venue or day changes must retire its line here as part
 * of its definition of done, or Orbit starts lying.
 */
export function buildCantDoReply(
  fields: ChangeField[],
  eventStartsAt: Date,
  timeZone: string
): string {
  if (fields.includes("day")) {
    return `I can't move it to another day yet. I can change the time on ${formatWeekdayShort(eventStartsAt, timeZone)} if that helps.`
  }
  if (fields.includes("venue")) {
    return `I can't change the spot yet, that's coming. I can move the time if that helps.`
  }
  return `I can't change that part of the plan yet. Moving the time is what I can do.`
}

/** The same principle as promote's start_passed skip: no plans about the past. */
export const PAST_TIME_REPLY = "That time has already passed, so I'm leaving the plan alone."

/** Client-side error under the chips, never a feed message (gauge-vote precedent). */
export const STALE_PROPOSAL_ERROR = "The plan already changed, take a look up top."

export interface ChangeChipLabels {
  confirm: string
  decline: string
}

/** Soft decline per the copy rules: "Leave it", never a bare "No". */
export function changeChipLabels(): ChangeChipLabels {
  return { confirm: "Yes, move it", decline: "Leave it" }
}
