// src/lib/auth/__tests__/email.test.ts
//
// Every branch of the auth seam, against a mocked Supabase client. No network,
// no real Supabase, no database: these are unit tests of the classification
// itself, which is the whole point of the module. The error shapes below are
// the ones the task 1 spike actually recorded against the real service
// (docs/superpowers/specs/2026-08-25-email-sign-in-design.md, task 1
// findings), not shapes anybody invented for a test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const updateUser = vi.fn()
const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { updateUser, signInWithOtp, verifyOtp } }),
}))

const findUnique = vi.fn()
const deleteMany = vi.fn()
const create = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        contactMethod: {
          deleteMany: (...a: unknown[]) => deleteMany(...a),
          create: (...a: unknown[]) => create(...a),
        },
      }),
  },
}))

import {
  requestEmailAttach,
  confirmEmailAttach,
  requestSignInCode,
  confirmSignInCode,
} from "../email"

/** The duck-typed shape this module reads off a Supabase failure. */
function authError(code: string, status: number, message = "boom") {
  return { code, status, message, name: "AuthApiError" }
}

const okUser = { id: "supabase-uid-1" }

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errorLog.mockRestore()
})

describe("requestEmailAttach", () => {
  it("returns ok when Supabase accepts the pending address", async () => {
    updateUser.mockResolvedValue({ data: { user: okUser }, error: null })

    expect(await requestEmailAttach("  Sam@Example.com ")).toEqual({ result: "ok" })
    // Normalized before it leaves us, so the address Supabase holds and the
    // address ContactMethod stores can never differ by case or a stray space.
    expect(updateUser).toHaveBeenCalledWith({ email: "sam@example.com" })
  })

  it("rejects a malformed address without spending a send", async () => {
    for (const bad of ["", "   ", "sam", "sam@", "@example.com", "sam @example.com", "sam@example"]) {
      expect(await requestEmailAttach(bad)).toEqual({ result: "invalid_email" })
    }
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("maps Supabase's own address complaints to invalid_email", async () => {
    for (const code of ["email_address_invalid", "validation_failed"]) {
      updateUser.mockResolvedValue({ data: { user: null }, error: authError(code, 422) })
      expect(await requestEmailAttach("sam@example.com")).toEqual({ result: "invalid_email" })
    }
  })

  it("maps an address already on another identity to email_taken", async () => {
    for (const code of ["email_exists", "identity_already_exists", "user_already_exists"]) {
      updateUser.mockResolvedValue({ data: { user: null }, error: authError(code, 422) })
      expect(await requestEmailAttach("sam@example.com")).toEqual({ result: "email_taken" })
    }
  })

  it("maps both send-rate codes and a bare 429 to rate_limited", async () => {
    for (const err of [
      authError("over_email_send_rate_limit", 429),
      authError("over_request_rate_limit", 429),
      authError("something_new", 429),
    ]) {
      updateUser.mockResolvedValue({ data: { user: null }, error: err })
      expect(await requestEmailAttach("sam@example.com")).toEqual({ result: "rate_limited" })
    }
  })

  it("logs the underlying error before returning service_error", async () => {
    updateUser.mockResolvedValue({
      data: { user: null },
      error: authError("unexpected_failure", 500, "upstream exploded"),
    })

    expect(await requestEmailAttach("sam@example.com")).toEqual({ result: "service_error" })
    expect(errorLog).toHaveBeenCalledOnce()
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("upstream exploded")
  })

  it("logs and returns service_error when the client throws", async () => {
    updateUser.mockRejectedValue(new Error("socket hang up"))

    expect(await requestEmailAttach("sam@example.com")).toEqual({ result: "service_error" })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("socket hang up")
  })

  it("never puts the address in the log", async () => {
    updateUser.mockResolvedValue({ data: { user: null }, error: authError("unexpected_failure", 500) })

    await requestEmailAttach("sam@example.com")
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("sam@example.com")
  })
})

describe("confirmEmailAttach", () => {
  beforeEach(() => {
    verifyOtp.mockResolvedValue({ data: { user: okUser }, error: null })
    findUnique.mockResolvedValue({ id: "prisma-user-1" })
    deleteMany.mockResolvedValue({ count: 0 })
    create.mockResolvedValue({ id: "cm-1" })
  })

  it("confirms with type email_change, which is the type the spike proved", async () => {
    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({ result: "ok" })
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "sam@example.com",
      token: "12345678",
      type: "email_change",
    })
  })

  it("writes the verified, preferred ContactMethod for the current user", async () => {
    await confirmEmailAttach("Sam@Example.com", " 12345678 ")

    expect(findUnique).toHaveBeenCalledWith({ where: { supabaseAuthId: "supabase-uid-1" } })
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "prisma-user-1", type: "EMAIL" },
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "prisma-user-1",
        type: "EMAIL",
        value: "sam@example.com",
        isVerified: true,
        isPreferred: true,
      },
    })
  })

  it("leaves exactly one EMAIL row when the same person attaches twice", async () => {
    deleteMany.mockResolvedValue({ count: 1 })

    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({ result: "ok" })
    expect(deleteMany).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
  })

  it("accepts a code of any length, because the length is Supabase's to choose", async () => {
    for (const code of ["123456", "12345678", "1234567890"]) {
      expect(await confirmEmailAttach("sam@example.com", code)).toEqual({ result: "ok" })
    }
  })

  it("returns bad_code for an empty code without calling Supabase", async () => {
    expect(await confirmEmailAttach("sam@example.com", "   ")).toEqual({ result: "bad_code" })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it("returns bad_code for otp_expired, which covers wrong AND expired", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: authError("otp_expired", 403, "Token has expired or is invalid"),
    })

    expect(await confirmEmailAttach("sam@example.com", "00000000")).toEqual({ result: "bad_code" })
    expect(create).not.toHaveBeenCalled()
  })

  it("logs and returns service_error for any other Supabase failure", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: authError("unexpected_failure", 500, "gateway down"),
    })

    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("gateway down")
  })

  it("logs and returns service_error when Supabase returns neither user nor error", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null })

    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(errorLog).toHaveBeenCalledOnce()
  })

  it("logs and returns service_error when no app user matches the identity", async () => {
    findUnique.mockResolvedValue(null)

    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(create).not.toHaveBeenCalled()
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("supabase-uid-1")
  })

  it("logs and returns service_error when the ContactMethod write fails", async () => {
    create.mockRejectedValue(new Error("unique violation"))

    expect(await confirmEmailAttach("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("unique violation")
  })
})

describe("requestSignInCode", () => {
  it("returns ok and never creates an account on the way", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null })

    expect(await requestSignInCode(" Sam@Example.com ")).toEqual({ result: "ok" })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "sam@example.com",
      options: { shouldCreateUser: false },
    })
  })

  it("rejects a malformed address without spending a send", async () => {
    expect(await requestSignInCode("nope")).toEqual({ result: "invalid_email" })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it("maps otp_disabled to unknown_email", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: authError("otp_disabled", 422, "Signups not allowed for otp"),
    })

    expect(await requestSignInCode("nobody@example.com")).toEqual({ result: "unknown_email" })
  })

  it("maps user_not_found to unknown_email too", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: authError("user_not_found", 400) })

    expect(await requestSignInCode("nobody@example.com")).toEqual({ result: "unknown_email" })
  })

  it("maps a send-rate refusal to rate_limited", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: authError("over_email_send_rate_limit", 429),
    })

    expect(await requestSignInCode("sam@example.com")).toEqual({ result: "rate_limited" })
  })

  it("maps Supabase's address complaint to invalid_email", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: authError("email_address_invalid", 422) })

    expect(await requestSignInCode("sam@example.com")).toEqual({ result: "invalid_email" })
  })

  it("logs the underlying error before returning service_error", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: authError("unexpected_failure", 500, "smtp refused"),
    })

    expect(await requestSignInCode("sam@example.com")).toEqual({ result: "service_error" })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("smtp refused")
  })

  it("logs and returns service_error when the client throws", async () => {
    signInWithOtp.mockRejectedValue(new Error("dns failure"))

    expect(await requestSignInCode("sam@example.com")).toEqual({ result: "service_error" })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("dns failure")
  })
})

describe("confirmSignInCode", () => {
  beforeEach(() => {
    verifyOtp.mockResolvedValue({ data: { user: okUser }, error: null })
    findUnique.mockResolvedValue({ id: "prisma-user-1" })
  })

  it("confirms with type email and hands back the app user id", async () => {
    expect(await confirmSignInCode(" Sam@Example.com ", " 12345678 ")).toEqual({
      result: "ok",
      userId: "prisma-user-1",
    })
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "sam@example.com",
      token: "12345678",
      type: "email",
    })
    expect(findUnique).toHaveBeenCalledWith({ where: { supabaseAuthId: "supabase-uid-1" } })
  })

  it("returns bad_code for an empty code without calling Supabase", async () => {
    expect(await confirmSignInCode("sam@example.com", "")).toEqual({ result: "bad_code" })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it("returns bad_code for otp_expired, which covers wrong AND expired", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: authError("otp_expired", 403, "Token has expired or is invalid"),
    })

    expect(await confirmSignInCode("sam@example.com", "00000000")).toEqual({ result: "bad_code" })
  })

  it("returns no_user when the identity is real but the app has no row for it", async () => {
    findUnique.mockResolvedValue(null)

    expect(await confirmSignInCode("sam@example.com", "12345678")).toEqual({ result: "no_user" })
  })

  it("logs and returns service_error for any other Supabase failure", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: authError("unexpected_failure", 500, "auth server 500"),
    })

    expect(await confirmSignInCode("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("auth server 500")
  })

  it("logs and returns service_error when Supabase returns neither user nor error", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null })

    expect(await confirmSignInCode("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(errorLog).toHaveBeenCalledOnce()
  })

  it("logs and returns service_error when the user lookup throws", async () => {
    findUnique.mockRejectedValue(new Error("connection pool exhausted"))

    expect(await confirmSignInCode("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(JSON.stringify(errorLog.mock.calls[0])).toContain("connection pool exhausted")
  })
})
