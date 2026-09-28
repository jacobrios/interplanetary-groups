// src/app/__tests__/status-bar-and-safe-bottom.test.ts
//
// The top-inset parts are inert under statusBarStyle "black" (inset reads 0,
// phone pass 4, 28 Sept 2026) and kept so a return to translucent has them.
// Task 5, fix round 1. Three things confirmed rendered got two corrections
// and one addition: the sticky-header finding was wrong about the group
// home (its PageHeader sits inside VisibleViewport, which never scrolls, so
// nothing there can slide under the status bar), PageHeader elsewhere now
// sticks below the inset instead of at the physical top, and two sticky
// bands plus the email-ask sheet's scroll pad now clear the home indicator
// under viewportFit: "cover".
//
// WHY SOURCE-LEVEL, AGAIN. In this repo's jsdom a LONGHAND padding property
// (paddingBottom) holding calc() with an unresolved var()/env() throws on a
// computed-style read; a SHORTHAND `padding` string containing such a calc()
// does not (ChatInput, StepGapAsk and YourGroupsScreen ship that inline and
// pass). The fix that dodges the throw is keeping the calc() out of any
// inline longhand, and in `globals.css` (which none of this project's
// isolated component tests load) instead. That is why the three
// safe-bottom pads below are read by class name and by a globals.css rule,
// never by rendering and reading a computed style.

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

const GLOBALS = path.join(process.cwd(), "src/app/globals.css")
const css = readFileSync(GLOBALS, "utf8")

const PAGE_HEADER = path.join(process.cwd(), "src/components/PageHeader.tsx")
const pageHeaderSrc = readFileSync(PAGE_HEADER, "utf8")

describe("globals.css: the status-bar backdrop", () => {
  it("defines --safe-top and --safe-bottom", () => {
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top\)/)
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom\)/)
  })

  it("paints a fixed strip the height of the top inset, on the page surface", () => {
    const m = css.match(/body::before\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    const rule = m![1]
    expect(rule).toMatch(/position:\s*fixed/)
    expect(rule).toMatch(/height:\s*var\(--safe-top\)/)
    expect(rule).toMatch(/background(-color)?:\s*var\(--surface-base\)/)
    expect(rule).toMatch(/pointer-events:\s*none/)
  })

  it("stacks above PageHeader's sticky z-index (10) and below EmailAskNote's scrim (40)", () => {
    const m = css.match(/body::before\s*\{([^}]*)\}/)
    const rule = m![1]
    const zMatch = rule.match(/z-index:\s*(\d+)/)
    expect(zMatch).not.toBeNull()
    const z = Number(zMatch![1])
    expect(z).toBeGreaterThan(10)
    expect(z).toBeLessThan(40)
  })
})

describe("globals.css: the two sticky-band safe-bottom pads", () => {
  it("gives EditDetailsCard's and EditGroupDetails's band a home-indicator-aware bottom pad, !important so it can beat the inline shorthand", () => {
    const m = css.match(/\.sticky-band-safe-bottom\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    const rule = m![1]
    expect(rule).toMatch(/padding-bottom:\s*calc\(13px\s*\+\s*var\(--safe-bottom\)\)\s*!important/)
  })
})

describe("globals.css: the email-ask sheet's scroll pad", () => {
  it("reads --bottom-inset with a --safe-bottom fallback, for consistency with the screen beneath (not to prevent a keyboard gap)", () => {
    const m = css.match(/\.email-ask-safe-bottom\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    const rule = m![1]
    expect(rule).toMatch(/padding-bottom:\s*calc\(20px\s*\+\s*var\(--bottom-inset,\s*var\(--safe-bottom\)\)\)\s*!important/)
  })
})

describe("PageHeader sticks below the top inset, not at the physical top", () => {
  it("reads top: var(--safe-top) rather than a bare 0", () => {
    expect(pageHeaderSrc).toMatch(/top:\s*"var\(--safe-top\)"/)
    expect(pageHeaderSrc).not.toMatch(/top:\s*0,/)
  })
})

describe("the two sticky bands and the email-ask pad carry their safe-bottom class", () => {
  const SITES: Array<[string, string]> = [
    ["src/app/create/EditDetailsCard.tsx", "sticky-band-safe-bottom"],
    ["src/app/groups/[id]/info/EditGroupDetails.tsx", "sticky-band-safe-bottom"],
    ["src/app/groups/[id]/EmailAskNote.tsx", "email-ask-safe-bottom"],
  ]

  it.each(SITES)("%s carries className %s", (file, className) => {
    const src = readFileSync(path.join(process.cwd(), file), "utf8")
    expect(src).toContain(`className="${className}"`)
  })
})

// Source-level assertion (jsdom loads no globals.css and has no insets):
// landscape puts nonzero insets on the left and right under viewportFit
// "cover", so the tokens exist and body pads by them.
describe("landscape side insets", () => {
  it("defines --safe-left and --safe-right from env() and pads body with them", () => {
    expect(css).toMatch(/--safe-left:\s*env\(safe-area-inset-left\)/)
    expect(css).toMatch(/--safe-right:\s*env\(safe-area-inset-right\)/)
    const body = css.match(/\nbody\s*\{[^}]*\}/)?.[0] ?? ""
    expect(body).toMatch(/padding-left:\s*var\(--safe-left\)/)
    expect(body).toMatch(/padding-right:\s*var\(--safe-right\)/)
  })

  it("pads the email-ask sheet's inner pad on the sides too", () => {
    expect(css).toMatch(/\.email-ask-safe-bottom\s*\{[^}]*padding-left:[^}]*var\(--safe-left\)/)
    expect(css).toMatch(/\.email-ask-safe-bottom\s*\{[^}]*padding-right:[^}]*var\(--safe-right\)/)
  })
})
