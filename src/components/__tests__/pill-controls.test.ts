// src/components/__tests__/pill-controls.test.ts
//
// The code field's treatment, and the one thing a per-screen test cannot see:
// whether there is still ONE of it. Three screens draw the same eight-digit
// field, EmailAttachFlow (the group home sheet and the group info row) plus the
// two sign-in panels, and the bug this closed was that only the first wore the
// treatment. Three passing per-screen tests would go on passing if somebody
// pasted the four properties into each of them, which is the shape the bug
// would come back in.

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { inputStyle, codeFieldTextStyle, codeInputStyle } from "../pill-controls"

describe("the code field's drawn treatment", () => {
  // Round 10's handoff, docs/design/design_handoff_round10/README.md, "Fields":
  // one input, eight digits, mono, --type-title, 0.26em tracking, tabular
  // figures, min-height 60px.
  it("carries all four text properties the handoff draws, and nothing else", () => {
    expect(codeFieldTextStyle).toEqual({
      fontFamily: "var(--font-mono)",
      fontSize: "var(--type-title)",
      letterSpacing: "0.26em",
      fontVariantNumeric: "tabular-nums",
    })
  })

  it("keeps the pill's own shape and adds the handoff's taller floor", () => {
    // The sign-in screens' input IS the box, so the pill field wears the
    // treatment directly. The fill, border and radius must survive the spread;
    // a code field that stopped looking like this product's field would trade
    // one inconsistency for another.
    expect(codeInputStyle.backgroundColor).toBe(inputStyle.backgroundColor)
    expect(codeInputStyle.border).toBe(inputStyle.border)
    expect(codeInputStyle.borderRadius).toBe(inputStyle.borderRadius)
    expect(codeInputStyle.boxSizing).toBe("border-box")
    expect(codeInputStyle.minHeight).toBe(60)
    expect(codeInputStyle.fontFamily).toBe("var(--font-mono)")
    expect(codeInputStyle.fontSize).toBe("var(--type-title)")
  })

  it("puts no length rule on the field, because paste has to work", () => {
    // The handoff is explicit: one input, never eight segmented boxes, and no
    // maxLength. Both screen test files also assert maxLength on the rendered
    // input; this asserts the shared style object never grows one, which is
    // where it would arrive for all three at once.
    expect("maxLength" in codeInputStyle).toBe(false)
    expect("maxLength" in codeFieldTextStyle).toBe(false)
  })

  it("asks for a size that cannot make iOS zoom the page on focus", () => {
    // --type-title resolved from globals.css, the single source, because a
    // token name can be spelled right and still resolve to 12px.
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8")
    const m = css.match(/--type-title:\s*([\d.]+)rem/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1]) * 16).toBeGreaterThanOrEqual(16)
  })
})

describe("there is exactly one copy of that treatment", () => {
  // The tracking value is the fingerprint: it is unusual enough that nothing
  // else in the codebase would carry it by coincidence, and a screen that
  // re-declares it has forked the treatment whatever its own test says.
  const SCREENS = [
    "src/app/groups/[id]/EmailAttachFlow.tsx",
    "src/app/signin/SignInPanel.tsx",
    "src/app/join/[inviteToken]/JoinSignIn.tsx",
  ]

  it.each(SCREENS)("%s spreads the shared style instead of retyping it", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8")

    expect(source).not.toMatch(/0\.26em/)
    expect(source).not.toMatch(/tabular-nums/)
    expect(source).toMatch(/from "@\/components\/pill-controls"/)
  })
})
