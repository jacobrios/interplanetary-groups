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

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

const KEYBOARD_OPEN_THRESHOLD_PX = 120

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

    scheduleMeasure()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (viewportAtMount) {
        viewportAtMount.removeEventListener("resize", scheduleMeasure)
        viewportAtMount.removeEventListener("scroll", scheduleMeasure)
      } else {
        window.removeEventListener("resize", scheduleMeasure)
      }
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
