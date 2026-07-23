// src/lib/orbit/spark.ts
//
// Spark, part one: Orbit reads a member's message and decides whether someone
// just floated an idea worth gauging.
//
// This is the first time Orbit reacts to something a person said, which makes
// it the highest-risk thing Orbit does. Two rules shape the whole module:
//
//   1. The model's answer is a claim. normalizeSpark is the only door between
//      it and anything the group sees, exactly as normalize.ts is for
//      onboarding. Nothing branches on raw output.
//   2. When unsure, stay quiet. A missed idea costs nothing visible; a wrong
//      interjection teaches people to tune Orbit out. Anti-clutter outranks
//      coverage everywhere here.
//
// Model: claude-haiku-4-5, via the shared callExtractionModel.

import { callExtractionModel } from "./extract"
import { getLocalParts, zonedWallTimeToUtc } from "./occurrence"
import { cleanShortText } from "./rhythm"

/**
 * The activity is one or two words in the member's own words and lands inside
 * a short sentence ("Anyone in for beers this Friday?"). Capped well below the
 * venue limit so a runaway string can never blow out the chat bubble.
 */
export const ACTIVITY_MAX = 40

// Every field required with explicit nulls, matching the extraction doctrine:
// the model must make each omission explicit rather than silently dropping it.
export const SPARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isSpark", "activity", "statedDayOfWeek"],
  properties: {
    isSpark: { type: "boolean" },
    activity: { type: ["string", "null"] },
    statedDayOfWeek: { type: ["integer", "null"] },
  },
} as const

const SPARK_SYSTEM_PROMPT = `You read one message from a group chat and decide whether someone just floated an idea for the group to do something together.

Be conservative. A spark is a genuine suggestion that the group do something, like "we should finally grab beers" or "anyone want to climb Saturday?". These are NOT sparks:
- agreement or reactions ("sounds good", "nice", "haha", "same")
- questions or talk about the plan already on the calendar
- logistics about an existing plan ("running late", "what time again?")
- small talk, links, and anything with no activity in it

If you are not sure, answer isSpark false. Missing a real idea costs nothing; interjecting on ordinary chat is worse.

Fields:
- isSpark: true only when the message genuinely proposes the group do something together.
- activity: one or two words in the member's own words naming the activity ("beers", "climbing", "board games"). Drop filler and location words: "grab a beer at Tony's" is just "beers". Never invent an activity. Null when isSpark is false.
- statedDayOfWeek: 0 for Sunday through 6 for Saturday, and ONLY when the message names exactly one specific weekday. "beers Friday" is 5. "beers Friday or Saturday" names two, so it is null. "beers tomorrow" and "beers this weekend" do not name a weekday, so they are null. Null whenever you are not certain a single weekday was named.`

export interface SparkContext {
  /**
   * A compact line describing the event already on the group's calendar, or
   * null when there is none. Given to the model so chatter about the existing
   * plan reads as chatter and not as a fresh idea.
   */
  upcomingEvent: string | null
}

export type NormalizedSpark =
  | { spark: false }
  | { spark: true; activity: string; statedDayOfWeek: number | null }

/**
 * One structured-outputs call. Returns raw model output: a claim, not a fact.
 * Callers must pass it through normalizeSpark before acting on it.
 */
export async function detectSparkClaim(
  body: string,
  context: SparkContext
): Promise<unknown> {
  const calendarLine = context.upcomingEvent
    ? `Already on this group's calendar: ${context.upcomingEvent}`
    : `This group has nothing on its calendar right now.`

  const user = `${calendarLine}

The message:
${body}`

  return callExtractionModel(SPARK_SYSTEM_PROMPT, user, SPARK_SCHEMA)
}

/**
 * The claim-to-fact boundary. Every user-facing spark behavior reads this
 * shape, never the raw response.
 *
 * Degrades rather than throws, in two different directions on purpose:
 * an unusable day still leaves a gaugeable idea (Orbit picks the day), but an
 * unusable activity leaves nothing to gauge, so it is not a spark at all.
 */
export function normalizeSpark(raw: unknown): NormalizedSpark {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { spark: false }
  }

  const o = raw as Record<string, unknown>
  if (o.isSpark !== true) return { spark: false }

  const activity = cleanShortText(o.activity, ACTIVITY_MAX)
  if (!activity) return { spark: false }

  const d = o.statedDayOfWeek
  const statedDayOfWeek =
    typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6 ? d : null

  return { spark: true, activity, statedDayOfWeek }
}

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
