// src/app/actions/__tests__/join-signin.test.ts
//
// The two writes behind "I've been here before" on the invite screen. Every
// service is mocked: no Supabase, no database, no network. What is being
// tested is the decision layer, which is the only thing in this file that is
// ours: what each normalized seam result means, whether the orphan session
// gets signed back out, and what reaches joinGroupByInvite.
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

const findUnique = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))

const joinGroupByInvite = vi.fn()

vi.mock("@/lib/groups/join", () => ({
  joinGroupByInvite: (...a: unknown[]) => joinGroupByInvite(...a),
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

import { requestJoinSignInCodeAction, confirmJoinSignInAction } from "../join-signin"

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
  findUnique.mockResolvedValue({ supabaseAuthId: "supabase-uid-1" })
  joinGroupByInvite.mockResolvedValue({ group: { id: "group-1" }, user: { id: "user-1" } })
  signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  errorLog.mockRestore()
})

describe("requestJoinSignInCodeAction", () => {
  it("hands the seam's normalized result straight back", async () => {
    requestSignInCode.mockResolvedValue({ result: "ok" })

    expect(await requestJoinSignInCodeAction("sam@example.com")).toEqual({ result: "ok" })
    expect(requestSignInCode).toHaveBeenCalledWith("sam@example.com")
  })

  it("passes an unknown address through as unknown_email rather than softening it", async () => {
    requestSignInCode.mockResolvedValue({ result: "unknown_email" })

    expect(await requestJoinSignInCodeAction("nobody@example.com")).toEqual({
      result: "unknown_email",
    })
  })

  // The whole point of this endpoint: the person calling it has no session and
  // cannot get one without it. Nothing in this test provides a session, so a
  // getCurrentUser-style guard added later would redden it here rather than in
  // production, where the symptom is sign-in refusing everyone.
  it("works with nobody signed in, which is the only state it is ever called from", async () => {
    requestSignInCode.mockResolvedValue({ result: "ok" })

    expect(await requestJoinSignInCodeAction("sam@example.com")).toEqual({ result: "ok" })
  })
})

describe("confirmJoinSignInAction, the branches that do not sign anyone in", () => {
  it("returns bad_code without touching the session or the group", async () => {
    confirmSignInCode.mockResolvedValue({ result: "bad_code" })

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "bad_code",
    })
    expect(signOut).not.toHaveBeenCalled()
    expect(joinGroupByInvite).not.toHaveBeenCalled()
  })

  it("returns service_error without touching the session or the group", async () => {
    confirmSignInCode.mockResolvedValue({ result: "service_error" })

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "service_error",
    })
    expect(signOut).not.toHaveBeenCalled()
    expect(joinGroupByInvite).not.toHaveBeenCalled()
  })

  // The deliberate caller decision task 4 flagged and refused to make for us.
  // verifyOtp has already written a live session cookie for an identity no
  // User row points at; leaving it would put the app in the one state its own
  // code cannot describe, signed out by every read and signed in by the cookie.
  it("signs the orphan session back out when the identity resolves to nobody", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "no_user",
    })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(joinGroupByInvite).not.toHaveBeenCalled()
  })

  it("still reports no_user when signing the orphan session out throws", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })
    signOut.mockRejectedValue(new Error("network"))

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "no_user",
    })
    expect(errorLog.mock.calls[0]?.[0]).toContain("the orphan cookie is still live")
  })

  // signOut REPORTS a service failure rather than throwing it, so a try/catch
  // alone would let this fail in silence. Silence here is the worst kind on
  // this branch: the cookie survives, the person is told to join as someone
  // new, and the next join welds a brand new member onto the identity we could
  // not account for, which is precisely what signing out exists to prevent.
  it("still reports no_user, and says so, when signing out reports an error rather than throwing", async () => {
    confirmSignInCode.mockResolvedValue({ result: "no_user" })
    signOut.mockResolvedValue({
      error: { name: "AuthApiError", status: 500, message: "service down" },
    })

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "no_user",
    })
    expect(errorLog.mock.calls[0]?.[0]).toContain("the orphan cookie is still live")
  })
})

describe("confirmJoinSignInAction, the branch the slice exists for", () => {
  it("joins this group as the identity the code proved and lands them in it", async () => {
    confirmSignInCode.mockResolvedValue({ result: "ok", userId: "user-1" })

    await expect(
      confirmJoinSignInAction("sam@example.com", "12345678", "tok")
    ).rejects.toThrow("NEXT_REDIRECT:/groups/group-1")

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { supabaseAuthId: true },
    })
    // The existing join path, unchanged and reused rather than reimplemented:
    // it re-resolves the token inside its own transaction, reuses the User by
    // supabaseAuthId instead of creating a second one, and skips duplicates,
    // which is what makes an already-member re-tap a harmless no-op.
    expect(joinGroupByInvite).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseAuthId: "supabase-uid-1", inviteToken: "tok" })
    )
    expect(signOut).not.toHaveBeenCalled()
  })

  // A returning person who never joined THIS group and one who is already in
  // it take the identical path; join.ts decides which happened, atomically.
  // What matters here is that we never send a name that could rename them.
  it("never submits a name, so signing in cannot rename anyone", async () => {
    confirmSignInCode.mockResolvedValue({ result: "ok", userId: "user-1" })

    await expect(
      confirmJoinSignInAction("sam@example.com", "12345678", "tok")
    ).rejects.toThrow("NEXT_REDIRECT:/groups/group-1")

    expect(joinGroupByInvite).toHaveBeenCalledWith(
      expect.objectContaining({ memberName: "" })
    )
  })

  it("returns join_failed and stays put when the join itself throws", async () => {
    confirmSignInCode.mockResolvedValue({ result: "ok", userId: "user-1" })
    joinGroupByInvite.mockRejectedValue(new Error("INVALID_INVITE"))

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "join_failed",
    })
  })

  it("reports a service_error, and logs, when the signed-in row carries no auth id", async () => {
    confirmSignInCode.mockResolvedValue({ result: "ok", userId: "user-1" })
    findUnique.mockResolvedValue({ supabaseAuthId: null })

    expect(await confirmJoinSignInAction("sam@example.com", "12345678", "tok")).toEqual({
      result: "service_error",
    })
    expect(joinGroupByInvite).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })
})
