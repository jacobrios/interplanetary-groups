// src/app/__tests__/layout-installable.test.ts
//
// The two exports that turn the safe-area insets Tasks 2-3 built into
// something iOS actually applies: `viewport` (which is what puts
// `viewport-fit=cover` on the page at all) and `metadata.appleWebApp` (which
// is what makes the home-screen launch full-screen with a solid black status
// bar (28 Sept 2026: was translucent, see layout.tsx) rather than opening the address bar and toolbar of a bookmarked tab).
// Asserting the exported objects directly, not a render: layout.tsx is a
// server component whose default export emits <html>/<body> and pulls in
// next/font/google, neither of which this suite needs to touch to pin these
// two field sets.
import { describe, it, expect, vi } from "vitest"

// next/font/google calls out to Google Fonts and expects to run inside
// Next's build pipeline, neither of which this test needs: it only reads the
// two plain exported objects below, never renders the component tree that
// actually uses the font. Mocked to a no-op returning a stable `variable`
// shape, the same one the real call would produce.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}))

const { viewport, metadata } = await import("../layout")

describe("layout: viewport", () => {
  it("lets content paint into the safe areas on a notched iPhone", () => {
    expect(viewport.viewportFit).toBe("cover")
  })

  it("colours the browser chrome and status bar to match the dark tile", () => {
    expect(viewport.themeColor).toBe("#15161e")
  })

  it("declares the page as dark so form controls and scrollbars render dark", () => {
    expect(viewport.colorScheme).toBe("dark")
  })
})

describe("layout: metadata.appleWebApp", () => {
  it("opts into standalone (full-screen, no Safari chrome) launch on iOS", () => {
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      title: "Orbit",
      statusBarStyle: "black",
    })
  })
})
