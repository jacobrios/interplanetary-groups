// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GroupHomeHeader } from "@/app/groups/[id]/GroupHomeHeader"

afterEach(cleanup)

describe("GroupHomeHeader", () => {
  it("renders the group name inside the info link", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    expect(screen.getByText("Climbing Crew")).toBeDefined()
    const link = screen.getByRole("link", { name: /Climbing Crew/ })
    expect(link.getAttribute("href")).toBe("/groups/g1/info")
  })

  // The subline ("N members · group info & invite link") was deleted: it is
  // first-run information that showed forever, and the chevron beside the
  // name already says the title opens group info.
  it("carries no members subline under the name", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    expect(screen.queryByText(/member/)).toBeNull()
    expect(screen.queryByText(/invite link/)).toBeNull()
  })

  it("keeps the home button labeled Home", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    const home = screen.getByLabelText("Home")
    expect(home.getAttribute("href")).toBe("/")
  })

  it("lets a long name wrap instead of clipping (fix round 1)", () => {
    const longName = "A".repeat(120)
    render(<GroupHomeHeader groupId="g1" groupName={longName} />)
    const nameEl = screen.getByText(longName)
    expect(nameEl.style.whiteSpace).not.toBe("nowrap")
  })
})
