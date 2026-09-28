// src/app/__tests__/screen-min-height.test.ts
//
// WHY THIS FILE EXISTS. Task 4 turned on viewportFit: "cover" and a
// translucent status bar, so in the installed app every page now draws
// under the status bar. A page whose top-level wrapper is sized to a bare
// "100dvh" therefore scrolls by the status bar's height: the wrapper is one
// status-bar-height too tall for what body's own inset padding leaves
// available below it. `--screen-min-height` (globals.css) and body's own
// `padding-top: env(safe-area-inset-top)` are the fix; this file pins both
// halves so a future edit cannot drop one without a red test.
//
// WHAT THIS FILE CANNOT DO. jsdom cannot resolve a `calc()` that wraps
// `env()` (VisibleViewport.test.tsx's header names the same limit), and it
// has no real notion of a safe-area inset to render against in the first
// place. A rendered assertion of the actual pixel effect is therefore
// impractical here; every assertion below is a source-level read of
// globals.css and of the nine call sites, the same style
// token-contrast.test.ts already uses for globals.css. Source-level is
// weaker than a browser measurement, so the sticky-header question this
// slice's brief also raises is answered separately, by looking at a real
// rendered page, not by a test in this file.

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { execFileSync } from "child_process"
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
    // Route directories carry bracketed names ([id], [inviteToken]), which
    // zsh glob-expands; execFileSync calls grep directly with no shell, so
    // that trap (CLAUDE.md, "a shell-based scan can report clean for a
    // false reason") does not apply here, but the file list below is still
    // read by grep rather than by hand for the same reason token-contrast's
    // inventory test reads its list by grep.
    const out = execFileSync(
      "grep",
      ["-rl", "var(--screen-min-height)", "src", "--include=*.tsx"],
      { cwd: process.cwd(), encoding: "utf8" }
    )
    const files = out.split("\n").filter(Boolean).sort()
    expect(files).toEqual(EXPECTED_SITES)
  })

  it("no longer has any bare 100dvh minHeight left on a whole-page site", () => {
    // grep exits 1 (throwing here) when nothing matches, which is the
    // passing case for this assertion; wrap it so a real remaining match
    // (a nonzero exit for the wrong reason, or actual output) is what fails
    // the test, not the throw itself.
    let out = ""
    try {
      out = execFileSync(
        "grep",
        ["-rl", "minHeight: \"100dvh\"", "src", "--include=*.tsx"],
        { cwd: process.cwd(), encoding: "utf8" }
      )
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status !== 1) throw err
    }
    expect(out.split("\n").filter(Boolean)).toEqual([])
  })
})
