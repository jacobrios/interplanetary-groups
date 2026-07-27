// @vitest-environment jsdom
//
// next/link is mocked to a plain anchor on purpose. What is under test is
// BackLink's own contract (it renders the label it is given, points where it
// is told, and carries a decorative chevron), not Next's Link component,
// which has its own tests and needs an App Router context this test has no
// business constructing.

import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import BackLink from "@/components/BackLink"

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

// Testing Library only auto-cleans between tests when Vitest globals are on,
// and this project's config does not enable them. Without this, the second
// render would leave two "Climbing Crew" links in the document and
// getByRole would throw on finding multiple matches.
afterEach(cleanup)

describe("BackLink", () => {
  it("renders the label it is given as the link text", () => {
    render(<BackLink href="/groups/abc" label="Climbing Crew" />)
    expect(screen.getByRole("link", { name: "Climbing Crew" })).toBeDefined()
  })

  it("points at the destination it is given", () => {
    render(<BackLink href="/groups/abc" label="Climbing Crew" />)
    const link = screen.getByRole("link", { name: "Climbing Crew" })
    expect(link.getAttribute("href")).toBe("/groups/abc")
  })

  it("hides the chevron from assistive technology so the label is the whole name", () => {
    const { container } = render(
      <BackLink href="/groups/abc" label="Climbing Crew" />
    )
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
  })

  it("points its chevron left, not right", () => {
    const { container } = render(
      <BackLink href="/groups/abc" label="Climbing Crew" />
    )
    // The left path starts at x=9 and moves back to x=5; the right path is
    // the mirror. Asserting the path data is what makes a mirrored-icon
    // regression fail here instead of in someone's eyes.
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M9 11l-4-4 4-4")
  })
})
