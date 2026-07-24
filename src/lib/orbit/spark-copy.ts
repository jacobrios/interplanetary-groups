// src/lib/orbit/spark-copy.ts
//
// Every pure decision and every string the spark flow produces: which day
// Orbit proposes, whether a gauge is still live, and all of the copy.
//
// Split out of spark.ts deliberately (build-notes §11, spark part one debt).
// spark.ts imports the Anthropic SDK; this file must never import it, so a
// client component can pull a formatter or a label type from here without
// dragging the model client into the browser bundle.
//
// Structured-extract-then-format: the model supplies fields, code composes
// every string. Nothing in this file is generated prose.

import type { GaugeAnswer } from "@prisma/client"

import {
  formatMonthDay,
  formatWeekdayLong,
  formatWeekdayShort,
} from "@/lib/events/format"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"

/**
 * The activity is one or two words in the member's own words and lands inside
 * a short sentence ("Anyone in for beers this Friday?"). Capped well below the
 * venue limit so a runaway string can never blow out the chat bubble.
 */
export const ACTIVITY_MAX = 40

// ── Which day Orbit proposes ─────────────────────────────────────────────────

const FRIDAY = 5

/**
 * How much notice Orbit gives itself when IT picks the day. A gauge needs time
 * to collect answers, and proposing tomorrow does not give a group that.
 *
 * Fallback-only, deliberately. A day someone stated is taken at face value,
 * including today: pushing it out a week would propose a day they did not mean
 * and then count them for it.
 */
const FALLBACK_BUFFER_DAYS = 2

/** Weekday of a local calendar date, 0 = Sunday, read without touching the server's zone. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * The day Orbit proposes, as the group-local midnight instant.
 *
 * Stated day: its next occurrence, counting today. Nothing stated: the coming
 * Friday, pushed a week when that is inside the notice buffer. Friday because
 * casual social plans default to the end of the week.
 *
 * This is a starting heuristic with no data behind it (accepted 23 July 2026),
 * and it lives in one place so it stays cheap to replace with the
 * override-learning behavior in build-notes §5.
 */
export function chooseProposedDate(
  statedDayOfWeek: number | null,
  timeZone: string,
  now: Date
): Date {
  const today = getLocalParts(now, timeZone)
  const todayDow = weekdayOf(today.year, today.month, today.day)

  let offsetDays: number
  if (statedDayOfWeek !== null) {
    offsetDays = (statedDayOfWeek - todayDow + 7) % 7
  } else {
    offsetDays = (FRIDAY - todayDow + 7) % 7
    if (offsetDays < FALLBACK_BUFFER_DAYS) offsetDays += 7
  }

  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(today.year, today.month, today.day + offsetDays, 0, 0, timeZone)
}

/**
 * A gauge is live until the end of its proposed day in the group's zone. After
 * that the message stays in the feed as history and the chips are gone: no
 * pinning, no banner, no residue.
 */
export function isGaugeLive(proposedDate: Date, timeZone: string, now: Date): boolean {
  const day = getLocalParts(proposedDate, timeZone)
  const endOfDay = zonedWallTimeToUtc(day.year, day.month, day.day + 1, 0, 0, timeZone)
  return now.getTime() < endOfDay.getTime()
}

// ── What the group reads ─────────────────────────────────────────────────────

/**
 * One fixed emoji on the yes chip, not one matched to the activity. Nothing in
 * the product maps an activity to an emoji, and a table that guesses wrong
 * reads worse than one that never tries.
 */
const CHIP_IN_EMOJI = "✋"

/** Beyond this the proposed day is no longer "this <weekday>" and gets its date. */
const THIS_WEEK_DAYS = 7

export interface GaugeVoteLike {
  userId: string
  answer: GaugeAnswer
}

export interface ChipLabels {
  in: string
  out: string
  notThatDay: string
}

/**
 * Orbit's gauge message. Deliberately makes no promise: "if three of you are
 * in, I'll set it up" is a promise this half cannot keep, because three yeses
 * do not create anything until part two. A visible lie in the feed is worse
 * than a smaller sentence.
 */
export function buildGaugeMessage(
  activity: string,
  proposedDate: Date,
  timeZone: string,
  now: Date
): string {
  const weekday = formatWeekdayLong(proposedDate, timeZone)

  // The fallback buffer can land eight days out, where "this Friday" would be
  // wrong. Past a week Orbit says the date outright instead.
  const daysAway = Math.round(
    (proposedDate.getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000
  )
  const when =
    daysAway >= THIS_WEEK_DAYS
      ? `on ${weekday}, ${formatMonthDay(proposedDate, timeZone)}`
      : `this ${weekday}`

  return `Love it. Anyone in for ${activity} ${when}?`
}

/** The three chips. Weekday abbreviated on the third per the copy rule. */
export function chipLabels(proposedDate: Date, timeZone: string): ChipLabels {
  return {
    in: `${CHIP_IN_EMOJI} I'm in`,
    out: "🙏 Next time",
    notThatDay: `📅 Yes, can't ${formatWeekdayShort(proposedDate, timeZone)}`,
  }
}

/**
 * The quiet line under Orbit's message, derived from the vote rows every time
 * and never stored.
 *
 * Empty until somebody has actually voted: "nobody is in yet" is noise the
 * chips already imply. One or two people show by name, more collapses to names
 * plus a count, and people who want a different day are shown because hiding
 * them would misrepresent the group to itself.
 *
 * No countdown to the bar at any count. That clause lands in part two together
 * with the ability to honor it.
 */
export function buildTallyLine(
  votes: GaugeVoteLike[],
  names: Map<string, string>
): string {
  const inNames = votes
    .filter((v) => v.answer === "IN")
    .map((v) => names.get(v.userId))
    .filter((n): n is string => Boolean(n))

  const differentDay = votes.filter((v) => v.answer === "NOT_THAT_DAY").length

  const parts: string[] = []

  if (inNames.length === 1) {
    parts.push(`${inNames[0]} is in so far`)
  } else if (inNames.length === 2) {
    parts.push(`${inNames[0]} & ${inNames[1]} are in so far`)
  } else if (inNames.length > 2) {
    const rest = inNames.length - 2
    parts.push(
      `${inNames[0]}, ${inNames[1]} & ${rest} ${rest === 1 ? "other" : "others"} are in so far`
    )
  }

  if (differentDay > 0) {
    parts.push(
      `${differentDay} ${differentDay === 1 ? "wants" : "want"} a different day`
    )
  }

  return parts.join(" · ")
}

/** The group-local midnight that starts the day `instant` falls in. */
function startOfLocalDay(instant: Date, timeZone: string): Date {
  const p = getLocalParts(instant, timeZone)
  return zonedWallTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone)
}
