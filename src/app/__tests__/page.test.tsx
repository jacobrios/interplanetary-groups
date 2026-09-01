// @vitest-environment jsdom
//
// The front door's two quiet notes under the teal pill. Neither is a button,
// deliberately: the screen's one real action is starting a group, and both
// notes are for people who are not doing that.
//
// The second one is new with the email sign-in slice, and it is the door for
// somebody who no longer has an invite link to hand at all: a member who
// cleared their cookies, or moved from phone to laptop, and would otherwise be
// made into a second copy of themselves the next time they got in.
//
// Prisma and the session are mocked; this file never touches a database.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

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

const getCurrentUser = vi.fn()
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => getCurrentUser(),
}))

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import HomePage from "../page"

beforeEach(() => {
  vi.clearAllMocks()
  // The only visitor who ever sees this copy: no session, so no memberships.
  getCurrentUser.mockResolvedValue(null)
  findMany.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

describe("the front door's ways in for someone who is not starting a group", () => {
  it("still points a fresh invite at the link they were sent", async () => {
    render(await HomePage())
    expect(screen.getByText(/Already invited\?/)).toBeDefined()
  })

  it("offers a real route into signing in for somebody who has been here before", async () => {
    render(await HomePage())
    const link = screen.getByRole("link", { name: "Sign in with your email" })
    // The load-bearing half. A note that reads right and points nowhere is
    // exactly the promise this slice exists to stop making.
    expect(link.getAttribute("href")).toBe("/signin")
  })

  it("keeps starting a group as the screen's one real action", async () => {
    render(await HomePage())
    expect(screen.getByRole("link", { name: /Start your group/ })).toBeDefined()
    // Both notes are notes: no second button competing with the teal pill.
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})

// Task 6, second-group-entry-point slice: the front door's other two cases.
// A member of one group still lands directly inside it, unchanged. A member
// of several used to fall through to this marketing copy with no test
// catching it, because resolveFrontDoor's "groups" variant (Task 1) was
// never wired into this component until now; that was a live regression on
// this branch. Both cases redirect, so the assertion is on what
// next/navigation's redirect() was called with, not on rendered output.
describe("the front door's session-aware redirects", () => {
  it("sends a one-group visitor straight into that group, with no extra tap", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    findMany.mockResolvedValue([
      { groupId: "grp-solo", joinedAt: new Date("2026-06-01T00:00:00Z") },
    ])

    await expect(HomePage()).rejects.toMatchObject({ to: "/groups/grp-solo" })
  })

  it("sends a several-group visitor to the group list, not to a guessed group", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    findMany.mockResolvedValue([
      { groupId: "grp-alpha", joinedAt: new Date("2026-06-01T00:00:00Z") },
      { groupId: "grp-beta", joinedAt: new Date("2026-08-20T00:00:00Z") },
    ])

    // The destination is "/groups" exactly, never "/groups/grp-beta" (the
    // most-recently-joined guess this slice removed) or any other group id.
    await expect(HomePage()).rejects.toMatchObject({ to: "/groups" })
  })
})
