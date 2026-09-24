// src/lib/auth/__tests__/availability.test.ts
//
// One case per outcome, built from @supabase/auth-js's own exported error
// classes rather than hand-rolled { name: "..." } object literals. A
// hand-rolled shape can pass here while the real one fails in production,
// which is the exact class of bug this module (and this whole slice) exists
// to stop: see the brief for src/lib/auth/availability.ts.
import { describe, it, expect } from "vitest"
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type User as SupabaseUser,
} from "@supabase/auth-js"
import { classifyAuthReply } from "../availability"

/** A minimal but real-shaped Supabase user, for the signed-in case. */
function fakeUser(): SupabaseUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as SupabaseUser
}

describe("classifyAuthReply", () => {
  it("reads a present user as signed-in", () => {
    const user = fakeUser()
    const outcome = classifyAuthReply({ data: { user }, error: null })
    expect(outcome).toEqual({ kind: "signed-in", user })
  })

  it("reads AuthRetryableFetchError as unavailable, carrying a class-and-message detail", () => {
    const error = new AuthRetryableFetchError("Service temporarily unavailable", 503)
    const outcome = classifyAuthReply({ data: { user: null }, error })
    expect(outcome.kind).toBe("unavailable")
    if (outcome.kind !== "unavailable") throw new Error("unreachable")
    expect(outcome.detail).toContain("AuthRetryableFetchError")
    expect(outcome.detail).toContain("Service temporarily unavailable")
  })

  it("reads AuthSessionMissingError (no session at all) as signed-out", () => {
    const error = new AuthSessionMissingError()
    const outcome = classifyAuthReply({ data: { user: null }, error })
    expect(outcome).toEqual({ kind: "signed-out" })
  })

  it("reads a rejected-credential AuthApiError (401) as signed-out", () => {
    const error = new AuthApiError("Invalid credentials", 401, "invalid_credentials")
    const outcome = classifyAuthReply({ data: { user: null }, error })
    expect(outcome).toEqual({ kind: "signed-out" })
  })

  it("reads a rejected-credential AuthApiError (403) as signed-out", () => {
    const error = new AuthApiError("Forbidden", 403, "forbidden")
    const outcome = classifyAuthReply({ data: { user: null }, error })
    expect(outcome).toEqual({ kind: "signed-out" })
  })

  it("reads a null error with a null user (today's plain logged-out case) as signed-out", () => {
    const outcome = classifyAuthReply({ data: { user: null }, error: null })
    expect(outcome).toEqual({ kind: "signed-out" })
  })

  it("prefers signed-in over an error when both are somehow present", () => {
    // supabase-js never sets both on the same reply, but rule 1 in the brief
    // reads `data.user` before looking at `error` at all, so a future change
    // to that guarantee still fails toward the safer outcome rather than
    // toward logging somebody out who has a valid user.
    const user = fakeUser()
    const error = new AuthRetryableFetchError("Service temporarily unavailable", 503)
    const outcome = classifyAuthReply({ data: { user }, error })
    expect(outcome).toEqual({ kind: "signed-in", user })
  })
})
