// @vitest-environment jsdom
//
// The privacy notice and the terms page.
//
// WHAT IS DELIBERATELY NOT HERE: the wording. A test asserting a sentence on
// either page is a copy-lock rather than a behaviour check, and this copy is
// expected to be reworded once the owner has read it. Every assertion below
// is about a property that would still matter after a full rewrite.
//
// THE ONE EXCEPTION IS THE CONTACT ADDRESS, and it is an exception on
// purpose. The privacy notice promises deletion within seven days at one
// address. If that address is missing, misspelled, or quietly diverges from
// the link it sits in, the promise is unkeepable and the whole page becomes a
// lie rather than a document with a typo in it. So it is pinned as a literal
// here, not imported from the page, because a test that reads the constant
// out of the file it is checking would follow that constant anywhere it
// moved.
//
// next/link is mocked to a plain anchor, matching this repo's existing
// component tests. The two pages are plain synchronous server components with
// no session read and no database read, which is why they can be rendered
// here at all, and that property is itself asserted below.

import path from "node:path"
import { readFileSync } from "node:fs"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import PrivacyPage from "../privacy/page"
import TermsPage from "../terms/page"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const REPO = path.resolve(__dirname, "../../..")
const PRIVACY_FILE = "src/app/privacy/page.tsx"
const TERMS_FILE = "src/app/terms/page.tsx"

const CONTACT_ADDRESS = "privacy@interplanetarygroups.com"

function source(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8")
}

/**
 * A file's real code, with comments removed.
 *
 * The same device src/app/__tests__/no-email-address-on-screen.test.tsx uses
 * on its own scans, and for the same reason: these two pages carry long
 * headers explaining that they deliberately do not redirect and deliberately
 * do not read the database, and a scan over raw bytes flags that prose as
 * the very thing it is promising not to do. Without this, documenting the
 * property would break the test that holds it, which is the kind of test
 * nobody keeps.
 *
 * Only whole-line and block comments go. A trailing comment after real code
 * survives and still counts, which is the safe direction to be wrong in.
 */
function codeOf(relative: string): string {
  return source(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n")
}

describe("both routes resolve", () => {
  // HOW MUCH OF "RESOLVES" THIS FILE CAN HONESTLY HOLD, stated rather than
  // implied. Next builds a route out of a file's location, and the two
  // imports at the top of this file name those exact locations
  // (../privacy/page, ../terms/page), so a page moved out of its route
  // directory takes this whole file down with it. What that leaves is the
  // other half: that each module's default export is a component which
  // actually renders rather than throwing. That is what the two assertions
  // below are.
  //
  // The route table itself is proven by `next build`, which lists /privacy
  // and /terms among the routes it emitted. That output is in the task
  // report; there is no way to reach the router's own table from a unit
  // test here, and a test that pretended to would be worse than the build
  // log.
  it("renders the privacy notice, with a heading naming it", () => {
    render(<PrivacyPage />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Privacy")
  })

  it("renders the terms, with a heading naming them", () => {
    render(<TermsPage />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Terms")
  })
})

describe("anyone can reach them, signed in or not", () => {
  // The front door redirects a visitor who already has a group. These two
  // pages must never grow anything of that shape: the person most likely to
  // need them is a stranger deciding whether to hand anything over, and a
  // member who taps them from inside a group must not be bounced back into
  // it. Asserted against the source rather than by rendering, because a
  // redirect throws to unwind the render and there is no session here to
  // trigger one with.
  for (const file of [PRIVACY_FILE, TERMS_FILE]) {
    it(`${file} reads no session, no database, and redirects nobody`, () => {
      const real = codeOf(file)
      expect(real).not.toMatch(/\bredirect\b/)
      expect(real).not.toMatch(/getCurrentUser/)
      expect(real).not.toMatch(/\bprisma\b/)
      expect(real).not.toMatch(/notFound/)
    })
  }
})

describe("the deletion promise can actually be acted on", () => {
  it("prints the contact address where a reader can see it", () => {
    // Pinned as a literal, and the only piece of copy on either page that
    // is. Everything else here is expected to be reworded; this cannot
    // change without somebody also changing the mailbox it names.
    render(<PrivacyPage />)
    expect(screen.getByText(CONTACT_ADDRESS)).toBeDefined()
  })

  it("makes it a mailto link pointing at the same address it prints", () => {
    // The failure this catches is the quiet one: a link and its own text
    // drifting apart, so the page shows a working address and sends mail to
    // a dead one, or the reverse. Nobody notices until a deletion request
    // vanishes.
    render(<PrivacyPage />)
    const link = screen.getByRole("link", { name: CONTACT_ADDRESS })
    expect(link.getAttribute("href")).toBe(`mailto:${CONTACT_ADDRESS}`)
  })

  it("names no other address anywhere on the page", () => {
    // One address, so there is no second one to pick wrongly. This also
    // catches an example address being pasted in as illustration, which on
    // this page of all pages would look like a real destination.
    const { container } = render(<PrivacyPage />)
    const found = container.innerHTML.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    expect(Array.from(new Set(found))).toEqual([CONTACT_ADDRESS])
  })
})

describe("both pages have a way out", () => {
  // The no-dead-ends rule the navigation slice established app-wide. These
  // are the product's longest screens and a stranger may well arrive on one
  // from a texted link with no history behind them.
  for (const [name, Page] of [
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
  ] as const) {
    it(`the ${name} page links back into the product`, () => {
      const { container } = render(<Page />)
      const home = Array.from(container.querySelectorAll("a")).filter(
        (a) => a.getAttribute("href") === "/"
      )
      expect(home.length).toBeGreaterThan(0)
    })
  }
})

describe("the terms page's Your information section links out", () => {
  // Behaviour, not wording. The "Your information" section is the signpost a
  // reader scanning headings lands on, and until 8 Sept 2026 it named the
  // privacy notice while carrying no link, pointing at an in-context link one
  // section up that Jacob could not find when he read the page. This test is
  // what stops a future copy pass restoring that.
  it("gives the terms page's Your information section its own link to the privacy notice", () => {
    render(<TermsPage />)

    const heading = screen.getByRole("heading", { name: /your information/i })
    const section = heading.closest("section")
    expect(section).not.toBeNull()

    const link = section!.querySelector('a[href="/privacy"]')
    expect(link).not.toBeNull()
  })
})

describe("neither page carries teal", () => {
  // CLAUDE.md's colour rule: teal marks an action that genuinely matters,
  // and reading a policy is not one. --action is the teal token.
  for (const [name, Page] of [
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
  ] as const) {
    it(`the ${name} page names no action token`, () => {
      const { container } = render(<Page />)
      expect(container.innerHTML).not.toContain("--action")
    })
  }
})
