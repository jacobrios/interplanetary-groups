// src/app/__tests__/status-bar-and-safe-bottom.test.ts
//
// Task 5, fix round 1. Three things confirmed rendered got two corrections
// and one addition: the sticky-header finding was wrong about the group
// home (its PageHeader sits inside VisibleViewport, which never scrolls, so
// nothing there can slide under the status bar), PageHeader elsewhere now
// sticks below the inset instead of at the physical top, and two sticky
// bands plus the email-ask sheet's scroll pad now clear the home indicator
// under viewportFit: "cover".
//
// WHY SOURCE-LEVEL, AGAIN. `calc()` wrapping an unresolved var()/env()
// reference throws jsdom's getComputedStyle regardless of which unresolved
// token is inside it (confirmed by hand against this repo's own jsdom
// package: calc(13px + var(--x)) throws identically to calc(13px +
// env(safe-area-inset-bottom)), so routing through a custom property does
// NOT dodge the limitation the way it looks like it should). The fix that
// actually dodges it is keeping every calc() out of any inline style
// jsdom might resolve, and out of `globals.css` (which none of this
// project's isolated component tests load) instead. That is why the three
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
  it("uses --bottom-inset, not --safe-bottom, because the sheet is a VisibleViewport descendant where the keyboard already collapses that inset to 0", () => {
    const m = css.match(/\.email-ask-safe-bottom\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    const rule = m![1]
    expect(rule).toMatch(/padding-bottom:\s*calc\(20px\s*\+\s*var\(--bottom-inset\)\)\s*!important/)
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
