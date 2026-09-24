// src/app/actions/__tests__/email-ask.test.ts
//
// The regression this guards: all three actions here run inside a
// useTransition from a modal the member may be mid-typing into
// (EmailAskNote.tsx, EmailAttachFlow.tsx). Before this fix, getCurrentUser()
// sat outside every try in this file, so a thrown AuthUnavailableError (an
// auth blip, not a signed-out visitor) propagated out of the transition
// callback, landed on error.tsx, and replaced the whole group home. A tap of
// "Not now" would close the sheet and then throw the page away; a typed
// address or a pending code would be lost with it. Each test below proves
// the action absorbs that throw and returns its normal soft-failure result
// instead, exactly as it already did for a null (signed-out) user.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const getCurrentUser = vi.fn()

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}))

const recordEmailOfferDismissed = vi.fn()

vi.mock("@/lib/auth/email-ask", () => ({
  recordEmailOfferDismissed: (...a: unknown[]) => recordEmailOfferDismissed(...a),
}))

const requestEmailAttach = vi.fn()
const confirmEmailAttach = vi.fn()

vi.mock("@/lib/auth/email", () => ({
  requestEmailAttach: (...a: unknown[]) => requestEmailAttach(...a),
  confirmEmailAttach: (...a: unknown[]) => confirmEmailAttach(...a),
}))

import {
  dismissEmailOfferAction,
  requestEmailAttachAction,
  confirmEmailAttachAction,
} from "../email-ask"
import { AuthUnavailableError } from "@/lib/auth/availability"

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errorLog.mockRestore()
})

const authDown = () => new AuthUnavailableError("Service temporarily unavailable")

describe("dismissEmailOfferAction", () => {
  it("returns { ok: false } instead of throwing when the auth service is unavailable", async () => {
    getCurrentUser.mockRejectedValue(authDown())

    await expect(dismissEmailOfferAction()).resolves.toEqual({ ok: false })
    expect(recordEmailOfferDismissed).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })

  it("still returns { ok: true } on the ordinary signed-in path", async () => {
    getCurrentUser.mockResolvedValue({ id: "usr_1" })
    recordEmailOfferDismissed.mockResolvedValue(undefined)

    await expect(dismissEmailOfferAction()).resolves.toEqual({ ok: true })
  })
})

describe("requestEmailAttachAction", () => {
  it("returns { result: 'service_error' } instead of throwing when the auth service is unavailable", async () => {
    getCurrentUser.mockRejectedValue(authDown())

    await expect(requestEmailAttachAction("sam@example.com")).resolves.toEqual({
      result: "service_error",
    })
    expect(requestEmailAttach).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })

  it("still hands the seam's result back on the ordinary signed-in path", async () => {
    getCurrentUser.mockResolvedValue({ id: "usr_1" })
    requestEmailAttach.mockResolvedValue({ result: "ok" })

    await expect(requestEmailAttachAction("sam@example.com")).resolves.toEqual({
      result: "ok",
    })
  })
})

describe("confirmEmailAttachAction", () => {
  it("returns { result: 'service_error' } instead of throwing when the auth service is unavailable", async () => {
    getCurrentUser.mockRejectedValue(authDown())

    await expect(confirmEmailAttachAction("sam@example.com", "12345678")).resolves.toEqual({
      result: "service_error",
    })
    expect(confirmEmailAttach).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })

  it("still hands the seam's result back on the ordinary signed-in path", async () => {
    getCurrentUser.mockResolvedValue({ id: "usr_1" })
    confirmEmailAttach.mockResolvedValue({ result: "ok" })

    await expect(confirmEmailAttachAction("sam@example.com", "12345678")).resolves.toEqual({
      result: "ok",
    })
  })
})
