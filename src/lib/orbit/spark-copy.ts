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
  formatTime,
  formatWeekdayLong,
  formatWeekdayShort,
} from "@/lib/events/format"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"
// Type-only, so it erases at compile time and cannot pull the model SDK back in.
import type { PartOfDay } from "./spark"

/**
 * The activity is one or two words in the member's own words and lands inside
 * a short sentence ("Anyone in for beers this Friday?"). Capped well below the
 * venue limit so a runaway string can never blow out the chat bubble.
 */
export const ACTIVITY_MAX = 40

// ── When Orbit proposes ──────────────────────────────────────────────────────

const FRIDAY = 5
const SATURDAY = 6

/**
 * Where an unstated time lands, and how a gauge's own clock runs: how much
 * notice it gives before it closes, and the local hour of its evening-before
 * bump. All five are placeholders with no data behind them (the time
 * defaults accepted 24 July 2026; the close window and bump hour added for
 * the gauge endgame; the retry guess day added for the wrong-day retry),
 * kept together beside the day fallback so the override-learning behavior in
 * build-notes §5 replaces the whole family at once.
 */
export const EVENING_TIME = "19:00"
export const MORNING_TIME = "09:00"
export const CLOSE_BEFORE_START_HOURS = 2
export const BUMP_LOCAL_HOUR = 20 // ~8pm group-local, the evening before

export interface ResolvedSparkTime {
  /** Always concrete: the event has to start at some o'clock. */
  timeLocal: string
  /**
   * The sentence Orbit adds to own up to a guess, or null when it did not
   * guess. Deliberately narrow: it fires only when someone stated an hour
   * whose half of the day Orbit had to pick. A fully unstated time gets no
   * line, because there is nothing the group said that could be misread.
   */
  disclosure: string | null
}

/**
 * The one place a sparked event's start time is decided.
 *
 * A stated unambiguous time wins outright. A genuine coin flip keeps the
 * stated hour and lands in the evening, plus one disclosure sentence: it does
 * not fall to the default, because the person said 8 and a card reading 7
 * would contradict them. Nothing stated falls to the part-of-day default.
 */
export function resolveSparkTime({
  statedTime,
  timeAmbiguous,
  partOfDay,
}: {
  statedTime: string | null
  timeAmbiguous: boolean
  partOfDay: PartOfDay | null
}): ResolvedSparkTime {
  if (statedTime === null) {
    return {
      timeLocal: partOfDay === "morning" ? MORNING_TIME : EVENING_TIME,
      disclosure: null,
    }
  }

  if (!timeAmbiguous) {
    return { timeLocal: statedTime, disclosure: null }
  }

  // The model flagged a coin flip but also told us the activity is a morning
  // one, which settles it. Trust the normalized field over the flag rather than
  // assuming the model is self-consistent: "hike at 6" with partOfDay morning
  // must stay 6am, not become a 6pm sunrise hike. Nothing to disclose, because
  // the activity did the deciding, not Orbit.
  if (partOfDay === "morning") {
    return { timeLocal: statedTime, disclosure: null }
  }

  // A genuine coin flip. Keep their hour, put it in the evening, and say so.
  const [h, m] = splitTime(statedTime)
  const eveningHour = h >= 1 && h <= 11 ? h + 12 : h === 0 ? 12 : h
  const timeLocal = `${pad(eveningHour)}:${pad(m)}`

  return {
    timeLocal,
    disclosure: `You said ${spokenHour(statedTime)}, so I'm taking that as ${formatTimeLocalLabel(timeLocal)}.`,
  }
}

/**
 * The instant a gauge's proposed day and time actually start, in the group's
 * zone. One implementation, shared by detection (which refuses to open a gauge
 * whose start has already gone) and promotion (which refuses to create an event
 * for one). Two copies of this arithmetic would eventually disagree about which
 * gauges are worth asking about.
 *
 * proposedTime is null only for gauges written before spark part two; those fall
 * to the evening default rather than blocking a group that is ready to go.
 */
export function sparkStartInstant(
  proposedDate: Date,
  proposedTime: string | null,
  timeZone: string
): Date {
  const day = getLocalParts(proposedDate, timeZone)
  const [hour, minute] = (proposedTime ?? EVENING_TIME).split(":").map(Number)
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, minute, timeZone)
}

/** "20:00" → "8pm", "08:30" → "8:30am". The group-facing label. */
export function formatTimeLocalLabel(timeLocal: string): string {
  const [h, m] = splitTime(timeLocal)
  const suffix = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`
}

/** "08:30" → "8:30": the number as the member themselves said it, no suffix. */
function spokenHour(timeLocal: string): string {
  const [h, m] = splitTime(timeLocal)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}` : `${h12}:${pad(m)}`
}

function splitTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number)
  return [h, m]
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

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
 * Friday for an evening or unknown idea, the coming Saturday for a morning one,
 * each pushed a week when it is inside the notice buffer. Friday because casual
 * social plans default to the end of the week; Saturday because that reasoning
 * is about evenings and a morning idea should not inherit it.
 *
 * These are starting heuristics with no data behind them (Friday accepted
 * 23 July 2026, Saturday 24 July 2026), and they live in one place beside the
 * time defaults so all four stay cheap to replace with the override-learning
 * behavior in build-notes §5.
 */
export function chooseProposedDate(
  statedDayOfWeek: number | null,
  partOfDay: PartOfDay | null,
  timeZone: string,
  now: Date
): Date {
  const today = getLocalParts(now, timeZone)
  const todayDow = weekdayOf(today.year, today.month, today.day)

  let offsetDays: number
  if (statedDayOfWeek !== null) {
    offsetDays = (statedDayOfWeek - todayDow + 7) % 7
  } else {
    // Friday was chosen on end-of-the-week social logic, which is about
    // evenings. A morning idea inherits Saturday instead: "breakfast sometime"
    // proposed for Friday 7pm would be wrong twice over.
    const fallbackDay = partOfDay === "morning" ? SATURDAY : FRIDAY
    offsetDays = (fallbackDay - todayDow + 7) % 7
    if (offsetDays < FALLBACK_BUFFER_DAYS) offsetDays += 7
  }

  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(today.year, today.month, today.day + offsetDays, 0, 0, timeZone)
}

/**
 * The retry guess: the same weekday one week after the failed day. The least
 * presumptuous guess with zero signal about which day works: it keeps the one
 * preference the group actually expressed (a Friday-shaped plan), and "can't
 * Fri" usually means this Friday, not Fridays. A placeholder like the rest of
 * this family; override-learning (build-notes §5) replaces them as one
 * decision. (Spec: wrong-day-retry, decision 5.)
 */
export function chooseRetryGuessDate(failedProposedDate: Date, timeZone: string): Date {
  const p = getLocalParts(failedProposedDate, timeZone)
  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(p.year, p.month, p.day + 7, 0, 0, timeZone)
}

/** Weekday of a stored instant read through the group's zone, 0 = Sunday. */
export function localWeekday(date: Date, timeZone: string): number {
  const p = getLocalParts(date, timeZone)
  return weekdayOf(p.year, p.month, p.day)
}

const WEEKDAY_LONG_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

/** A weekday name from the stored 0-6 integer, for days that have no date yet. */
export function weekdayLongName(dayOfWeek: number): string {
  return WEEKDAY_LONG_NAMES[dayOfWeek]
}

/**
 * The member-suggested retry: the first named weekday strictly after the
 * failed day, so "Sunday" said about a Saturday gauge lands the very next
 * day. Strictly after (`|| 7`) documents the rule even though a same-weekday
 * suggestion is discarded upstream (spec decision 10).
 */
export function chooseSuggestedRetryDate(
  failedProposedDate: Date,
  suggestedDayOfWeek: number,
  timeZone: string
): Date {
  const p = getLocalParts(failedProposedDate, timeZone)
  const failedDow = weekdayOf(p.year, p.month, p.day)
  const offset = (suggestedDayOfWeek - failedDow + 7) % 7 || 7
  // Date.UTC absorbs the day overflow, so month and year ends need no special case.
  return zonedWallTimeToUtc(p.year, p.month, p.day + offset, 0, 0, timeZone)
}

/**
 * Orbit's one reply to a recorded day comment. Announces the inference
 * (transparency: a vote was recorded without a tap) and never promises a
 * revival, only that the day is noted, because whether one happens depends
 * on a bar the comment cannot see. The already-in variant exists so the
 * reply never misstates someone's attendance (spec decision 2).
 */
export function buildDayCommentReply(
  failedProposedDate: Date,
  suggestedDayOfWeek: number,
  alreadyIn: boolean,
  timeZone: string
): string {
  const failed = formatWeekdayLong(failedProposedDate, timeZone)
  const suggested = weekdayLongName(suggestedDayOfWeek)
  return alreadyIn
    ? `You're still in for ${failed}, and ${suggested}'s noted if it doesn't come together.`
    : `Got it, ${failed} doesn't work for you. ${suggested}'s noted in case this one doesn't come together.`
}

/**
 * Two ideas gauging at once and the comment did not say which: ask, never
 * guess and never stay silent (spec decision 9; the which-plan question's
 * shape).
 */
export function buildWhichGaugeQuestion(activities: string[]): string {
  const list =
    activities.length === 2
      ? `${activities[0]} or ${activities[1]}`
      : `${activities.slice(0, -1).join(", ")}, or ${activities[activities.length - 1]}`
  return `Which one do you mean, ${list}? Name it with the day again and I've got it.`
}

/** The member-suggested revival's gauge message. Replaces the retry ask. */
export function buildSuggestedRetryMessage(
  activity: string,
  failedProposedDate: Date,
  revivalDate: Date,
  timeZone: string
): string {
  const cap = activity.charAt(0).toUpperCase() + activity.slice(1)
  const failed = formatWeekdayLong(failedProposedDate, timeZone)
  const revival = formatWeekdayLong(revivalDate, timeZone)
  return `${cap} didn't happen for ${failed}, but ${revival} came up as a better day. Anyone in for ${activity} this ${revival}? If three of you are in, I'll set it up.`
}

/** Model-facing context, not member-facing copy: the fact the recognizer needs. */
export function buildLiveGaugeLine(activity: string, proposedDate: Date, timeZone: string): string {
  const weekday = formatWeekdayLong(proposedDate, timeZone)
  return `Orbit is currently gauging interest in ${activity} for this ${weekday}; the group answers with the chips under that message.`
}

/** The close-and-ask for a day-blocked gauge. Replaces the closure note. */
export function buildRetryAskMessage(
  activity: string,
  failedProposedDate: Date,
  timeZone: string,
  wantCount: number
): string {
  const cap = activity.charAt(0).toUpperCase() + activity.slice(1)
  const weekday = formatWeekdayLong(failedProposedDate, timeZone)
  return `${cap} didn't happen for ${weekday}, but ${spellCount(wantCount)} of you want it. What day works better?`
}

/** The one guess, posted as a real gauge's message the evening after the ask. */
export function buildRetryGuessMessage(activity: string, guessDate: Date, timeZone: string): string {
  const weekday = formatWeekdayLong(guessDate, timeZone)
  return `No takers on a new day yet, so how about ${activity} next ${weekday}?`
}

/** Model-facing context, not member-facing copy: the fact the recognizer needs. */
export function buildOpenAskLine(activity: string, failedProposedDate: Date, timeZone: string): string {
  const weekday = formatWeekdayLong(failedProposedDate, timeZone)
  return `Orbit asked the group what day works better for ${activity}, since ${weekday} didn't work, and is waiting on an answer.`
}

/**
 * The time a day-answer gauge starts at, once the day itself is settled.
 *
 * A stated unambiguous time wins outright. An unstated time carries the
 * failed gauge's own stored time forward, because "what day works better"
 * asked about the day only, not the hour. A bare clock number reads into the
 * half of day the group's own original time already picked, the same
 * reasoning as resolveSparkTime's morning-partOfDay case, so nothing is
 * disclosed on this path: the group's own prior answer did the deciding, not
 * a fresh Orbit guess.
 */
export function resolveAnswerTime({
  answerTime,
  answerTimeAmbiguous,
  carriedTime,
}: {
  answerTime: string | null
  answerTimeAmbiguous: boolean
  carriedTime: string | null
}): string {
  const carried = carriedTime ?? EVENING_TIME
  if (answerTime === null) return carried
  if (!answerTimeAmbiguous) return answerTime
  const [h, m] = splitTime(answerTime)
  const carriedHour = splitTime(carried)[0]
  if (carriedHour >= 12 && h >= 1 && h <= 11) return `${pad(h + 12)}:${pad(m)}`
  return answerTime
}

export interface PlannedAnswerGauge {
  proposedDate: Date
  timeLocal: string
  /** True only when the member named exactly one day (the existing seeding rule). */
  seedNamer: boolean
  /** Born inside its own close window; caller appends the urgency clause. */
  bornLate: boolean
}

/**
 * Turns a recognized day answer, plus the failed ask's stored facts, into a
 * new gauge's shape. A named day is taken at face value via the ordinary
 * chooseProposedDate path (so seeding follows the same rule a fresh spark
 * uses); no day falls to the same-weekday-next-week guess, seeding nobody,
 * since that is Orbit's own move and Orbit is never a vote.
 *
 * Returns null when the resolved start has already passed: an answer that
 * names a day already gone or a hour already gone must not open a gauge for
 * a plan the group could never attend.
 */
export function planAnswerGauge(
  answer: { dayOfWeek: number | null; time: string | null; timeAmbiguous: boolean },
  ask: { proposedDate: Date; proposedTime: string | null },
  timeZone: string,
  now: Date
): PlannedAnswerGauge | null {
  const proposedDate =
    answer.dayOfWeek !== null
      ? chooseProposedDate(answer.dayOfWeek, null, timeZone, now)
      : chooseRetryGuessDate(ask.proposedDate, timeZone)
  const timeLocal = resolveAnswerTime({
    answerTime: answer.time,
    answerTimeAmbiguous: answer.timeAmbiguous,
    carriedTime: ask.proposedTime,
  })
  const start = sparkStartInstant(proposedDate, timeLocal, timeZone)
  if (start <= now) return null
  const bornLate = now.getTime() >= start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000
  return { proposedDate, timeLocal, seedNamer: answer.dayOfWeek !== null, bornLate }
}

/**
 * When the gauge stops taking answers. Two hours before the proposed start,
 * so a half-committed plan never limps ambiguously into its final hour; a
 * gauge born inside that window (a same-evening rally) runs to the start
 * itself instead. CLOSE_BEFORE_START_HOURS and BUMP_LOCAL_HOUR live up top
 * beside EVENING_TIME and MORNING_TIME, not here, so override learning finds
 * one cluster of placeholder numbers to replace, not two.
 */
export function gaugeClosesAt(
  proposedDate: Date,
  proposedTime: string | null,
  createdAt: Date,
  timeZone: string
): Date {
  const start = sparkStartInstant(proposedDate, proposedTime, timeZone)
  const normalClose = new Date(start.getTime() - CLOSE_BEFORE_START_HOURS * 60 * 60 * 1000)
  return createdAt.getTime() >= normalClose.getTime() ? start : normalClose
}

export function isGaugeLive(
  gauge: { proposedDate: Date; proposedTime: string | null; createdAt: Date },
  timeZone: string,
  now: Date
): boolean {
  return now.getTime() < gaugeClosesAt(gauge.proposedDate, gauge.proposedTime, gauge.createdAt, timeZone).getTime()
}

// ── What the group reads ─────────────────────────────────────────────────────

/**
 * One fixed emoji on the yes chip, not one matched to the activity. Nothing in
 * the product maps an activity to an emoji, and a table that guesses wrong
 * reads worse than one that never tries.
 */
const CHIP_IN_EMOJI = "✋"

/** Beyond this the proposed day is no longer "this <weekday>" and gets its date. */
export const THIS_WEEK_DAYS = 7

export interface GaugeVoteLike {
  userId: string
  answer: GaugeAnswer
}

export interface ChipLabels {
  in: string
  out: string
  notThatDay: string
}

/** Three people, including an initiator who named the day themselves. */
export const SPARK_THRESHOLD = 3

/**
 * Orbit's gauge message, including the promise to set it up.
 *
 * Part one withheld that clause because three yeses created nothing then. It is
 * honored now by promoteGaugeToEvent, in the same tap that produces the third
 * yes, so the sentence is true when it is said.
 *
 * The disclosure clause sits between the question and the promise: it is about
 * the time Orbit had to guess, so it belongs beside the plan, not after the
 * commitment.
 */
export function buildGaugeMessage(
  activity: string,
  proposedDate: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null
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

  const disclosureClause = disclosure ? ` ${disclosure}` : ""

  // The promise part one deliberately withheld. It can be kept now: three
  // yeses create the event in the same tap that produces the third one.
  return `Love it. Anyone in for ${activity} ${when}?${disclosureClause} If three of you are in, I'll set it up.`
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
 * Counts down only at one away from the bar. Part one had no countdown at any
 * count, because nothing happened when the bar was met.
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

  // One away, and only one away: at zero or one the countdown would be
  // pressure rather than information, and past the bar there is nothing left
  // to count down to.
  if (inNames.length === SPARK_THRESHOLD - 1) {
    parts.push("one more makes it happen")
  }

  return parts.join(" · ")
}

const BUMP_COUNTDOWN_WORDS: Record<number, string> = { 2: "two", 3: "three" }

export function buildBumpMessage(activity: string, inNames: string[]): string {
  if (inNames.length === 0) {
    return `In case this got buried: anyone in for ${activity} tomorrow?`
  }
  const who = inNames.length === 1 ? inNames[0] : `${inNames.slice(0, -1).join(", ")} & ${inNames[inNames.length - 1]}`
  const verb = inNames.length === 1 ? "is" : "are"
  const remaining = SPARK_THRESHOLD - inNames.length
  const countdown = remaining === 1 ? "one more makes it happen" : `${BUMP_COUNTDOWN_WORDS[remaining]} more make it happen`
  return `Last call on ${activity} tomorrow: ${who} ${verb} in, ${countdown}.`
}

export function buildClosureMessage(activity: string): string {
  const cap = activity.charAt(0).toUpperCase() + activity.slice(1)
  return `${cap} didn't come together this time. Maybe next week.`
}

export function buildUrgencyClause(proposedTime: string | null): string {
  const label = formatTimeLocalLabel(proposedTime ?? EVENING_TIME)
  return ` Heads up, this one's for today at ${label}, so get your yes in quick.`
}

/** Small numbers read as words in Orbit's voice; anything larger as digits. */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]

function spellCount(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

/**
 * What Orbit says in the feed the moment a gauge becomes an event.
 *
 * States the time out loud on purpose: the time may be Orbit's own default or
 * its reading of an ambiguous hour, and the group should see it the moment it
 * is fixed rather than discovering it on the card later.
 *
 * The count is passed in rather than spelled into the sentence. Normally it is
 * exactly SPARK_THRESHOLD, but a promotion that failed transiently at the bar
 * and succeeded on a later yes would otherwise have Orbit announce "Three of
 * you are in" to four people.
 */
export function buildSparkAnnouncement(
  activity: string,
  startsAt: Date,
  timeZone: string,
  inCount: number,
  now: Date
): string {
  const weekday = formatWeekdayShort(startsAt, timeZone)
  const time = formatTime(startsAt, timeZone)

  // Same reasoning as buildGaugeMessage: the fallback buffer can land eight
  // days out, where a bare "Fri" is ambiguous between this Friday and next.
  const daysAway = Math.round(
    (startsAt.getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000
  )
  const when =
    daysAway >= THIS_WEEK_DAYS
      ? `${weekday}, ${formatMonthDay(startsAt, timeZone)}`
      : weekday

  const who = `${spellCount(inCount)} of you are in`
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}, so ${activity} is on for ${when} at ${time}. It's up top now.`
}

/** The group-local midnight that starts the day `instant` falls in. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const p = getLocalParts(instant, timeZone)
  return zonedWallTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone)
}
