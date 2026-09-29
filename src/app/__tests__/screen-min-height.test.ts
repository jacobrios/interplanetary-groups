// src/app/__tests__/screen-min-height.test.ts
//
// WHY THIS FILE EXISTS. Written for viewportFit: "cover" with a translucent
// status bar. Under statusBarStyle "black" the top inset reads 0 in the
// installed app (phone pass 4, 28 Sept 2026), so this is inert today and
// kept so a return to translucent has it. With translucent, every page
// draws under the status bar. A page whose top-level wrapper is sized to a bare
// "100dvh" therefore scrolls by the status bar's height: the wrapper is one
// status-bar-height too tall for what body's own inset padding leaves
// available below it. `--screen-min-height` (globals.css) and body's own
// `padding-top: env(safe-area-inset-top)` are the fix; this file pins both
// halves so a future edit cannot drop one without a red test.
//
// WHAT THIS FILE CANNOT DO. jsdom throws on a longhand padding property
// holding an unresolved calc() (VisibleViewport.test.tsx's header names the
// same limit), and it
// has no real notion of a safe-area inset to render against in the first
// place. A rendered assertion of the actual pixel effect is therefore
// impractical here; every assertion below is a source-level read of
// globals.css and of the nine call sites, the same style
// token-contrast.test.ts already uses for globals.css. Source-level is
// weaker than a browser measurement, so the sticky-header question this
// slice's brief also raises is answered separately, by looking at a real
// rendered page, not by a test in this file.

import { filesContaining } from "./inventory-scan"
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

const GLOBALS = path.join(process.cwd(), "src/app/globals.css")
const css = readFileSync(GLOBALS, "utf8")

describe("globals.css defines the safe-area top inset", () => {
  it("declares --screen-min-height as 100dvh minus the top inset", () => {
    // Whitespace-tolerant: the token's exact formatting is not the contract,
    // being "100dvh minus env(safe-area-inset-top)" is.
    const m = css.match(
      /--screen-min-height:\s*calc\(\s*100dvh\s*-\s*env\(safe-area-inset-top\)\s*\)/
    )
    expect(m).not.toBeNull()
  })

  it("pads body's top with the same inset the token subtracts", () => {
    const bodyBlockMatch = css.match(/body\s*\{([^}]*)\}/)
    expect(bodyBlockMatch).not.toBeNull()
    const bodyBlock = bodyBlockMatch![1]
    expect(bodyBlock).toMatch(/padding-top:\s*env\(safe-area-inset-top\)/)
  })
})

// The nine whole-page sites named in the task brief. Pinned as an exact list,
// the same inventory style token-contrast.test.ts uses, so a tenth site
// added later without updating this list fails loudly rather than passing by
// accident.
const EXPECTED_SITES = [
  "src/app/create/page.tsx",
  "src/app/events/[id]/page.tsx",
  "src/app/groups/[id]/info/page.tsx",
  "src/app/join/[inviteToken]/JoinForm.tsx",
  "src/app/page.tsx",
  "src/app/signin/page.tsx",
  "src/components/DeadEndScreen.tsx",
  "src/components/LegalPage.tsx",
  "src/components/OrbitNoteScreen.tsx",
].sort()

describe("the nine whole-page sites read the safe-area-aware token", () => {
  it("is still exactly the nine sites named in the task brief", () => {
    // Read by a scan rather than by hand, like token-contrast's inventory.
    // The scan calls git with no shell, so the bracketed route directories
    // ([id], [inviteToken]) cannot be glob-expanded away (CLAUDE.md, "a
    // shell-based scan can report clean for a false reason").
    // Committed and uncommitted files, never git-excluded throwaways; see
    // inventory-scan.ts.
    expect(filesContaining("var(--screen-min-height)", ["*.tsx"])).toEqual(EXPECTED_SITES)
  })

  it("no longer has any bare 100dvh minHeight left on a whole-page site", () => {
    expect(filesContaining('minHeight: "100dvh"', ["*.tsx"])).toEqual([])
  })
})
