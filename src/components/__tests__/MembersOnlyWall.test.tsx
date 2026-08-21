// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MembersOnlyWall from "../MembersOnlyWall"

describe("MembersOnlyWall", () => {
  it("explains the invite link, names no group, and offers a way onward", () => {
    render(<MembersOnlyWall />)
    expect(screen.getByText("A note from Orbit")).toBeTruthy()
    expect(
      screen.getByText(
        "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in."
      )
    ).toBeTruthy()
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")

    // The outer "Invite only" eyebrow was deleted 21 Aug: it restated this
    // note's own opening clause ("This group is invite-only...").
    expect(screen.queryByText("Invite only")).toBeNull()
  })
})
