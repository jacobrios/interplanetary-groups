// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import MembersOnlyWall from "../MembersOnlyWall"

// Testing Library only auto-cleans between tests when Vitest globals are on,
// and this project's config does not enable them (see BackLink.test.tsx).
// Without this, a second render leaves duplicate "Sign in" / "Start your own
// group" links in the document and getByRole throws on finding multiple
// matches.
afterEach(cleanup)

describe("MembersOnlyWall", () => {
  it("explains the invite link, names no group, and offers a way onward", () => {
    render(<MembersOnlyWall />)
    expect(screen.getByText("A note from Orbit")).toBeTruthy()
    expect(
      screen.getByText(
        "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in. Been here before? You can sign in with your email."
      )
    ).toBeTruthy()

    // The outer "Invite only" eyebrow was deleted 21 Aug: it restated this
    // note's own opening clause ("This group is invite-only...").
    expect(screen.queryByText("Invite only")).toBeNull()
  })

  // The actual defect this task fixes: a member who lost their session used
  // to be offered only "Start your own group", which invites them to
  // duplicate themselves into a second group instead of coming back as
  // themselves. This test would have failed against the old component,
  // which had no /signin link at all.
  it("points the sign-in door at /signin", () => {
    render(<MembersOnlyWall />)
    const link = screen.getByRole("link", { name: "Sign in" })
    expect(link.getAttribute("href")).toBe("/signin")
  })

  // "Start your own group" is still offered, deliberately, for a genuine
  // stranger who never belonged to this group (see MembersOnlyWall.tsx for
  // the reasoning). It must no longer be the only or the primary door,
  // which the sign-in test above already covers; this just confirms it
  // still exists as a secondary option rather than having been deleted.
  it("still offers starting a new group, as a secondary option", () => {
    render(<MembersOnlyWall />)
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")
  })

  it("still reveals nothing about the group: no name, no member count", () => {
    render(<MembersOnlyWall />)
    // Nothing in the rendered note or links is group-specific; this is a
    // regression guard on the "reveals nothing" contract, not a claim that
    // this list of strings is exhaustive.
    expect(screen.queryByText(/members?/i)).toBeNull()
  })
})
