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
// Model: claude-haiku-4-5 (product decision: short structured extraction is
// well within Haiku's capability and keeps the onboarding pause short).

import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-4-5"

// All fields required; "not stated" is null, never absent — this forces the
// model to make every omission explicit instead of silently dropping fields.
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestedGroupName", "rhythms"],
  properties: {
    suggestedGroupName: { type: ["string", "null"] },
    rhythms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["activity", "cadence", "daysOfWeek", "timeLocal", "isPrimary"],
        properties: {
          activity: { type: ["string", "null"] },
          cadence: { type: ["string", "null"], enum: ["weekly", "monthly", null] },
          daysOfWeek: { type: ["array", "null"], items: { type: "integer" } },
          timeLocal: { type: ["string", "null"] },
          isPrimary: { type: "boolean" },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You read a founder's short description of their recurring group and extract its rhythms as structured data. Extract only what the founder actually said. Never invent a day, a time, or an activity.

Rules:
- Each distinct recurring activity is one rhythm.
- activity: a short noun phrase in the founder's own words (e.g. "climbing", "beers").
- cadence: "weekly" or "monthly" only when the description clearly supports it. A stated weekday ("Sundays", "every Tuesday") means weekly. "Every morning" or "every day" means weekly with all seven days. Yearly, one-off, or unclear cadence is null.
- daysOfWeek: integers 0-6 with 0=Sunday, only for days the founder stated. Otherwise null.
- timeLocal: 24-hour "HH:MM" only if the founder stated a time ("8" plus a morning context is "08:00"). Otherwise null.
- isPrimary: exactly one rhythm is primary, the group's main activity. If exactly one rhythm has both a stated day and a stated time, that rhythm must be the primary.
- suggestedGroupName: a short friendly name for the group, 2 to 4 words, drawn from the description (like "Sunday Climbers"). Letters, numbers and spaces only.`

/**
 * Thrown for every extraction failure mode (missing key, API error,
 * unexpected stop reason, unparsable output). Callers map every throw to
 * the same soft-retry state — the founder stays on Step 1 with their text
 * intact, and no group is created.
 */
export class ExtractionError extends Error {}

export async function extractGroupProfile(description: string): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError("ANTHROPIC_API_KEY is not set")
  }

  const client = new Anthropic()

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content: description }],
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
