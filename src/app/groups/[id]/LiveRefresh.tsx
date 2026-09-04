"use client"

// Renders nothing. Its only job is to keep a signed-in group home from going
// stale while somebody is looking at it.
//
// The group home is server-rendered: everything on screen is the answer to
// the request that loaded the page, once. A second member's chat message, an
// Orbit reply, a gauge tally ticking up, none of it reaches a screen that is
// just sitting open, because nothing re-runs the server render on its own.
// This polls router.refresh() so the screen catches up by itself instead of
// making a member reload by hand to see what changed while they were reading.
//
// A component rather than an effect inside GroupHome, for the same reason
// SeenMarker is one: its own test seam, and GroupHome already carries the
// optimistic message list and does not need a second unrelated concern
// stacked onto it.
//
// WHY VISIBILITY GATES THE INTERVAL, TWICE OVER
//
// A member who backgrounds the tab (switches apps, locks the phone) should
// not keep polling: it burns their battery and data for a screen nobody is
// reading, and it is the one case an anti-clutter product should not create
// network chatter for. `visibilitychange` starts and stops the interval
// itself, but the interval's own tick also rechecks document.visibilityState
// before it fires. The two are not the same guard: a tick can be queued in
// the same task-queue turn as a visibility flip the listener has not yet
// handled, and a background tab throttles timers in ways that can let a stale
// tick land after the state has already moved on. The tick's own check is
// what makes "only while visible" true regardless of that ordering, not just
// true when the listener happens to win the race.
//
// Becoming visible again refreshes immediately, on the theory that a member
// who just looked back at the screen wants what changed while they were away
// now, not up to 10 seconds from now.
//
// WHY FOCUS IS A SEPARATE LISTENER, NOT A VISIBILITY SPECIAL CASE
//
// `visibilitychange` is the tab-level signal (backgrounded vs. not) and is
// what this component mostly runs on. `focus` is the window-level signal, and
// it catches returns `visibilitychange` does not reliably fire for, most
// notably switching back to this tab from another app on iOS Safari, which is
// exactly the "member on a lift with spotty signal comes back to the group"
// case this component exists for. Refreshing on focus is not gated by
// document.visibilityState: if the platform is not raising the visibility
// event this member needs, gating focus on the same property it is meant to
// stand in for would silently reintroduce the gap.
//
// WHY `paused` EXISTS HERE WITH NOTHING WIRING IT
//
// Task 2 gives GroupHome a way to hold this true for the moment a member's
// own message is in flight, so a poll cannot land mid-send and show a member
// their own optimistic bubble getting silently reconciled out from under
// them. That wiring is Task 2's job. This file only has to honor the prop
// once it exists: while true, no path here calls router.refresh(), including
// the immediate refresh on becoming visible again.
//
// THE CATCH IS LOAD-BEARING, AND IT IS THIS FILE'S JOB
//
// router.refresh() already wraps its own work in React's startTransition
// (node_modules/next/dist/client/components/app-router-instance.js: `refresh:
// () => { startTransition(() => { dispatchAppRouterAction(...) }) }`), the
// same mechanism SeenMarker's header and GroupHome's detectIntentAction call
// both document: a failure surfacing there reaches the nearest error
// boundary, which for this screen is src/app/error.tsx, and replaces the
// whole group home with "Something broke on our end." A member on a lift with
// no signal must see a slightly stale room instead, which is exactly what
// decision 5 of this slice's design calls for. The try/catch around every
// call site here is what stands between a dropped connection and that crash;
// it is not decorative.
//
// A dangling timer is not a hypothetical concern in this codebase: one left
// in ShareInviteLink.tsx blocked a safety-net hook on 1 Sept 2026. The
// interval and both listeners are torn down on unmount without exception.

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const REFRESH_INTERVAL_MS = 10_000

interface Props {
  /** While true, no refresh fires. Owned and set by Task 2; unwired here. */
  paused: boolean
}

export default function LiveRefresh({ paused }: Props) {
  const router = useRouter()

  // Read inside long-lived interval and event-listener callbacks, so toggling
  // `paused` is seen on the very next tick without tearing down and
  // recreating the interval and listeners on every change.
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    const refresh = () => {
      if (pausedRef.current) return
      try {
        router.refresh()
      } catch {
        // Swallow. See this file's header: a failed trip must leave the
        // group home standing, not surface an error boundary.
      }
    }

    // The interval's own gate on top of start/stop-by-event; see header.
    const tick = () => {
      if (document.visibilityState !== "visible") return
      refresh()
    }

    const startInterval = () => {
      if (intervalId !== undefined) return
      intervalId = setInterval(tick, REFRESH_INTERVAL_MS)
    }

    const stopInterval = () => {
      clearInterval(intervalId)
      intervalId = undefined
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh()
        startInterval()
      } else {
        stopInterval()
      }
    }

    const handleFocus = () => {
      refresh()
    }

    if (document.visibilityState === "visible") {
      startInterval()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [router])

  return null
}
