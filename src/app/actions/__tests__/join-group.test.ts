// src/app/actions/__tests__/join-group.test.ts
//
// Task 2 of the duplicate-name-join-check slice: the action layer that maps
// join.ts's DuplicateNameError into a field-anchored error the client can
// render. Structured after join-signin.test.ts — every service is mocked, no
// Supabase, no database, no network, and RedirectSignal stands in for
// redirect() so code placed after it is caught rather than silently swallowed
// (redirect() throws NEXT_REDIRECT internally in production too).
//
// What is being tested is the decision layer only: which of the three shapes
// (required / duplicate / general) a given outcome maps to, and that
// redirect() is still reached on success.
import { describe, it, expect, vi, beforeEach } from "vitest"

const getUser = vi.fn()
const signInAnonymously = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, signInAnonymously } }),
}))

const joinGroupByInvite = vi.fn()

// DuplicateNameError is declared inside the mock factory, not imported from
// the real "@/lib/groups/join" (which pulls in "@/lib/prisma", and that
// module throws eagerly at import time when DATABASE_URL is unset — the same
// reason join-signin.test.ts fully mocks "@/lib/prisma" rather than letting
// join.ts's real import chain run). Because join-group.ts's own `import {
// DuplicateNameError } from "@/lib/groups/join"` resolves to this same
// mocked module, the `instanceof` check in the action sees the identical
// class reference this test throws — a real-module class here would be a
// *different* reference and every `instanceof` check would silently fail.
vi.mock("@/lib/groups/join", () => {
  class DuplicateNameError extends Error {
    public readonly existingName: string
    constructor(existingName: string) {
      super("DUPLICATE_NAME")
      this.name = "DuplicateNameError"
      this.existingName = existingName
    }
  }
  return {
    DuplicateNameError,
    joinGroupByInvite: (...a: unknown[]) => joinGroupByInvite(...a),
  }
})

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

import { joinGroupAction, type JoinGroupState } from "../join-group"
import { DuplicateNameError } from "@/lib/groups/join"

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const initialState: JoinGroupState = {}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a first-time visitor with no existing session. Tests that need
  // an existing session override getUser individually.
  getUser.mockResolvedValue({ data: { user: null } })
  signInAnonymously.mockResolvedValue({
    data: { user: { id: "auth-new-1" } },
    error: null,
  })
})

describe("joinGroupAction", () => {
  it("returns a required error for an empty name with no session", async () => {
    const state = await joinGroupAction(
      initialState,
      formDataFor({ inviteToken: "tok", memberName: "", hasSession: "" })
    )

    expect(state).toEqual({ errors: { memberName: { kind: "required" } } })
    // The required check short-circuits before any session or join work.
    expect(getUser).not.toHaveBeenCalled()
    expect(joinGroupByInvite).not.toHaveBeenCalled()
  })

  it("maps a DuplicateNameError from the lib to a duplicate field error carrying the stored name unchanged", async () => {
    joinGroupByInvite.mockRejectedValue(new DuplicateNameError("Mike"))

    const state = await joinGroupAction(
      initialState,
      formDataFor({ inviteToken: "tok", memberName: "mike", hasSession: "" })
    )

    expect(state).toEqual({
      errors: { memberName: { kind: "duplicate", existingName: "Mike" } },
    })
  })

  // What stops a database outage from telling somebody their name is taken,
  // and what stops a taken name from reading as "something went wrong":
  // anything that isn't a DuplicateNameError must land on `general` alone.
  it("maps any other throw to the generic general error, never a memberName error", async () => {
    joinGroupByInvite.mockRejectedValue(new Error("INVALID_INVITE"))

    const state = await joinGroupAction(
      initialState,
      formDataFor({ inviteToken: "bad-tok", memberName: "Sam", hasSession: "" })
    )

    expect(state).toEqual({
      errors: {
        general: "Something went wrong joining this group. Please try again.",
      },
    })
    expect(state.errors?.memberName).toBeUndefined()
  })

  it("redirects to the new group on a successful join", async () => {
    joinGroupByInvite.mockResolvedValue({
      group: { id: "group-1" },
      user: { id: "user-1" },
    })

    // Not .rejects.toThrow(string): that assertion is a substring match, so
    // it would still pass if the code redirected to "/groups/group-1-oops"
    // (which contains "/groups/group-1" as a prefix). Catching the signal and
    // checking its `to` field with exact equality is what a genuinely wrong
    // path would actually fail.
    const signal: unknown = await joinGroupAction(
      initialState,
      formDataFor({ inviteToken: "tok", memberName: "Jordan", hasSession: "" })
    ).catch((e) => e)

    expect(signal).toBeInstanceOf(RedirectSignal)
    expect((signal as RedirectSignal).to).toBe("/groups/group-1")
  })
})
