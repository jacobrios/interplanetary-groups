// @vitest-environment jsdom
//
// The your-groups route (Task 4). Same seam as src/app/__tests__/page.test.tsx:
// next/navigation's redirect, getCurrentUser, and prisma.membership.findMany
// are mocked so this file never touches a database; orderGroupsByRecentlyOpened
// and YourGroupsScreen are NOT mocked, so the real ordering logic and the real
// render both run, and the assertions below exercise them for real.
//
// What this file exists to protect: the counterintuitive rule this whole
// slice is about. "/" sends a one-group member straight into their group;
// "/groups" must not. A future refactor "helpfully" collapsing that
// distinction (redirect when there's only one) is exactly what the
// exactly-one-membership test below is written to catch.

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

import GroupsPage from "../page"

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe("the your-groups route", () => {
  it("redirects to the front door when there is no session at all", async () => {
    getCurrentUser.mockResolvedValue(null)

    await expect(GroupsPage()).rejects.toThrow("NEXT_REDIRECT:/")
    // No session means no viewer.id to query with; the page must not even
    // attempt the lookup.
    expect(findMany).not.toHaveBeenCalled()
  })

  it("redirects to the front door when the session holds zero memberships", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    findMany.mockResolvedValue([])

    await expect(GroupsPage()).rejects.toThrow("NEXT_REDIRECT:/")
  })

  it("does NOT redirect for exactly one membership: the list renders instead", async () => {
    // This is the rule the owner made central: "/" fast-paths a single group,
    // "/groups" never does. Only zero memberships redirects.
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    findMany.mockResolvedValue([
      {
        groupId: "grp-solo",
        joinedAt: new Date("2026-01-01T00:00:00Z"),
        lastSeenAt: null,
        group: { id: "grp-solo", name: "Solo Climbing Crew" },
      },
    ])

    render(await GroupsPage())

    expect(screen.getByRole("link", { name: "Solo Climbing Crew" })).toBeDefined()
  })

  it("renders every group for several memberships, in the ordering function's real order, not query order", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    // Deliberately out of the order the correct output demands, on two axes
    // at once so a broken pass-through (identity map, or a stray second
    // sort) is caught rather than accidentally matching:
    //   - query order here is Alpha, Beta, Gamma;
    //   - the correct recency order is Gamma (most recently opened) first,
    //     then Beta (opened, but longer ago), then Alpha (never opened, so
    //     it sorts last regardless of how long ago it was joined).
    findMany.mockResolvedValue([
      {
        groupId: "grp-alpha",
        joinedAt: new Date("2026-01-01T00:00:00Z"),
        lastSeenAt: null,
        group: { id: "grp-alpha", name: "Alpha Group" },
      },
      {
        groupId: "grp-beta",
        joinedAt: new Date("2026-01-02T00:00:00Z"),
        lastSeenAt: new Date("2026-01-10T00:00:00Z"),
        group: { id: "grp-beta", name: "Beta Group" },
      },
      {
        groupId: "grp-gamma",
        joinedAt: new Date("2026-01-03T00:00:00Z"),
        lastSeenAt: new Date("2026-08-01T00:00:00Z"),
        group: { id: "grp-gamma", name: "Gamma Group" },
      },
    ])

    render(await GroupsPage())

    // The chrome links are named and excluded rather than sliced off by
    // position, so a future one landing anywhere in the document does not
    // silently shift this assertion's window onto the wrong three rows.
    const CHROME = new Set(["Start a new group", "Privacy", "Terms"])
    const names = screen
      .getAllByRole("link")
      .map((el) => el.textContent)
      .filter((text): text is string => Boolean(text) && !CHROME.has(text))

    expect(names).toEqual(["Gamma Group", "Beta Group", "Alpha Group"])
  })

  // Added 2 September 2026, owner QA. The two policy links have to be
  // reachable from the screen a signed-in person actually lands on, and
  // "/" sends anybody who already has a group straight past its footer.
  // Asserted at the ROUTE, not only on the component, because that is the
  // claim being made: /groups carries a legal footer.
  it("carries the legal footer through to the route", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" })
    findMany.mockResolvedValue([
      {
        groupId: "grp-solo",
        joinedAt: new Date("2026-01-01T00:00:00Z"),
        lastSeenAt: null,
        group: { id: "grp-solo", name: "Solo Climbing Crew" },
      },
    ])

    render(await GroupsPage())

    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy")
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms")
  })
})
