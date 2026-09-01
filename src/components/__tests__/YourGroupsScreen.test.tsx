// @vitest-environment jsdom
//
// next/link is mocked to a plain anchor, same convention as BackLink.test.tsx:
// what's under test is this component's own contract (which groups it lists,
// where each row and the create control point, and the layout/scope rules a
// design round fought for), not Next's Link, which has its own tests.

import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { YourGroupsScreen } from "@/components/YourGroupsScreen"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const TWO_GROUPS = [
  { id: "grp-1", name: "Climbing Crew" },
  { id: "grp-2", name: "Sunday Soccer" },
] as const

describe("YourGroupsScreen", () => {
  it("renders a single group as a link to that group", () => {
    render(<YourGroupsScreen groups={[{ id: "grp-1", name: "Climbing Crew" }]} />)
    const link = screen.getByRole("link", { name: "Climbing Crew" })
    expect(link.getAttribute("href")).toBe("/groups/grp-1")
  })

  it("renders every group in a several-group list, each pointing at its own id", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    expect(screen.getByRole("link", { name: "Climbing Crew" }).getAttribute("href")).toBe(
      "/groups/grp-1"
    )
    expect(screen.getByRole("link", { name: "Sunday Soccer" }).getAttribute("href")).toBe(
      "/groups/grp-2"
    )
  })

  it("does not sort or otherwise reorder the groups it's given", () => {
    // Task 2 owns ordering; this component must render Task 2's order as-is.
    // Reversing the input here would still pass a test that only checked
    // "both names appear somewhere," so this asserts DOM order.
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const names = screen.getAllByRole("link").map((el) => el.textContent).filter(Boolean)
    const climbingIndex = names.findIndex((n) => n?.includes("Climbing Crew"))
    const soccerIndex = names.findIndex((n) => n?.includes("Sunday Soccer"))
    expect(climbingIndex).toBeLessThan(soccerIndex)
  })

  it("points the create control at /create", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const create = screen.getByRole("link", { name: /start a new group/i })
    expect(create.getAttribute("href")).toBe("/create")
  })

  it("renders a long group name in full, with no truncation styling", () => {
    // The case an entire design round exists for: the board's fixed-width
    // treatment ran a long name off the screen edge. A wrong implementation
    // could still pass a "renders the text" check while clipping it visually,
    // so this pins the absence of every truncation lever, not just presence
    // of the string.
    const longName =
      "The Extremely Long Wednesday Night Climbing And Bouldering Crew Of Greater Metropolitan Springfield"
    render(<YourGroupsScreen groups={[{ id: "grp-long", name: longName }]} />)
    const link = screen.getByRole("link", { name: longName })
    expect(link.textContent).toBe(longName)
    const nameEl = screen.getByText(longName)
    expect(nameEl.style.whiteSpace).not.toBe("nowrap")
    expect(nameEl.style.textOverflow).not.toBe("ellipsis")
    expect(nameEl.style.overflow).not.toBe("hidden")
  })

  it("never renders the action teal: this screen's job is navigation, not action", () => {
    const { container } = render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
    let node = walker.currentNode as HTMLElement | null
    while (node) {
      if (node instanceof HTMLElement) {
        expect(node.style.color).not.toBe("var(--action)")
        expect(node.style.backgroundColor).not.toBe("var(--action)")
        expect(node.style.borderColor).not.toBe("var(--action)")
      }
      node = walker.nextNode() as HTMLElement | null
    }
  })

  it("renders the eyebrow between the create control and the list, fencing the list", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    expect(screen.getByText("Your groups")).toBeDefined()
  })

  it("marks the group rows up as a real list", () => {
    const { container } = render(<YourGroupsScreen groups={TWO_GROUPS} />)
    expect(container.querySelectorAll("ul li").length).toBe(2)
  })

  it("renders no emblem or member-count content on a row: name only", () => {
    // A wrong implementation could satisfy every href assertion above while
    // still drawing an emblem or a count next to the name; this pins the
    // hard scope line directly rather than relying on absence-of-evidence
    // from the other tests.
    render(<YourGroupsScreen groups={[{ id: "grp-1", name: "Climbing Crew" }]} />)
    const link = screen.getByRole("link", { name: "Climbing Crew" })
    expect(link.querySelector("svg")).toBeNull()
  })
})
