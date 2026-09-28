// @vitest-environment jsdom
//
// VisibleViewport has no server to talk to, so every case here is a fake
// window.visualViewport (a plain EventTarget carrying the fields the real
// one exposes) driven by dispatching its own resize/scroll events.
// requestAnimationFrame is stubbed to run its callback synchronously so a
// test does not need real animation frames or fake timers to see the
// scheduled measurement land within the test body.
//
// jsdom cannot resolve calc() wrapping env() in an inline style (see
// EditGroupDetails.tsx's sticky-band comment, and this file avoids the
// mistake for the same reason): assertions below read --bottom-inset's own
// value directly, never a calc() built from it.
//
// Most cases below now need an editable element focused before the
// component will report measured values at all (28 Sept 2026's focus
// gate, see the component's own header). `focusTextarea()` creates a real
// `<textarea>` in the document, focuses it (which jsdom dispatches as a
// genuine bubbling "focusin", exercised the same as a real browser), and
// hands it back so a test can blur or remove it later. One jsdom gap
// worth knowing before extending this file: unlike focus()/blur(), jsdom
// does NOT dispatch a "focusout" when a focused node is simply removed
// from the document (verified by hand against jsdom 30 before writing the
// removal test below) even though it does silently move
// document.activeElement to <body>. Real WebKit fires it (the bug this
// component fixes depends on that: iOS dismisses the keyboard exactly
// when the focused field leaves the DOM). So the removal test below blurs
// first, which is the one path jsdom and real browsers agree on, rather
// than asserting a "remove with no blur" case jsdom cannot honestly
// represent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import VisibleViewport from "../VisibleViewport"

function focusTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement("textarea")
  document.body.appendChild(textarea)
  act(() => {
    textarea.focus()
  })
  return textarea
}

afterEach(cleanup)

class FakeVisualViewport extends EventTarget {
  height: number
  width: number
  offsetTop: number

  constructor(height: number, width: number, offsetTop = 0) {
    super()
    this.height = height
    this.width = width
    this.offsetTop = offsetTop
  }
}

let originalVisualViewport: VisualViewport | null

function setVisualViewport(value: FakeVisualViewport | undefined) {
  Object.defineProperty(window, "visualViewport", {
    value,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  originalVisualViewport = window.visualViewport
  // Runs the callback immediately, so the component's own scheduled
  // measurement has landed by the time render() returns. See this file's
  // header.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    value: originalVisualViewport,
    configurable: true,
    writable: true,
  })
  vi.unstubAllGlobals()
})

// VisibleViewport's only child here is the bare string "content", so
// getByText resolves straight to the div that carries the styles under
// test; there is no separate wrapping element to look past.
function rootOf(text: string): HTMLElement {
  return screen.getByText(text)
}

describe("VisibleViewport", () => {
  it("renders the 100dvh fallback when visualViewport is absent", () => {
    setVisualViewport(undefined)

    render(<VisibleViewport>content</VisibleViewport>)
    const el = rootOf("content")

    expect(el.style.top).toBe("0px")
    expect(el.style.height).toBe("100dvh")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")
  })

  it("renders the full-height fallback when nothing is focused, no matter what visualViewport reports", () => {
    // A fake keyboard-sized report (matches the real iPhone readout in the
    // bug this gate fixes: height 367, offsetTop 208), with nothing
    // focused. Before the 28 Sept focus gate this rendered the stale
    // measured values; now it must stay on the fallback.
    const vv = new FakeVisualViewport(367, 390, 208)
    setVisualViewport(vv)

    render(<VisibleViewport>content</VisibleViewport>)
    const el = rootOf("content")

    expect(el.style.top).toBe("0px")
    expect(el.style.height).toBe("100dvh")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")
  })

  it("switches to the visualViewport measurement once an editable element is focused", () => {
    const vv = new FakeVisualViewport(600, 390, 20)
    setVisualViewport(vv)

    render(<VisibleViewport>content</VisibleViewport>)
    expect(rootOf("content").style.height).toBe("100dvh") // sanity: fallback before any focus

    const textarea = focusTextarea()

    const el = rootOf("content")
    expect(el.style.top).toBe("20px")
    expect(el.style.height).toBe("600px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    textarea.remove()
  })

  it("returns to the fallback once the focused field blurs, even though visualViewport never changes", () => {
    const vv = new FakeVisualViewport(367, 390, 208)
    setVisualViewport(vv)

    const textarea = focusTextarea()
    render(<VisibleViewport>content</VisibleViewport>)

    expect(rootOf("content").style.height).toBe("367px") // measured while focused

    act(() => {
      textarea.blur()
    })

    const el = rootOf("content")
    expect(el.style.top).toBe("0px")
    expect(el.style.height).toBe("100dvh")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    // The stale-report bug this gate exists for: visualViewport itself
    // never moved off the keyboard-sized numbers.
    expect(vv.height).toBe(367)
    expect(vv.offsetTop).toBe(208)

    textarea.remove()
  })

  it("treats a resize more than 120px below the tallest height seen as the keyboard opening", () => {
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    // Keyboard opens: viewport shrinks by more than 120px from the baseline.
    vv.height = 500
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    const el = rootOf("content")
    expect(el.style.height).toBe("500px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("0px")

    textarea.remove()
  })

  it("does not treat a shrink of 120px or less as the keyboard opening", () => {
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    vv.height = 724 // exactly 120px shorter than the baseline
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    const el = rootOf("content")
    expect(el.style.height).toBe("724px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    textarea.remove()
  })

  it("updates top on scroll without touching the keyboard state", () => {
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    vv.offsetTop = 44
    act(() => {
      vv.dispatchEvent(new Event("scroll"))
    })

    const el = rootOf("content")
    expect(el.style.top).toBe("44px")
    expect(el.style.height).toBe("844px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    textarea.remove()
  })

  it("resets the keyboard baseline on a width change (rotation)", () => {
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    // Rotate: width changes and the new (landscape) height becomes the new
    // baseline, even though it is far below the portrait height.
    vv.width = 844
    vv.height = 390
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    let el = rootOf("content")
    expect(el.style.height).toBe("390px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    // Now the keyboard opens in landscape, measured against the new baseline.
    vv.height = 200
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    el = rootOf("content")
    expect(el.style.height).toBe("200px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("0px")

    textarea.remove()
  })

  it("removes its visualViewport listeners on unmount", () => {
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const removeSpy = vi.spyOn(vv, "removeEventListener")

    const { unmount } = render(<VisibleViewport>content</VisibleViewport>)
    unmount()

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function))
  })

  it("lets the caller's own style win over the computed layout values", () => {
    setVisualViewport(undefined)

    render(<VisibleViewport style={{ backgroundColor: "var(--surface-base)" }}>content</VisibleViewport>)
    const el = rootOf("content")

    expect(el.style.backgroundColor).toBe("var(--surface-base)")
    expect(el.style.position).toBe("fixed")
  })
})
