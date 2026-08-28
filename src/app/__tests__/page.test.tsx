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
