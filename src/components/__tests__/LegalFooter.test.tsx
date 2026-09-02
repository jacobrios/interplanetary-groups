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
    // Matched by prefix rather than exactly: these two links carry a
    // visually hidden "(opens in a new tab)" as part of their accessible
    // name (see the new-tab tests below), which an exact match would break
    // for a reason that has nothing to do with the routes this asserts.
    render(<LegalConsentLine action="joining" />)
    expect(screen.getByRole("link", { name: /^Terms/ }).getAttribute("href")).toBe("/terms")
    expect(screen.getByRole("link", { name: /^Privacy notice/ }).getAttribute("href")).toBe(
      "/privacy"
    )
  })

  it("carries no teal either: consent is a statement, not a second decision", () => {
    const { container } = render(<LegalConsentLine action="joining" />)
    expect(container.innerHTML).not.toContain("--action")
  })

  // THE BUG THIS PAIR EXISTS FOR (owner QA, 2 September 2026). He tapped
  // Terms from create step 1, then the back control, and landed on his
  // groups list rather than back in the wizard. Had he already typed a
  // description, it would have been gone. Reading the terms before agreeing
  // to them must not cost somebody their work.
  //
  // router.back() is NOT the fix and must not be added: back links in this
  // product are fixed parent links, never browser history (CLAUDE.md,
  // navigation), because somebody arriving from a shared link has no history
  // to go back to. Opening the consent links in a new tab is the ordinary
  // convention for consent links and it leaves the original tab alive with
  // its typed text intact.
  it("opens both consent links in a new tab, so the half-filled form behind them survives", () => {
    render(<LegalConsentLine action="starting a group" />)
    for (const name of [/^Terms/, /^Privacy notice/]) {
      expect(screen.getByRole("link", { name }).getAttribute("target")).toBe("_blank")
    }
  })

  it("carries rel=noopener noreferrer on both, since target=_blank without it hands the new tab a handle on this one", () => {
    render(<LegalConsentLine action="joining" />)
    for (const name of [/^Terms/, /^Privacy notice/]) {
      const rel = screen.getByRole("link", { name }).getAttribute("rel") ?? ""
      expect(rel).toContain("noopener")
      expect(rel).toContain("noreferrer")
    }
  })

  it("says out loud that it opens a new tab, so a screen reader user is not surprised by one", () => {
    // A sighted person gets the new tab as feedback. Somebody on a screen
    // reader gets nothing unless the link's accessible name says so, which
    // is why this is asserted on the computed name rather than on a title
    // attribute or an icon.
    render(<LegalConsentLine action="joining" />)
    expect(screen.getByRole("link", { name: /Terms.*opens in a new tab/i })).toBeDefined()
    expect(screen.getByRole("link", { name: /Privacy notice.*opens in a new tab/i })).toBeDefined()
  })
})

describe("the footer and the consent line differ on purpose", () => {
  // The footer links stay in-tab. Nothing is lost by leaving the front door
  // or the group info page, and a footer that spawned tabs would be the
  // annoying version of the same convention.
  it("leaves the quiet footer's links in the tab they were tapped from", () => {
    render(<LegalFooter />)
    for (const name of ["Privacy", "Terms"]) {
      expect(screen.getByRole("link", { name }).getAttribute("target")).toBeNull()
    }
  })
})
