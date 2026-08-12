// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GroupHomeHeader } from "@/app/groups/[id]/GroupHomeHeader"

afterEach(cleanup)

describe("GroupHomeHeader", () => {
  it("renders the group name and the members subline inside the info link", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" memberCount={8} />)
    expect(screen.getByText("Climbing Crew")).toBeDefined()
    expect(screen.getByText("8 members · group info & invite link")).toBeDefined()
    const link = screen.getByRole("link", { name: /Climbing Crew/ })
    expect(link.getAttribute("href")).toBe("/groups/g1/info")
  })

  it("uses the singular for a group of one", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Solo" memberCount={1} />)
    expect(screen.getByText("1 member · group info & invite link")).toBeDefined()
  })

  it("keeps the home button labeled Home", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" memberCount={8} />)
    const home = screen.getByLabelText("Home")
    expect(home.getAttribute("href")).toBe("/")
  })
})
