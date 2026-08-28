// src/app/actions/__tests__/signin.test.ts
//
// The two writes behind /signin, the way back in for somebody who no longer
// has an invite link to hand. Every service is mocked: no Supabase, no
// database, no network. What is under test is the decision layer, which is the
// only part of this that is ours: what each normalized seam result means,
// whether the orphan session gets signed back out, and where a person lands
// once they are in.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const requestSignInCode = vi.fn()
const confirmSignInCode = vi.fn()

vi.mock("@/lib/auth/email", () => ({
  requestSignInCode: (...a: unknown[]) => requestSignInCode(...a),
  confirmSignInCode: (...a: unknown[]) => confirmSignInCode(...a),
}))

const signOut = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}))

/**
 * redirect() throws NEXT_REDIRECT in production too, so throwing here is the
 * honest stand-in rather than a convenience: a test that let it return would
 * not notice code placed after it.
 */
class RedirectSignal extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT:${to}`)
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to)
  },
}))

import { requestSignInCodeAction, confirmSignInAction } from "../signin"

let errorLog: ReturnType<typeof vi.spyOn>
let warnLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
  warnLog = vi.spyOn(console, "warn").mockImplementation(() => {})
  // The real shape: signOut RETURNS { error } rather than throwing.
  signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  errorLog.mockRestore()
  warnLog.mockRestore()
})

describe("requestSignInCodeAction", () => {
  it("hands the seam's normalized result straight back", async () => {
    requestSignInCode.mockResolvedValue({ result: "ok" })

    expect(await requestSignInCodeAction("sam@example.com")).toEqual({ result: "ok" })
    expect(requestSignInCode).toHaveBeenCalledWith("sam@example.com")
  })

  // The honest answer the slice settled on. The vague version leaves a typo
  // waiting forever for mail that is never coming.
  it("passes an unknown address through as unknown_email rather than softening it", async () => {
    requestSignInCode.mockResolvedValue({ result: "unknown_email" })

    expect(await requestSignInCodeAction("nobody@example.com")).toEqual({
      result: "unknown_email",
    })
  })

  // The one classified outcome worth a log line. The auth seam logs only
  // service_error, on the reasoning that a classified result is a product
  // state rather than an incident, and that reasoning is right everywhere
  // except here: this endpoint is unauthenticated and uncapped, so its rate
  // limit is the whole of its abuse ceiling. Without this, one script burning
  // the mail allowance takes sign-in down for everybody and leaves no trace
  // anywhere that anything happened.
  it("leaves a trace when the mail allowance is what refused, since nothing else would", async () => {
    requestSignInCode.mockResolvedValue({ result: "rate_limited" })

    expect(await requestSignInCodeAction("sam@example.com")).toEqual({ result: "rate_limited" })
    expect(warnLog).toHaveBeenCalledTimes(1)
  })

  it("stays quiet about the outcomes that are ordinary product states", async () => {
    for (const result of ["ok", "invalid_email", "unknown_email"] as const) {
      requestSignInCode.mockResolvedValue({ result })
      await requestSignInCodeAction("sam@example.com")
    }
    expect(warnLog).not.toHaveBeenCalled()
  })

  // The whole point of this endpoint: the person calling it usually has no
  // session and cannot get one without it. Nothing here provides a session, so
  // a getCurrentUser-style guard added later reddens this rather than shipping
  // as sign-in refusing everyone who is signed out.
  it("works with nobody signed in, which is the state it is usually called from", async () => {
    requestSignInCode.mockResolvedValue({ result: "ok" })

    expect(await requestSignInCodeAction("sam@example.com")).toEqual({ result: "ok" })
  })
})

describe("confirmSignInAction", () => {
  it("sends a signed-in person to the front door, which decides where they belong", async () => {
    confirmSignInCode.mockResolvedValue({ result: "ok", userId: "user-1" })

    await expect(confirmSignInAction("sam@example.com", "12345678")).rejects.toMatchObject({
      to: "/",
    })
    expect(confirmSignInCode).toHaveBeenCalledWith("sam@example.com", "12345678")
  })

  it("carries a bad code back without touching the session", async () => {
    confirmSignInCode.mockResolvedValue({ result: "bad_code" })

    expect(await confirmSignInAction("sam@example.com", "00000000")).toEqual({
      result: "bad_code",
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it("carries a service failure back without touching the session", async () => {
    confirmSignInCode.mockResolvedValue({ result: "service_error" })

    expect(await confirmSignInAction("sam@example.com", "12345678")).toEqual({
      result: "service_error",
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  // The caller decision the auth seam refuses to make for us. By the time
  // no_user comes back, verifyOtp has already replaced whatever session this
  // browser held with one for an identity no User row points at. We cannot put
  // the old one back, so the only question left is whether to keep the orphan,
  // and keeping it is strictly worse: getCurrentUser() reads it as signed out
  // while joinGroupAction reads it as a session and skips signInAnonymously,
  // which welds the next join onto an identity nobody can account for.
  it("signs the unresolvable session out rather than leaving an orphan cookie behind", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })

    expect(await confirmSignInAction("sam@example.com", "12345678")).toEqual({
      result: "no_user",
    })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  // The shape that actually happens, and the one the first version of this
  // file got wrong. signOut REPORTS a service failure in its return value
  // rather than throwing it: on a non-404/401/403 API error, and on a network
  // failure, GoTrueClient returns { error } before it ever clears the session.
  // So a try/catch on its own leaves the orphan cookie live AND silent, which
  // is the exact state the sign-out exists to prevent.
  it("reports a sign-out that fails by returning an error rather than throwing", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })
    signOut.mockResolvedValue({ error: { message: "service unavailable" } })

    expect(await confirmSignInAction("sam@example.com", "12345678")).toEqual({
      result: "no_user",
    })
    expect(errorLog).toHaveBeenCalledTimes(1)
    expect(String(errorLog.mock.calls[0]?.[0])).toMatch(/orphan cookie is still live/)
  })

  it("still answers honestly when signing that session out throws instead", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })
    signOut.mockRejectedValue(new Error("network down"))

    expect(await confirmSignInAction("sam@example.com", "12345678")).toEqual({
      result: "no_user",
    })
    expect(errorLog).toHaveBeenCalledTimes(1)
  })

  it("says nothing when the sign-out worked, so a log line means something", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })

    await confirmSignInAction("sam@example.com", "12345678")
    expect(errorLog).not.toHaveBeenCalled()
  })
})
