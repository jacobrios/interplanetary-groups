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

// Reversed on purpose: both alphabetically ("Sunday" < "Climbing" is false,
// so alpha order would put Climbing first — the given order does not) and by
// id ("grp-2" before "grp-1" — id order would also put Climbing first). Any
// plausible sort this component might apply on its own would put Climbing
// Crew first; asserting it renders SECOND is what actually fails if a sort
// creeps in. The original fixture (already alphabetical and already
// id-ordered) could not have caught that.
const REVERSE_ORDER_GROUPS = [
  { id: "grp-2", name: "Sunday Soccer" },
  { id: "grp-1", name: "Climbing Crew" },
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
    render(<YourGroupsScreen groups={REVERSE_ORDER_GROUPS} />)
    const names = screen.getAllByRole("link").map((el) => el.textContent).filter(Boolean)
    const soccerIndex = names.findIndex((n) => n?.includes("Sunday Soccer"))
    const climbingIndex = names.findIndex((n) => n?.includes("Climbing Crew"))
    expect(soccerIndex).toBeLessThan(climbingIndex)
  })

  it("points the create control at /create", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const create = screen.getByRole("link", { name: /start a new group/i })
    expect(create.getAttribute("href")).toBe("/create")
  })

  it("renders a long group name in full, with no truncation styling anywhere in its ancestor chain", () => {
    // The case an entire design round exists for: the board's fixed-width
    // treatment ran a long name off the screen edge. white-space is an
    // inherited CSS property, so nowrap set on an ANCESTOR (the row link,
    // the <li>, the <ul>) would clip the name just as surely as setting it
    // on the name span itself; checking only the span would miss that.
    const longName =
      "The Extremely Long Wednesday Night Climbing And Bouldering Crew Of Greater Metropolitan Springfield"
    render(<YourGroupsScreen groups={[{ id: "grp-long", name: longName }]} />)
    const link = screen.getByRole("link", { name: longName })
    expect(link.textContent).toBe(longName)

    let node: HTMLElement | null = screen.getByText(longName)
    while (node) {
      expect(node.style.whiteSpace).not.toBe("nowrap")
      expect(node.style.textOverflow).not.toBe("ellipsis")
      expect(node.style.overflow).not.toBe("hidden")
      expect(node.style.getPropertyValue("-webkit-line-clamp")).toBe("")
      node = node.parentElement
    }
  })

  it("never renders the action teal: this screen's job is navigation, not action", () => {
    const { container } = render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
    let node = walker.currentNode as HTMLElement | null
    while (node) {
      if (node instanceof HTMLElement) {
        // jsdom's style object does not expand shorthand properties into
        // their longhand equivalents (setting style.background never
        // populates style.backgroundColor), and this component writes
        // shorthands (background:, border:) throughout, so checking only
        // backgroundColor/borderColor would pass a teal fill or border
        // silently. The raw "style" attribute is the literal string React
        // rendered, whatever shorthand or longhand form produced it, so
        // it's the one check that can't be dodged by which form is used.
        const styleAttr = node.getAttribute("style") ?? ""
        expect(styleAttr).not.toContain("var(--action)")
      }
      node = walker.nextNode() as HTMLElement | null
    }
  })

  it("renders the eyebrow strictly between the create control and the first row, fencing the list", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const createLink = screen.getByRole("link", { name: /start a new group/i })
    const eyebrow = screen.getByText("Your groups")
    const firstRow = screen.getByRole("link", { name: "Climbing Crew" })

    // compareDocumentPosition, not just "all three exist": a component that
    // rendered the eyebrow above the create control (the exact regression
    // the load-bearing fencing rule exists to prevent) would still pass a
    // mere presence check but fails this one, since createLink would no
    // longer precede eyebrow in document order.
    expect(
      createLink.compareDocumentPosition(eyebrow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      eyebrow.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("marks the group rows up as a real list", () => {
    const { container } = render(<YourGroupsScreen groups={TWO_GROUPS} />)
    expect(container.querySelectorAll("ul li").length).toBe(2)
  })

  // ADDED 2 SEPTEMBER 2026, owner QA. The front door carries a legal footer
  // and he never saw it, because "/" sends anybody who already has a group
  // straight past it. This is the screen a signed-in person actually lands
  // on, so it is where the two links have to be reachable from.
  it("carries the legal footer, since this is the screen a signed-in person actually lands on", () => {
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy")
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms")
  })

  it("puts the legal footer last, below every group row, so it stays a footer", () => {
    // Order, not mere presence. A footer rendered above the list would be a
    // new section competing with the screen's own content, and this screen's
    // spareness is deliberate.
    render(<YourGroupsScreen groups={TWO_GROUPS} />)
    const lastRow = screen.getByRole("link", { name: "Sunday Soccer" })
    const privacy = screen.getByRole("link", { name: "Privacy" })
    expect(
      lastRow.compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("renders nothing on a row but the group's name: no emblem, count, or badge", () => {
    render(<YourGroupsScreen groups={[{ id: "grp-1", name: "Climbing Crew" }]} />)
    const link = screen.getByRole("link", { name: "Climbing Crew" })
    // The direct scope assertion: any extra text node (a count, a badge, a
    // next-event line) would change this from an exact match, where the
    // svg-only check below could still pass with text content added.
    expect(link.textContent).toBe("Climbing Crew")
    expect(link.querySelector("svg")).toBeNull()
  })
})
