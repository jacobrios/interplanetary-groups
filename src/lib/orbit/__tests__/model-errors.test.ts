// src/lib/orbit/__tests__/model-errors.test.ts
//
// Pins the mapping the graceful out-of-credit state depends on. The real
// dry-balance error cannot be triggered without draining the account, so this
// replays the provider's documented error shapes exactly (spec: the honest
// gap, named up front).
import { describe, it, expect } from "vitest"
import Anthropic from "@anthropic-ai/sdk"
import {
  classifyModelCallError,
  ExtractionError,
  ModelUnavailableError,
} from "../model-errors"

const CREDIT_MSG =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."

// The installed SDK's APIError.generate collapses to APIConnectionError
// (status undefined) whenever headers is falsy, regardless of the status
// argument passed in: see node_modules/@anthropic-ai/sdk/src/core/error.ts.
// A real Headers object is required here so the generated error actually
// carries the status this test means to pin.
function apiError(status: number, type: string, message: string) {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message } },
    message,
    new Headers()
  )
}

describe("classifyModelCallError", () => {
  it("maps the dry-balance 400 to credits", () => {
    const out = classifyModelCallError(apiError(400, "invalid_request_error", CREDIT_MSG))
    expect(out).toBeInstanceOf(ModelUnavailableError)
    expect((out as ModelUnavailableError).reason).toBe("credits")
  })

  it("maps outages, overload, rate limits, and key trouble to trouble", () => {
    for (const err of [
      apiError(529, "overloaded_error", "Overloaded"),
      apiError(500, "api_error", "Internal server error"),
      apiError(429, "rate_limit_error", "Rate limited"),
      apiError(401, "authentication_error", "invalid x-api-key"),
      Anthropic.APIError.generate(undefined, undefined, "Connection error.", undefined),
    ]) {
      const out = classifyModelCallError(err)
      expect(out).toBeInstanceOf(ModelUnavailableError)
      expect((out as ModelUnavailableError).reason).toBe("trouble")
    }
  })

  it("keeps our own bad requests and unknown errors generic", () => {
    for (const err of [
      apiError(400, "invalid_request_error", "max_tokens is too large"),
      apiError(422, "invalid_request_error", "unprocessable"),
      new Error("something local blew up"),
    ]) {
      const out = classifyModelCallError(err)
      expect(out).toBeInstanceOf(ExtractionError)
      expect(out).not.toBeInstanceOf(ModelUnavailableError)
    }
  })
})
