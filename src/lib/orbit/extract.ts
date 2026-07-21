// src/lib/orbit/extract.ts
//
// The product's first real Anthropic API call: onboarding rhythm extraction.
// Server-side only — ANTHROPIC_API_KEY never reaches the browser.
//
// Uses structured outputs (output_config.format json_schema) so the wire
// shape is schema-enforced. Semantic validation — ranges, whitelists, primary
// promotion, the completeness gate — lives in normalize.ts, which treats this
// function's return value as a claim, never a fact. That is why the return
// type is `unknown` on purpose.
//
// The schema, the per-field rules, and the call helper are shared with the
// gap-ask merge call (merge.ts), so both calls speak the same contract and
// their output flows through the identical normalize path.
//
// Model: claude-haiku-4-5 (product decision: short structured extraction is
// well within Haiku's capability and keeps the onboarding pause short).

import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-4-5"

// All fields required; "not stated" is null, never absent — this forces the
// model to make every omission explicit instead of silently dropping fields.
// timeAmbiguous makes a hedged time reading explicit too: the ask-if-missing
// guardrail needs the model to flag "Tuesdays at 7" instead of silently
// resolving it. clarifyingQuestion rides on the same response so the gap-ask
// loop never needs a second call (and a second pause) to get its question.
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestedGroupName", "rhythms", "clarifyingQuestion"],
  properties: {
    suggestedGroupName: { type: ["string", "null"] },
    clarifyingQuestion: { type: ["string", "null"] },
    rhythms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["activity", "cadence", "daysOfWeek", "timeLocal", "timeAmbiguous", "isPrimary"],
        properties: {
          activity: { type: ["string", "null"] },
          cadence: {
            anyOf: [{ type: "string", enum: ["weekly", "monthly"] }, { type: "null" }],
          },
          daysOfWeek: { type: ["array", "null"], items: { type: "integer" } },
          timeLocal: { type: ["string", "null"] },
          timeAmbiguous: { type: "boolean" },
          isPrimary: { type: "boolean" },
        },
      },
    },
  },
} as const

// Per-field semantics, shared verbatim between the extraction and merge
// prompts so the two calls can never drift on what a field means.
export const FIELD_RULES = `- activity: one or two words in the founder's own words, naming the activity itself (e.g. "climbing", "beers", "board games"). Drop location and filler words: "climbing at the gym" is just "climbing".
- cadence: "weekly" or "monthly" only when the description clearly supports it. A stated weekday ("Sundays", "every Tuesday") means weekly. "Every morning" or "every day" means weekly with all seven days. Yearly, one-off, or unclear cadence is null.
- daysOfWeek: integers 0-6 with 0=Sunday, only for days the founder stated. Otherwise null.
- timeLocal: 24-hour "HH:MM" only if the founder stated a time. Use context to read it ("8" with a morning context is "08:00"). Otherwise null.
- timeAmbiguous: true only when the founder gave a clock number with no am or pm and no context that settles it. "Tuesdays at 7" is ambiguous: set timeLocal to your best reading of it and timeAmbiguous to true. "7am", "7 in the evening", "noon", "midnight", "after work around 6", "Sunday mornings at 8" are not ambiguous: timeAmbiguous is false. When timeLocal is null, timeAmbiguous is false.
- isPrimary: exactly one rhythm is primary, the group's main activity. If exactly one rhythm has both a stated day and a stated time, that rhythm must be the primary.
- suggestedGroupName: a short friendly name for the group, 2 to 4 words, drawn from the description (like "Sunday Climbers"). Letters, numbers and spaces only.
- clarifyingQuestion: null when the primary rhythm has a weekly cadence, at least one stated day, and an unambiguous time. Otherwise write the ONE question whose answer would fill the biggest gap: a single short sentence ending in a question mark, under 120 characters, plain warm everyday words a 13 year old would understand, no dashes, no periods, no exclamation marks. If both the day and the time are missing, the one question must ask for both, like "What day and time do you usually meet?". If the time is ambiguous, ask whether it is morning or evening, naming the number the founder used, like "Is 7 in the morning or the evening?".`

const SYSTEM_PROMPT = `You read a founder's short description of their recurring group and extract its rhythms as structured data. Extract only what the founder actually said. Never invent a day, a time, or an activity.

Rules:
- Each distinct recurring activity is one rhythm.
${FIELD_RULES}`

/**
 * Thrown for every extraction failure mode (missing key, API error,
 * unexpected stop reason, unparsable output). Callers map every throw to
 * the same soft-retry state — the founder stays where they were with their
 * text intact, and no group is created.
 */
export class ExtractionError extends Error {}

/**
 * One structured-outputs call against the shared schema. Both onboarding
 * calls (extraction and gap-answer merge) go through here; the returned
 * value is a claim for normalize.ts, never a fact.
 */
export async function callExtractionModel(system: string, user: string): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError("ANTHROPIC_API_KEY is not set")
  }

  const client = new Anthropic()

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      output_config: {
        format: {
          type: "json_schema",
          schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content: user }],
    })
  } catch (err) {
    throw new ExtractionError(`extraction request failed: ${(err as Error).message}`)
  }

  // Anything other than a clean finish (refusal, truncation) is unusable.
  if (response.stop_reason !== "end_turn") {
    throw new ExtractionError(`unexpected stop_reason: ${response.stop_reason}`)
  }

  const text = response.content.find((b) => b.type === "text")?.text
  if (!text) {
    throw new ExtractionError("no text block in response")
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new ExtractionError("response was not valid JSON")
  }
}

export async function extractGroupProfile(description: string): Promise<unknown> {
  return callExtractionModel(SYSTEM_PROMPT, description)
}
