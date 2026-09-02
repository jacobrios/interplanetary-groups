// @vitest-environment jsdom
//
// next/link is mocked to a plain anchor, the same way BackLink.test.tsx does
// it and for the same reason: what is under test is this component's own
// contract, not Next's Link, which needs an App Router context this test has
// no business constructing.
//
// What this file pins is the pair of routes and the shapes they take, never
// the wording of the legal pages themselves. The consent sentence IS
// asserted here, because a consent line that fails to say what agreeing
// means is a broken control rather than a wording preference.

import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import LegalFooter, { LegalConsentLine } from "@/components/LegalFooter"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

describe("LegalFooter", () => {
  it("points at the privacy notice", () => {
    render(<LegalFooter />)
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy")
  })

  it("points at the terms", () => {
    render(<LegalFooter />)
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms")
  })

  it("offers exactly those two links and nothing else", () => {
    // The footer's whole job is being small. A third link here would be a
    // third thing competing with the screen's one real action, which is the
    // reason it is a shared component rather than markup on four pages.
    render(<LegalFooter />)
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/privacy",
      "/terms",
    ])
  })

  it("hides the separator dot from assistive technology, so the links read as two links", () => {
    const { container } = render(<LegalFooter />)
    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden?.textContent).toBe(" · ")
  })

  it("carries no teal: reading a policy is not an action that matters", () => {
    // CLAUDE.md's colour rule, held here rather than left to a browser pass.
    // --action is the teal token; nothing on this component may name it.
    const { container } = render(<LegalFooter />)
    expect(container.innerHTML).not.toContain("--action")
  })
})

describe("LegalConsentLine", () => {
  it("names the action the person is about to take", () => {
    render(<LegalConsentLine action="joining" />)
    expect(screen.getByText(/By joining you agree to the/)).toBeDefined()
  })

  it("takes the action from its caller, so the founder's screen says what the founder is doing", () => {
    render(<LegalConsentLine action="starting a group" />)
    expect(screen.getByText(/By starting a group you agree to the/)).toBeDefined()
  })

  it("puts both policy links inside the sentence", () => {
    render(<LegalConsentLine action="joining" />)
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms")
    expect(screen.getByRole("link", { name: "Privacy notice" }).getAttribute("href")).toBe(
      "/privacy"
    )
  })

  it("carries no teal either: consent is a statement, not a second decision", () => {
    const { container } = render(<LegalConsentLine action="joining" />)
    expect(container.innerHTML).not.toContain("--action")
  })
})
