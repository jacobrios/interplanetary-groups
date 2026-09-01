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
  // name already says the title opens group info. The positive assertion is
  // deliberate: two negatives alone would pass on a component that rendered
  // nothing at all.
  it("carries no members subline under the name", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    expect(screen.getByText("Climbing Crew")).toBeDefined()
    expect(screen.queryByText(/member/)).toBeNull()
    expect(screen.queryByText(/invite link/)).toBeNull()
  })

  // What the subline was also doing, and what the chevron cannot do: naming
  // the destination for a screen reader. Chevron is aria-hidden, so without
  // this label the app's only route to group info reads as "Climbing Crew,
  // link".
  it("names the destination for assistive tech", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    const link = screen.getByRole("link", {
      name: "Climbing Crew, group info and invite link",
    })
    expect(link.getAttribute("href")).toBe("/groups/g1/info")
  })

  // Task 5, second-group-entry-point slice: the mark now always opens the
  // group list, whatever number of groups the viewer is in, repairing the
  // defect where it either bounced a multi-group member back where they
  // were or silently dropped them into a different group. "Home" stopped
  // being true the moment the destination stopped being "/", so the label
  // has to name where the tap actually goes.
  it("points the Orbit mark at the group list, labeled for where it goes", () => {
    render(<GroupHomeHeader groupId="g1" groupName="Climbing Crew" />)
    const mark = screen.getByLabelText("Your groups")
    expect(mark.getAttribute("href")).toBe("/groups")
    expect(screen.queryByLabelText("Home")).toBeNull()
  })

  it("lets a long name wrap instead of clipping (fix round 1)", () => {
    const longName = "A".repeat(120)
    render(<GroupHomeHeader groupId="g1" groupName={longName} />)
    const nameEl = screen.getByText(longName)
    expect(nameEl.style.whiteSpace).not.toBe("nowrap")
  })
})
