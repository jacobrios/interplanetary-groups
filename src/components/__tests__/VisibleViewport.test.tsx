// @vitest-environment jsdom
//
// VisibleViewport has no server to talk to, so every case here is a fake
// window.visualViewport (a plain EventTarget carrying the fields the real
// one exposes) driven by dispatching its own resize/scroll events.
// requestAnimationFrame is stubbed to run its callback synchronously so a
// test does not need real animation frames or fake timers to see the
// scheduled measurement land within the test body.
//
// This repo's jsdom throws on a computed-style read of a LONGHAND padding
// property (paddingBottom) holding calc() with an unresolved var()/env(); a
// shorthand `padding` string containing such a calc() does not throw
// (ChatInput, StepGapAsk and YourGroupsScreen ship that inline and pass).
// Assertions below read --bottom-inset's own value directly, never a calc()
// built from it.
//
// The keyboard-open comparison (28 Sept 2026, fix round 1) reads
// document.documentElement.clientHeight rather than any self-recorded
// baseline, so every test that focuses a field and cares about
// --bottom-inset now stubs it with `setClientHeight()` first. jsdom never
// runs real layout, so document.documentElement.clientHeight is 0 by
// default; leaving it unstubbed would make every keyboard-open comparison
// silently pass for the wrong reason (a huge negative number is never
// greater than the threshold) rather than testing the real comparison, so
// this file stubs it explicitly everywhere the comparison is exercised
// instead of leaning on that default.
//
// Most cases below now need an editable element focused before the
// component will report measured values at all (28 Sept 2026's focus
// gate, see the component's own header). `focusTextarea()` creates a real
// `<textarea>` in the document, focuses it (which jsdom dispatches as a
// genuine bubbling "focusin", exercised the same as a real browser), and
// hands it back so a test can blur or remove it later. One jsdom gap
// worth knowing before extending this file: unlike focus()/blur(), jsdom
// does NOT dispatch a "focusout" when a focused node is simply removed
// from the document (verified by hand against jsdom 30), even though it
// does silently move document.activeElement to <body>. Real WebKit DOES
// fire it: the owner's iPhone logs (28 Sept 2026) showed focusout at the
// onboarding step 1 to gap-ask transition and on the group home when a
// focused field was removed. So the removal test below blurs first, the
// one path jsdom and real browsers agree on, rather than asserting a
// "remove with no blur" case jsdom cannot honestly represent.

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

// Stubs the layout-viewport height the component now compares
// visualViewport.height against. See this file's header for why every
// test exercising the keyboard-open comparison sets this explicitly.
function setClientHeight(value: number) {
  Object.defineProperty(document.documentElement, "clientHeight", {
    value,
    configurable: true,
  })
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
  // Undo any per-test setClientHeight() stub, falling back to jsdom's own
  // (unrendered, always-zero) getter rather than leaking one test's stub
  // into the next.
  delete (document.documentElement as unknown as { clientHeight?: number }).clientHeight
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

  // Fix round 1 (28 Sept 2026): a self-recorded baseline read
  // window.visualViewport at mount with no focus gate of its own, so a
  // mount that happened to land while visualViewport was already stale
  // (the exact bug sequence: the gap-ask step mounts while the previous
  // screen's keyboard-open numbers are still being reported) poisoned the
  // baseline to the stale value. When the founder then focused the
  // gap-ask textarea and the real keyboard opened at that same height,
  // "shrink from baseline" read as zero and --bottom-inset stayed
  // env(safe-area-inset-bottom), leaving a gap above the real keyboard.
  // This fails against e90db55 and passes once the baseline is replaced
  // with a live document.documentElement.clientHeight comparison, since
  // clientHeight is unaffected by whatever visualViewport was reporting
  // at mount.
  it("does not poison the keyboard-open state at mount when visualViewport is already stale with nothing focused", () => {
    // Real iPhone readout from the bug report: documentElement.clientHeight
    // stayed 652 in the keyboard-open, keyboard-closed, and stale states.
    setClientHeight(652)
    const vv = new FakeVisualViewport(367, 390, 208) // stale keyboard-open numbers, nothing focused
    setVisualViewport(vv)

    render(<VisibleViewport>content</VisibleViewport>)
    expect(rootOf("content").style.height).toBe("100dvh") // nothing focused yet: fallback

    // The founder focuses the gap-ask textarea; the real keyboard opens
    // and visualViewport keeps reporting the same 367 it already held.
    const textarea = focusTextarea()

    const el = rootOf("content")
    expect(el.style.height).toBe("367px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("0px")

    textarea.remove()
  })

  it("treats a visualViewport shrink of more than 120px below document.documentElement.clientHeight as the keyboard opening", () => {
    setClientHeight(844) // the stable layout-viewport height; unaffected by the keyboard
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    // Keyboard opens: visualViewport shrinks by more than 120px below clientHeight.
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
    setClientHeight(844)
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    vv.height = 724 // exactly 120px shorter than clientHeight
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    const el = rootOf("content")
    expect(el.style.height).toBe("724px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    textarea.remove()
  })

  it("updates top on scroll without touching the keyboard state", () => {
    setClientHeight(844)
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

  // Replaces the old "resets the keyboard baseline on a width change
  // (rotation)" case: there is no baseline left to reset. Rotation is
  // handled for free because document.documentElement.clientHeight is a
  // live measurement of the current layout viewport, not something this
  // component records and has to know to invalidate; this test exercises
  // that by moving clientHeight itself as part of the simulated rotation,
  // the same way a real device's layout viewport changes size on rotation.
  it("keeps the keyboard-open comparison correct across a rotation, with no reset logic needed", () => {
    setClientHeight(844) // portrait, full height, no keyboard
    const vv = new FakeVisualViewport(844, 390, 0)
    setVisualViewport(vv)
    const textarea = focusTextarea()

    render(<VisibleViewport>content</VisibleViewport>)

    // Rotate: both the layout viewport and visualViewport report the new
    // (landscape) full height, no keyboard.
    setClientHeight(390)
    vv.width = 844
    vv.height = 390
    act(() => {
      vv.dispatchEvent(new Event("resize"))
    })

    let el = rootOf("content")
    expect(el.style.height).toBe("390px")
    expect(el.style.getPropertyValue("--bottom-inset")).toBe("env(safe-area-inset-bottom)")

    // Now the keyboard opens in landscape, measured against the
    // landscape clientHeight.
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

  it("removes its document focusin/focusout listeners on unmount", () => {
    setVisualViewport(new FakeVisualViewport(844, 390, 0))
    const removeSpy = vi.spyOn(document, "removeEventListener")

    const { unmount } = render(<VisibleViewport>content</VisibleViewport>)
    unmount()

    expect(removeSpy).toHaveBeenCalledWith("focusin", expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith("focusout", expect.any(Function))
    removeSpy.mockRestore()
  })

  it("lets the caller's own style win over the computed layout values", () => {
    setVisualViewport(undefined)

    render(
      <VisibleViewport style={{ backgroundColor: "var(--surface-base)", height: "50px", top: "7px" }}>
        content
      </VisibleViewport>,
    )
    const el = rootOf("content")

    expect(el.style.backgroundColor).toBe("var(--surface-base)")
    expect(el.style.position).toBe("fixed")
    // These two are computed by the component (fallback 100dvh / 0), so
    // they only read the caller's values if the caller's style is spread last.
    expect(el.style.height).toBe("50px")
    expect(el.style.top).toBe("7px")
  })
  // The box pads its own top with the safe-area inset and is a scroll
  // container, so a sticky descendant's offset is measured from the
  // padding-reduced edge. Without this reset PageHeader's top: var(--safe-top)
  // applied the inset a second time (28 Sept 2026 phone pass, 59px too low).
  it("zeroes --safe-top for its descendants, since the box already pads the inset", () => {
    render(
      <VisibleViewport>
        <p>child</p>
      </VisibleViewport>,
    )
    const el = screen.getByText("child").parentElement as HTMLElement
    expect(el.style.getPropertyValue("--safe-top")).toBe("0px")
  })

  // Item 8 (final review): editable means what the browser says it is.
  it("treats a contenteditable element as editable via isContentEditable, including contenteditable=\"\" and plaintext-only", () => {
    setClientHeight(844)
    setVisualViewport(new FakeVisualViewport(600, 390, 0))
    render(<VisibleViewport>content</VisibleViewport>)

    const div = document.createElement("div")
    div.tabIndex = 0
    // jsdom does not implement isContentEditable; stand in for the browser.
    Object.defineProperty(div, "isContentEditable", { value: true })
    document.body.appendChild(div)
    act(() => {
      div.focus()
    })
    expect(rootOf("content").style.height).toBe("600px")
    div.remove()
  })

  it("does not treat a focused element as editable just because contenteditable=\"true\" is spelled on it when the browser says it is not", () => {
    setVisualViewport(new FakeVisualViewport(600, 390, 0))
    render(<VisibleViewport>content</VisibleViewport>)

    const div = document.createElement("div")
    div.tabIndex = 0
    div.setAttribute("contenteditable", "true")
    Object.defineProperty(div, "isContentEditable", { value: false })
    document.body.appendChild(div)
    act(() => {
      div.focus()
    })
    expect(rootOf("content").style.height).toBe("100dvh")
    div.remove()
  })

  it("treats a focused disabled or readOnly text field as not editable (no keyboard opens)", () => {
    setVisualViewport(new FakeVisualViewport(600, 390, 0))
    render(<VisibleViewport>content</VisibleViewport>)

    const ro = document.createElement("textarea")
    ro.readOnly = true
    document.body.appendChild(ro)
    act(() => {
      ro.focus()
    })
    expect(rootOf("content").style.height).toBe("100dvh")
    ro.remove()

    const input = document.createElement("input")
    input.type = "text"
    input.readOnly = true
    document.body.appendChild(input)
    act(() => {
      input.focus()
    })
    expect(rootOf("content").style.height).toBe("100dvh")
    input.remove()

    // A disabled field cannot take focus in a browser at all; the check
    // still refuses it if something reports it as activeElement.
    const dis = document.createElement("textarea")
    dis.disabled = true
    document.body.appendChild(dis)
    Object.defineProperty(document, "activeElement", { value: dis, configurable: true })
    act(() => {
      document.dispatchEvent(new Event("focusin"))
    })
    expect(rootOf("content").style.height).toBe("100dvh")
    delete (document as unknown as { activeElement?: Element }).activeElement
    dis.remove()
  })

  // Item 5: landscape. viewportFit cover makes the left and right insets
  // nonzero in landscape; the fixed box pads them itself.
  it("pads its own left and right with the safe-area tokens", () => {
    setVisualViewport(undefined)
    render(<VisibleViewport>content</VisibleViewport>)
    const el = rootOf("content")
    expect(el.style.paddingLeft).toBe("var(--safe-left)")
    expect(el.style.paddingRight).toBe("var(--safe-right)")
  })
})
