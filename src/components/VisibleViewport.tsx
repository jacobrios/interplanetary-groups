"use client"

// VisibleViewport
//
// One div, fixed to exactly the area the browser is actually showing right
// now, not to a static 100dvh that ignores the on-screen keyboard, a
// collapsing address bar, or the home-screen safe areas. This file owns only
// the measurement. Task 2 mounts it under the screens that need it (the
// group chat composer, the onboarding gap-ask); it renders nothing of its
// own beyond the fixed wrapper, and it has no opinion about what the caller
// puts inside it.
//
// WHY THIS EXISTS, AND THE REJECTED FIX NAMED SO NOBODY RE-ADDS IT
//
// The obvious-looking fix, scrolling the composer into view once the
// keyboard's resize settles, was tried twice against a real iPhone
// (docs/build-notes.md, 27 Sept 2026, "Postscript... the owner's phone pass
// on the gap-ask thread") and failed both times: the box lifted clear for a
// moment and then iPhone Chrome repositioned the page underneath it, and it
// jittered back under the address bar, even after waiting for resizes to
// settle before scrolling. That result rules out timing as the cause, which
// is why this component does not scroll anything at all. It sizes the
// container to the visible area instead, reading window.visualViewport
// directly, which is the fix that same postscript queued in the rejected
// fix's place. Do not re-add a scroll-into-view here; it has already failed
// twice on the real device this product is built for.
//
// KEYBOARD-OPEN DETECTION: A SELF-RECORDED BASELINE, NOT window.innerHeight
//
// The obvious comparison, visualViewport.height against window.innerHeight,
// is deliberately not used. innerHeight's own behaviour with the keyboard
// open on iOS is not something this codebase has verified, so leaning on it
// would be trusting an assumption rather than a fact. A baseline this
// component records itself, the largest visualViewport.height it has seen
// since mount, needs no such assumption: by construction it is the height
// with the keyboard closed, on this device, in this orientation, because
// the keyboard can only ever shrink the visual viewport, never grow it past
// its own closed size. The baseline resets when visualViewport.width
// changes, which is what a rotation looks like: without the reset, a
// baseline recorded in portrait would wrongly read a genuinely full-height
// landscape viewport as keyboard-shrunk. The keyboard counts as open when
// the current height is more than KEYBOARD_OPEN_THRESHOLD_PX below that
// baseline, wide enough that ordinary browser-chrome changes (the address
// bar showing or hiding) do not misread as a keyboard.
//
// WHY --bottom-inset EXISTS RATHER THAN A HARDCODED PADDING
//
// With the keyboard open, the home bar it would otherwise sit above is
// covered by the keyboard, so padding sized for the safe area would open a
// visible gap between the keyboard and whatever the caller renders at the
// bottom. The custom property lets a caller apply the right inset in its
// own padding or margin without re-deriving keyboard state itself.
//
// BEFORE THE FIRST MEASUREMENT
//
// Server render and the first client paint have no visualViewport reading
// yet, since no effect has run. The style falls back to today's behaviour,
// top: 0 and height: 100dvh, so nothing looks different for anyone until
// this component actually measures.
//
// AT MOST ONE PENDING FRAME
//
// visualViewport can fire resize and scroll rapidly (mid-animation on iOS
// as the keyboard opens or closes). `scheduled` coalesces any number of
// calls arriving before the next frame into a single measurement; `rafId`
// exists only so an unmount mid-frame can cancel the pending one.
//
// THE FOCUS GATE (28 Sept 2026): visualViewport GOES STALE ON WEBKIT WHEN
// THE FOCUSED FIELD LEAVES THE DOM
//
// Found on a real iPhone (Chrome on iOS, which is WebKit underneath): on
// onboarding step 1, with the description textarea focused and the
// keyboard up, visualViewport correctly read a shrunk height and a
// nonzero offsetTop. Tapping Continue swaps step 1 out for the gap-ask
// step, which unmounts that textarea. iOS dismisses the keyboard, exactly
// as it should when focus is lost, but window.visualViewport kept
// reporting the SAME keyboard-open height and offsetTop indefinitely, and
// never fired another resize or scroll to say otherwise. This component
// applied those stale numbers faithfully, so the gap-ask step rendered a
// tall empty band up top and a short box, even though the keyboard was
// gone. That measurement was correct until the moment it wasn't, and
// nothing observable from visualViewport itself said so.
//
// The fix does not try to detect staleness from visualViewport's own
// numbers (there is nothing in them to distinguish a genuinely short
// visible area from a stale report of one). Instead it uses a fact
// visualViewport can never contradict: the on-screen keyboard can only be
// open while an editable element holds focus. So the measured values are
// trusted only while document.activeElement is editable (a text-entry
// input, a textarea, or [contenteditable]); the instant that stops being
// true, this component falls back to the full-height 100dvh style
// regardless of what visualViewport last reported, and picks the
// measurement back up the next time something editable is focused.
// Listeners on document's "focusin" and "focusout" (which fire on focus
// changes anywhere in the document, not just inside this component's own
// subtree) re-run the same scheduled measurement pass as a visualViewport
// resize or scroll; the check itself reads document.activeElement inside
// that scheduled frame rather than synchronously in the event handler, so
// a focus move from one field straight to another (focusout then focusin
// in the same tick) settles on the new field's state rather than
// flashing the fallback in between.
//
// The rejected fix is still the same one, and still rejected for the
// same reason: scrolling the composer into view once the keyboard's
// resize settles was tried twice against a real iPhone (build-notes.md,
// 27 Sept 2026, "Postscript... the owner's phone pass on the gap-ask
// thread") and failed both times, so this component does not scroll
// anything. Do not re-add a scroll-into-view here.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

const KEYBOARD_OPEN_THRESHOLD_PX = 120

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

// The keyboard can only be open while an editable element holds focus, so
// this is the gate everything else in this component is built on. See
// "THE FOCUS GATE" above for why.
function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type)
  return el.getAttribute("contenteditable") === "true"
}

// CSSProperties has no index signature for custom properties (csstype does
// not declare one), so a `--bottom-inset` key needs its own type rather than
// a cast at every call site.
type StyleWithCustomProperties = CSSProperties & Record<`--${string}`, string>

interface Measurement {
  top: number
  height: number
  bottomInset: string
}

interface Props {
  children: ReactNode
  /** Merged in last, so the caller's own background, flex layout, and so on win. */
  style?: CSSProperties
}

export default function VisibleViewport({ children, style }: Props) {
  const [measurement, setMeasurement] = useState<Measurement | null>(null)

  useEffect(() => {
    const viewportAtMount = window.visualViewport

    // The largest height seen since mount stands in for "keyboard closed";
    // see header for why this reads visualViewport rather than innerHeight,
    // and why a width change resets it.
    const baseline = {
      height: viewportAtMount ? viewportAtMount.height : 0,
      width: viewportAtMount ? viewportAtMount.width : 0,
    }

    let scheduled = false
    let rafId: number | null = null

    const measureNow = () => {
      // The keyboard can only be open while something editable is
      // focused; see "THE FOCUS GATE" in the header for why this is
      // checked before trusting anything visualViewport reports, and why
      // it is read here (inside the scheduled frame) rather than
      // synchronously from the focusin/focusout handlers below.
      if (!isEditableElement(document.activeElement)) {
        setMeasurement(null)
        return
      }

      const viewport = window.visualViewport
      // No visualViewport at all: nothing to measure from, so this never
      // leaves the null (100dvh fallback) state. See the window-resize
      // fallback listener below for why a listener is still attached in
      // this branch even though it never has anything to do here.
      if (!viewport) return

      if (viewport.width !== baseline.width) {
        baseline.width = viewport.width
        baseline.height = viewport.height
      } else if (viewport.height > baseline.height) {
        baseline.height = viewport.height
      }

      const keyboardOpen = baseline.height - viewport.height > KEYBOARD_OPEN_THRESHOLD_PX

      setMeasurement({
        top: viewport.offsetTop,
        height: viewport.height,
        bottomInset: keyboardOpen ? "0px" : "env(safe-area-inset-bottom)",
      })
    }

    const scheduleMeasure = () => {
      if (scheduled) return
      scheduled = true
      rafId = requestAnimationFrame(() => {
        scheduled = false
        rafId = null
        measureNow()
      })
    }

    if (viewportAtMount) {
      viewportAtMount.addEventListener("resize", scheduleMeasure)
      viewportAtMount.addEventListener("scroll", scheduleMeasure)
    } else {
      // A fallback for a browser with no visualViewport at all. measureNow
      // no-ops without one, so this listener never actually changes
      // anything; it exists so a platform that gains visualViewport support
      // mid-session (not something this codebase has observed, but cheap to
      // cover) would still have something wired up to react to.
      window.addEventListener("resize", scheduleMeasure)
    }

    // The focus gate's other half: re-run the same scheduled measurement
    // whenever focus moves anywhere in the document, not just inside this
    // component. "focusin"/"focusout" bubble (unlike "focus"/"blur"), so
    // document is the one place to listen that covers every field on the
    // page without threading a ref through every caller.
    document.addEventListener("focusin", scheduleMeasure)
    document.addEventListener("focusout", scheduleMeasure)

    scheduleMeasure()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (viewportAtMount) {
        viewportAtMount.removeEventListener("resize", scheduleMeasure)
        viewportAtMount.removeEventListener("scroll", scheduleMeasure)
      } else {
        window.removeEventListener("resize", scheduleMeasure)
      }
      document.removeEventListener("focusin", scheduleMeasure)
      document.removeEventListener("focusout", scheduleMeasure)
    }
  }, [])

  const dynamic: StyleWithCustomProperties = measurement
    ? {
        top: `${measurement.top}px`,
        height: `${measurement.height}px`,
        "--bottom-inset": measurement.bottomInset,
      }
    : {
        top: 0,
        height: "100dvh",
        "--bottom-inset": "env(safe-area-inset-bottom)",
      }

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        overflow: "hidden",
        boxSizing: "border-box",
        paddingTop: "env(safe-area-inset-top)",
        ...dynamic,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
