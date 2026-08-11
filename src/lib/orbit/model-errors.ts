// src/lib/orbit/model-errors.ts
//
// The one place a failed model call is read (spec decision 5): the reason
// Orbit shows is never false. "credits" only when the provider genuinely
// reports a dry balance; "trouble" for anything where the service, not the
// founder and not our request shape, is the problem; a plain ExtractionError
// for our own malformed requests and local surprises, which keep today's
// generic retry copy.
//
// Client components must import ModelFailureReason with `import type` only:
// this module imports the Anthropic SDK, which must never enter a client
// bundle.

import Anthropic from "@anthropic-ai/sdk"

export type ModelFailureReason = "credits" | "trouble"

/**
 * Thrown for every extraction failure mode (missing key, API error,
 * unexpected stop reason, unparsable output). Callers map every throw to
 * the same soft-retry state — the founder stays where they were with their
 * text intact, and no group is created.
 */
export class ExtractionError extends Error {}

export class ModelUnavailableError extends ExtractionError {
  constructor(
    readonly reason: ModelFailureReason,
    message: string
  ) {
    super(message)
  }
}

const CREDIT_BALANCE_RE = /credit balance is too low/i

export function classifyModelCallError(err: unknown): ExtractionError {
  if (err instanceof Anthropic.APIError) {
    const message = err.message ?? ""
    if (err.status === 400 && CREDIT_BALANCE_RE.test(message)) {
      return new ModelUnavailableError("credits", "provider reports the credit balance is dry")
    }
    if (err.status === 400 || err.status === 422) {
      // Our request was malformed: a bug on our side, not an outage.
      return new ExtractionError(`extraction request failed: ${message}`)
    }
    // Connection failures (status undefined), key trouble (401/403), rate
    // limits (429), overload (529), and server errors are all, from the
    // founder's chair, the service having trouble.
    return new ModelUnavailableError("trouble", `provider unavailable (${err.status ?? "connection"}): ${message}`)
  }
  return new ExtractionError(
    `extraction request failed: ${err instanceof Error ? err.message : String(err)}`
  )
}
