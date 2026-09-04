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
// WHAT THE TRY/CATCH ACTUALLY DEFENDS, CORRECTED AFTER REVIEW
//
// The first version of this file claimed the try/catch here defended against
// the same hazard SeenMarker's header describes: a rejected promise inside a
// transition reaching src/app/error.tsx. That claim does not hold, and it
// matters that the record says so plainly rather than carry an overclaiming
// comment forward.
//
// router.refresh() returns void, not a promise, so a synchronous try/catch
// around the call can only ever catch a throw that happens synchronously,
// before the call returns. It structurally cannot catch a rejection raised
// later, inside the transition Next kicks off internally
// (node_modules/next/dist/client/components/app-router-instance.js: `refresh:
// () => { startTransition(() => { dispatchAppRouterAction(...) }) }`) — that
// transition belongs to Next's router, not to this component, so there is no
// promise here to attach a .catch() to. This is the real difference from
// SeenMarker: SeenMarker owns its own useTransition() and awaits and catches
// a promise inside it. This component owns neither.
//
// Having established that, the next question is whether it matters: does a
// genuinely dropped connection during a refresh ever reach an error boundary
// at all, by some path this component cannot see? Read from
// node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:
// the entire fetch-and-decode sequence is already wrapped in Next's own
// try/catch, and a network failure there does not rethrow. It logs
// ("Failed to fetch RSC payload... Falling back to browser navigation.") and
// returns the request's own URL as a plain string, which the caller reads as
// an instruction to fall back to a full browser navigation. The catch
// rethrows in exactly one case: `options.signal?.aborted`, meaning a newer
// refresh superseded this one, which is an ordinary in-app race, not a
// dropped connection, and is not the hazard this component exists for.
// Next's router already fails soft on a network failure, before the failure
// ever becomes a promise this component could observe rejecting.
//
// So: a dropped connection during router.refresh() cannot reach
// src/app/error.tsx through this component, with or without the try/catch.
// The try/catch is kept anyway, for a narrower and more honest reason: it is
// free, and it still catches a genuine synchronous throw at the call site,
// which Next's own source shows is a real (if unlikely here) case —
// dispatchAppRouterAction throws synchronously if a refresh is dispatched
// before the router has finished initializing. That is what
// LiveRefresh.test.tsx's swallow test actually proves; it does not, and
// cannot, exercise the network-failure path, and its name and comment say so.
//
// A dangling timer is not a hypothetical concern in this codebase: one left
// in ShareInviteLink.tsx blocked a safety-net hook on 1 Sept 2026. The
// interval and both listeners are torn down on unmount without exception.
//
// WHY REFRESHES COALESCE WITHIN A SHORT WINDOW
//
// Returning to a backgrounded tab commonly fires both `visibilitychange`
// (hidden to visible) and `focus` for the same one user action, and each
// independently calls refresh(). Left alone, that is two full server
// re-renders back to back, in exactly the poor-connectivity moment this
// component exists to be gentle about. `lastRefreshAt` makes any two refresh
// triggers landing within REFRESH_COALESCE_WINDOW_MS of each other collapse
// into one; it is a plain timestamp rather than React state, since nothing
// here needs to re-render on it.

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const REFRESH_INTERVAL_MS = 10_000
// See header: coalesces a visibilitychange+focus double-fire on tab return
// into one refresh. Comfortably shorter than REFRESH_INTERVAL_MS so it never
// swallows a legitimate later tick.
const REFRESH_COALESCE_WINDOW_MS = 1_000

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
    let lastRefreshAt = 0

    const refresh = () => {
      if (pausedRef.current) return
      const now = Date.now()
      if (now - lastRefreshAt < REFRESH_COALESCE_WINDOW_MS) return
      lastRefreshAt = now
      try {
        router.refresh()
      } catch {
        // Swallow a synchronous throw at the call site (e.g. dispatched
        // before router initialization). See this file's header for what
        // this does and does not defend against.
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
        if (document.visibilityState === "visible") {
      startInterval()
    }
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
