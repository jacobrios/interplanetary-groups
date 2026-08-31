// src/app/__tests__/token-contrast.test.ts
//
// WHY THIS FILE EXISTS. The owner reported the same grey as hard to read twice
// in two days, on two different screens, without knowing both were the one
// token. Nothing in the repo could have told him: a colour is the one kind of
// value where the failure is invisible to every other test in the suite and
// shows up only on a real phone in real light. So the arithmetic that decides
// whether --text-faint is legible lives here, computed from globals.css itself
// rather than from numbers copied into a comment.
//
// SCOPE. This file covers --text-faint only, the token the owner actually
// reported. It is not a general contrast guard for every colour token in the
// system. --placeholder is the known gap: it renders at 4.4992:1 on
// --surface-raised (pill-controls.ts's inputStyle, reached from the two
// sign-in screens and JoinForm), a hair under the 4.5:1 AA floor. That is
// already registered as knowingly shipped debt (docs/build-notes.md, "Two
// grey tokens are now one colour"), not fixed or covered here.
//
// WHAT IT CAN AND CANNOT DO. It computes WCAG contrast ratios from the token
// values, which is real arithmetic on the real source. It cannot see a screen,
// so it cannot know that a token is used somewhere it should not be; the
// inventory test at the bottom is the crude stand-in for that, and it exists so
// that adding a use of --text-faint on a lighter surface than any listed here
// makes somebody stop and check rather than ship it.

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { execFileSync } from "child_process"
import path from "path"

const GLOBALS = path.join(process.cwd(), "src/app/globals.css")
const css = readFileSync(GLOBALS, "utf8")

/** Reads one hex token out of globals.css, which is the single source. */
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`--${name} is not a hex token in globals.css`)
  return m[1]
}

/** WCAG 2.x relative luminance, sRGB. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Sanity: the formula has to reproduce a ratio computed by hand outside this
// file, or every assertion below is measuring the formula's own bug. Pure
// black on pure white is 21:1 by definition.
describe("the contrast formula itself", () => {
  it("returns the defined 21:1 for black on white", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5)
  })
})

// AA for text under 18.66px bold / 24px regular. Every use of --text-faint is
// small text: 13px eyebrows and a 15px status line.
const AA_SMALL_TEXT = 4.5

/**
 * The surfaces --text-faint is actually rendered against, established by
 * reading the code rather than by assuming all four exist here.
 *
 * The direction is easy to get backwards: light text on a dark ground gets
 * WORSE as the ground gets LIGHTER, so --surface-base is the best case and
 * --surface-raised is the bar to clear. --surface-self (#363c4b) is NOT in this
 * list because nothing renders --text-faint on it; if something ever does, the
 * inventory test below is what should stop it.
 */
const FAINT_SURFACES = [
  // src/app/page.tsx, both sign-in screens' resend line, the inline attach row,
  // Save's disabled label, and the members-only wall's secondary
  // "Start your own group" link (src/components/OrbitNoteScreen.tsx).
  "surface-base",
  // The email-ask sheet's own ground: its step eyebrow and its resend line.
  "surface-low",
  // src/app/events/[id]/ProposalSection.tsx's TIME CHANGE eyebrow, and
  // src/components/SendCircleButton.tsx's resting arrow.
  "surface-raised",
] as const

describe("--text-faint clears WCAG AA on every surface it renders against", () => {
  it.each(FAINT_SURFACES)("clears 4.5:1 on --%s", (surface) => {
    expect(contrast(token("text-faint"), token(surface))).toBeGreaterThanOrEqual(
      AA_SMALL_TEXT
    )
  })
})

describe("the three text tokens still read as three registers", () => {
  // The reason the lift above is the SMALLEST one that clears the bar. Lifting
  // the quiet register until it passes is right; lifting it until it is the
  // loud one has thrown away the hierarchy to fix the legibility.
  it("keeps faint dimmer than secondary, and secondary dimmer than primary", () => {
    const faint = luminance(token("text-faint"))
    const secondary = luminance(token("text-secondary"))
    const primary = luminance(token("text-primary"))

    expect(faint).toBeLessThan(secondary)
    expect(secondary).toBeLessThan(primary)
  })

  it("keeps a real step between faint and secondary, not a hair", () => {
    // Measured against --surface-base, the ground both are most often read on.
    // A 1.25x step is a visible one; below that the two tokens have collapsed
    // into one and the quiet register has stopped existing.
    const faint = contrast(token("text-faint"), token("surface-base"))
    const secondary = contrast(token("text-secondary"), token("surface-base"))

    expect(secondary / faint).toBeGreaterThanOrEqual(1.25)
  })
})

describe("the inventory this arithmetic was computed against", () => {
  // A contrast ratio is only as true as the list of surfaces it was computed
  // over, and that list came from reading the code on 28 Aug 2026. This pins
  // the files so a new use of the token forces somebody to ask which surface it
  // lands on, instead of the ratios above quietly becoming a claim about a
  // codebase that has moved on.
  const EXPECTED_FILES = [
    "src/app/events/[id]/ProposalSection.tsx",
    "src/app/groups/[id]/EmailAttachFlow.tsx",
    "src/app/join/[inviteToken]/JoinSignIn.tsx",
    "src/app/page.tsx",
    "src/app/signin/SignInPanel.tsx",
    "src/components/OrbitNoteScreen.tsx",
    "src/components/SendCircleButton.tsx",
  ]

  it("is still exactly the files the surface list above was read from", () => {
    // -l for filenames only; a file is listed once however often it uses it.
    // grep exits 1 on no matches, which would throw here, and a zero-match run
    // is itself a failure worth throwing on.
    const out = execFileSync(
      "grep",
      ["-rl", "var(--text-faint)", "src", "--include=*.tsx", "--include=*.ts"],
      { cwd: process.cwd(), encoding: "utf8" }
    )

    const files = out
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("__tests__"))
      .sort()

    expect(files).toEqual(EXPECTED_FILES)
  })
})
