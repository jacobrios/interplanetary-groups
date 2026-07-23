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
