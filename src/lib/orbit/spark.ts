// src/lib/orbit/spark.ts
//
// Orbit reads one member message and decides which of four things it is:
// a fresh idea worth gauging (spark), a request to change a plan already on
// the calendar (change), an answer to Orbit's own open day-ask (answer, live
// only inside the window between that ask going out and it being resolved),
// or neither. One structured-outputs call classifies all of it at once
// (detectIntentClaim / normalizeIntent, below); normalizeSpark remains the
// spark arm's normalizer, called through normalizeIntent.
//
// This is the first time Orbit reacts to something a person said, which makes
// it the highest-risk thing Orbit does. Two rules shape the whole module:
//
//   1. The model's answer is a claim. normalizeIntent (and normalizeSpark,
//      which it calls) is the only door between it and anything the group
//      sees, exactly as normalize.ts is for onboarding. Nothing branches on
//      raw output.
//   2. When unsure, stay quiet. A missed idea costs nothing visible; a wrong
//      interjection teaches people to tune Orbit out. Anti-clutter outranks
//      coverage everywhere here.
//
// Model: claude-haiku-4-5, via the shared callExtractionModel.
//
// Pure formatters and scheduling helpers live in spark-copy.ts, which has no
// Anthropic import. Keep it that way: this module must stay server-only.

import { callExtractionModel } from "./extract"
import { cleanShortText, TIME_LOCAL_RE } from "./rhythm"
import { ACTIVITY_MAX } from "./spark-copy"

/**
 * What kind of activity this is, which is what settles an unstated time. About
 * the activity itself, never about any hour the message named.
 */
export type PartOfDay = "morning" | "evening"

export type NormalizedSpark =
  | { spark: false }
  | {
      spark: true
      activity: string
      statedDayOfWeek: number | null
      /** Validated "HH:mm", or null when none was stated. */
      statedTime: string | null
      /** A clock number with no am/pm that the activity does not settle. */
      timeAmbiguous: boolean
      partOfDay: PartOfDay | null
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

  const statedTime =
    typeof o.statedTime === "string" && TIME_LOCAL_RE.test(o.statedTime) ? o.statedTime : null

  // Ambiguity is a property of a time that exists. Without one there is
  // nothing to be uncertain about, and letting the flag stand alone would
  // send the disclosure line out with nothing to disclose.
  const timeAmbiguous = statedTime !== null && o.timeAmbiguous === true

  const partOfDay: PartOfDay | null =
    o.partOfDay === "morning" || o.partOfDay === "evening" ? o.partOfDay : null

  return { spark: true, activity, statedDayOfWeek, statedTime, timeAmbiguous, partOfDay }
}

// ── Three-way intent (change-request slice) ─────────────────────────────────
// One read per message, extending the spark call rather than adding a second:
// the spark prompt already taught the model what a change request looks like,
// purely to say "not a spark". Here that negative class becomes a positive one.

export type ChangeField = "time" | "day" | "venue" | "other"

export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isSpark", "activity", "statedDayOfWeek", "statedTime", "timeAmbiguous", "partOfDay",
    "isChangeRequest", "targetEventNumber", "requestedTime", "requestedTimeAmbiguous",
    "requestedFields", "intentClear",
    "isAskAnswer", "answerDayOfWeek", "answerTime", "answerTimeAmbiguous",
  ],
  properties: {
    isSpark: { type: "boolean" },
    activity: { type: ["string", "null"] },
    statedDayOfWeek: { type: ["integer", "null"] },
    statedTime: { type: ["string", "null"] },
    timeAmbiguous: { type: "boolean" },
    partOfDay: {
      anyOf: [{ type: "string", enum: ["morning", "evening"] }, { type: "null" }],
    },
    isChangeRequest: { type: "boolean" },
    targetEventNumber: { type: ["integer", "null"] },
    requestedTime: { type: ["string", "null"] },
    requestedTimeAmbiguous: { type: "boolean" },
    requestedFields: {
      type: "array",
      items: { type: "string", enum: ["time", "day", "venue", "other"] },
    },
    intentClear: { type: "boolean" },
    isAskAnswer: { type: "boolean" },
    answerDayOfWeek: { type: ["integer", "null"] },
    answerTime: { type: ["string", "null"] },
    answerTimeAmbiguous: { type: "boolean" },
  },
} as const

const INTENT_SYSTEM_PROMPT = `You read one message from a group chat and classify it. At most one of these is true:
- SPARK: the message floats a fresh idea for the group to do something together, like "we should finally grab beers" or "anyone want to climb Saturday?".
- CHANGE REQUEST: the message asks for a plan already on the group's calendar to be changed, like "can we do 9 instead?", "let's move it to 6pm", or "put it back at 8".
- ANSWER: possible only when a note below says Orbit is waiting on an answer about what day works better. The message answers that question with a day or a rough time frame, like "Saturday?", "saturday works for me", or "next week?".
- Neither: everything else.

You are shown the recent conversation with timestamps, including Orbit's own messages, plus the current date and time. Use it to resolve short messages: which plan a bare follow-up like "can we do 9 instead?" is about (usually the plan just discussed), what "it" refers to, and a correction like "sorry, I meant beers, not climbing", which is a change request for the plan the person now names, carrying the time from the exchange it corrects. Judge from the timestamps whether an earlier message is still what the group is talking about. The numbered calendar list, not the conversation, is the only source of plan numbers. When a note says a question is already out to the group about moving a plan, a message that simply agrees with it is neither a spark nor a change request; the chips handle agreement. When a note says Orbit is waiting on an answer about what day works better for an activity, a short reply naming a day or a time frame is almost always that answer: classify it as ANSWER even though it names a weekday, not as a change request and not as a spark. A message about the past ("saturday was fun") answers nothing.

Be conservative in both directions. These are NOT sparks and NOT change requests:
- agreement or reactions ("sounds good", "nice", "haha", "same")
- questions that only ask for information about an existing plan ("what time again?", "where is it?"). A question that asks for the plan to change ("can we move it?", "any chance we push it later?") IS a change request, even when it names no time and no plan
- logistics and availability ("running late", "I can't make 8", "see you there")
- wishes and commentary that do not ask for anything ("9 would've been better")
- small talk, links, and anything with no activity or plan in it

Two different kinds of doubt, and they get opposite answers. If the message is asking for a plan to change, say so even when it does not say which plan or what time: leave those fields null and set isChangeRequest true, because the missing pieces get asked about and an incomplete ask is still an ask. If you are not sure the message is asking for anything at all, answer isSpark false and isChangeRequest false. A message cannot be both: if it somehow reads as both, set only the one it mostly is. While Orbit is waiting on a day answer, prefer ANSWER over CHANGE REQUEST for a short reply that names a day.

Spark fields (null, false, or empty when isSpark is false):
- activity: one or two words in the member's own words naming the activity ("beers", "climbing", "board games"). Drop filler and location words: "grab a beer at Tony's" is just "beers". Never invent an activity.
- statedDayOfWeek: 0 for Sunday through 6 for Saturday, and ONLY when the message names exactly one specific weekday. "beers Friday" is 5. "beers Friday or Saturday" names two, so it is null. "beers tomorrow" and "beers this weekend" do not name a weekday, so they are null. Null whenever you are not certain a single weekday was named.
- statedTime: 24-hour "HH:MM" only if the message stated a time. Use the activity to read it: "beers at 8" is "20:00", "breakfast at 8" is "08:00". Null when no time was stated.
- timeAmbiguous: true only when a clock number was given with no am or pm AND the activity does not settle it. "beers at 8" is not ambiguous, because beers do not happen at 8 in the morning. "breakfast at 8" is not ambiguous. "meet at 8" for something that happens at both ends of the day IS ambiguous: set statedTime to your best reading and timeAmbiguous to true. When statedTime is null, timeAmbiguous is false.
- partOfDay: "morning" for activities that happen in the morning (breakfast, coffee, a sunrise hike), "evening" for activities that happen at night (beers, dinner, drinks, a movie). Null when the activity could genuinely be either, or when you are unsure. This is about the activity itself, not about any time that was stated.

Change-request fields (null, false, or empty when isChangeRequest is false):
- targetEventNumber: the number of the calendar plan the message is about, from the numbered list you were given. Null when you cannot tell which one, or when nothing is on the calendar. Use the conversation to tell which plan a bare follow-up or correction means.
- requestedTime: 24-hour "HH:MM" best reading of the time they want the plan moved to. Null when they did not ask for a specific clock time. The time may come from an earlier message in the conversation when the new message plainly refers back to it.
- requestedTimeAmbiguous: true only when a clock number was given with no am or pm and nothing in the message settles it. "Can we do 9 instead?" IS ambiguous: put your best reading in requestedTime and set this true. "Make it 9pm" is not ambiguous.
- requestedFields: every part of the plan the message asks to change: "time" (a different clock time), "day" (a different calendar day, including "tomorrow" or a named weekday), "venue" (a different place), "other" (anything else). Asking to move a plan to a different day is "day", even when a time is named alongside it.
- intentClear: true when the message plainly asks for the change ("can we do 9 instead?", "let's make it 6pm", "put it back at 8"). False when you believe they want a change but the message is indirect, or you are unsure which plan or what exactly they want.

Answer fields (false or null whenever isAskAnswer is false, and always when no note says Orbit is waiting on an answer):
- isAskAnswer: true only when a note says Orbit is waiting on an answer AND this message answers it.
- answerDayOfWeek: 0 for Sunday through 6 for Saturday, ONLY when the answer names exactly one specific weekday. "next week?" and "any day works" name none, so null. Null whenever you are not certain a single weekday was named.
- answerTime: 24-hour "HH:MM" only if the answer states a time ("Saturday at 9?" is "09:00" with the ambiguity flag). Null when no time was stated.
- answerTimeAmbiguous: true only when a clock number was given with no am or pm. When answerTime is null, false.`

export interface IntentContext {
  /** One line per upcoming plan, numbered from 1, in the order the group sees them. */
  upcomingLines: string[]
  /** buildConversationWindow output: now-anchor, timestamped lines, marked trigger. */
  conversationBlock: string
  /** One line per live GROUP proposal, empty when none. */
  openProposalLines: string[]
  /** buildOpenAskLine output when an unanswered day-ask is open, else null. */
  openAskLine: string | null
}

export interface NormalizedChange {
  /** Index into the upcoming-events list the model was shown, bounds-checked here. */
  targetEventIndex: number | null
  /** Validated "HH:mm", or null when no concrete time was requested. */
  requestedTime: string | null
  /** A clock number with no am/pm that nothing in the message settles. */
  requestedTimeAmbiguous: boolean
  requestedFields: ChangeField[]
  /** True only for a plain, direct ask. Anything less routes to the ask path. */
  intentClear: boolean
}

export interface NormalizedAnswer {
  dayOfWeek: number | null
  /** Validated "HH:mm", or null when none was stated. */
  time: string | null
  timeAmbiguous: boolean
}

export type NormalizedIntent =
  | { kind: "none" }
  | { kind: "spark"; spark: Extract<NormalizedSpark, { spark: true }> }
  | { kind: "change"; change: NormalizedChange }
  | { kind: "answer"; answer: NormalizedAnswer }

/**
 * One structured-outputs call. Returns raw model output: a claim, not a fact.
 * Callers must pass it through normalizeIntent before acting on it.
 */
export async function detectIntentClaim(
  body: string,
  context: IntentContext
): Promise<unknown> {
  const calendarBlock = context.upcomingLines.length
    ? `On this group's calendar right now:\n${context.upcomingLines.join("\n")}`
    : `This group has nothing on its calendar right now.`
  const proposalBlock = context.openProposalLines.length
    ? `\n\n${context.openProposalLines.join("\n")}`
    : ""
  const askBlock = context.openAskLine ? `\n\n${context.openAskLine}` : ""

  const user = `${calendarBlock}${proposalBlock}${askBlock}

${context.conversationBlock}

The message to classify:
${body}`

  return callExtractionModel(INTENT_SYSTEM_PROMPT, user, INTENT_SCHEMA)
}

const CHANGE_FIELDS: readonly string[] = ["time", "day", "venue", "other"]

/**
 * The claim-to-fact boundary for the three-way read. Same doctrine as
 * normalizeSpark: degrade, never throw, and degrade toward silence. A claim of
 * both intents at once is incoherent and acted on as neither.
 */
export function normalizeIntent(
  raw: unknown,
  upcomingCount: number,
  hasOpenAsk: boolean
): NormalizedIntent {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { kind: "none" }
  const o = raw as Record<string, unknown>

  // The answer arm outranks the other two, and exists only inside its window:
  // hasOpenAsk is deterministic code's own confirmation (decision 3), so a
  // claimed answer with no open ask is ignored entirely, and inside the window
  // the answer reading beats a change reading (decision 4) because Orbit's own
  // question is the loudest context on screen.
  if (hasOpenAsk && o.isAskAnswer === true) {
    const d = o.answerDayOfWeek
    const dayOfWeek =
      typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6 ? d : null
    const time =
      typeof o.answerTime === "string" && TIME_LOCAL_RE.test(o.answerTime) ? o.answerTime : null
    const timeAmbiguous = time !== null && o.answerTimeAmbiguous === true
    return { kind: "answer", answer: { dayOfWeek, time, timeAmbiguous } }
  }

  if (o.isSpark === true && o.isChangeRequest === true) return { kind: "none" }

  if (o.isSpark === true) {
    const spark = normalizeSpark(raw)
    return spark.spark ? { kind: "spark", spark } : { kind: "none" }
  }

  if (o.isChangeRequest !== true) return { kind: "none" }

  const requestedFields = Array.isArray(o.requestedFields)
    ? ([...new Set(o.requestedFields)].filter((f): f is ChangeField =>
        CHANGE_FIELDS.includes(f as string)
      ) as ChangeField[])
    : []
  // An empty list is deliberately kept. A bare "can we move it?" names no
  // field, and the reply ladder answers that shape with a which-plan or
  // which-time question. Rejecting it here was part one's stay-quiet default
  // outliving the 28 July rule that a direct ask never gets silence, and it
  // failed identically on every run rather than only sometimes. Not defaulted
  // to ["time"]: that would assert a claim the model never made, on the one
  // boundary whose whole job is to avoid that, and it would be wrong for
  // someone who meant the venue.

  const n = o.targetEventNumber
  const targetEventIndex =
    typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= upcomingCount ? n - 1 : null

  const requestedTime =
    typeof o.requestedTime === "string" && TIME_LOCAL_RE.test(o.requestedTime)
      ? o.requestedTime
      : null
  // Same rule as spark: ambiguity is a property of a time that exists.
  const requestedTimeAmbiguous = requestedTime !== null && o.requestedTimeAmbiguous === true

  return {
    kind: "change",
    change: {
      targetEventIndex,
      requestedTime,
      requestedTimeAmbiguous,
      requestedFields,
      intentClear: o.intentClear === true,
    },
  }
}
