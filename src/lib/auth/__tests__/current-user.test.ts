// src/lib/auth/__tests__/current-user.test.ts
//
// Mocking @/lib/supabase/server here is legitimate and worth explaining
// rather than assuming: we are testing OUR branch on a getUser() reply shape
// the library documents (classifyAuthReply's three outcomes), not whether a
// query still matches a database. The library's real behaviour, that a
// no-session visitor never reaches the network and that a retryable failure
// never clears the session, is proven separately by task 4's hand-run
// script, not by a mock like this one.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/auth-js"

const getUser = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

const findUnique = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}))

import { getCurrentUser } from "../current-user"
import { AuthUnavailableError } from "../availability"

const supabaseUser = { id: "supabase-uid-1" }
const prismaUser = { id: "usr_1", supabaseAuthId: "supabase-uid-1" }

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errorLog.mockRestore()
})

describe("getCurrentUser", () => {
  it("returns the matching User row for a signed-in reply", async () => {
    getUser.mockResolvedValue({ data: { user: supabaseUser }, error: null })
    findUnique.mockResolvedValue(prismaUser)

    await expect(getCurrentUser()).resolves.toEqual(prismaUser)
    expect(findUnique).toHaveBeenCalledWith({
      where: { supabaseAuthId: "supabase-uid-1" },
    })
  })

  it("returns null for a plain signed-out reply (no session at all)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() })

    await expect(getCurrentUser()).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("returns null for a rejected-credential reply, same as today", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Invalid credentials", 401, "invalid_credentials"),
    })

    await expect(getCurrentUser()).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("throws AuthUnavailableError for a retryable fetch failure, and logs it with the [auth] prefix", async () => {
    const error = new AuthRetryableFetchError("Service temporarily unavailable", 503)
    getUser.mockResolvedValue({ data: { user: null }, error })

    await expect(getCurrentUser()).rejects.toThrow(AuthUnavailableError)
    expect(findUnique).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
    const logged = errorLog.mock.calls.flat().join(" ")
    expect(logged).toContain("[auth]")
    expect(logged).toContain("AuthRetryableFetchError")
  })
})
