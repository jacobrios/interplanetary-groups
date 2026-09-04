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
// Focus also has to restart the interval, not just fire one refresh, and a
// review caught this file shipping without it. The scenario the header above
// already names is the proof: on a platform where `visibilitychange` fired on
// the way OUT (hiding, which stops the interval) but not on the way back IN,
// a focus handler that only calls refresh() once leaves the member with that
// single refresh and then a frozen screen again, which is the original bug,
// reintroduced on exactly the platform this listener exists for. The same
// gap exists for a member who opens the tab while it is backgrounded (so the
// interval never started) and then focuses it without the tab itself ever
// reporting hidden-to-visible. startInterval() is idempotent (it no-ops if
// intervalId is already set), so calling it here is free on every ordinary
// focus and only matters on the platforms and orderings it exists for.
//

// WHAT `paused` GUARDS, STATED ACCURATELY AFTER REVIEW
//
// GroupHome binds this to sendsInFlight > 0 (see GroupHome.tsx's own
// comments at that binding for the full reasoning and why it is
// sendsInFlight rather than hasUnreconciledSend). This file only has to
// honor the prop: while true, no path here calls router.refresh(), including
// the immediate refresh on becoming visible again.
//
// An earlier version of this comment justified `paused` by a hazard that no
// longer exists in this codebase: a poll landing mid-send silently
// reconciling a member's own optimistic bubble out from under them. That was
// the real symptom before src/lib/messages/optimistic-display.ts's
// applySettledSends, which already decoupled "drawn as sending" from
// useOptimistic's own release timing — a message now stops being drawn as
// pending the moment the server actually has it, not whenever React gets
// around to releasing the transition, so a poll landing mid-send no longer
// has a stale optimistic entry to disrupt. `paused` is kept anyway, not to
// prevent that (already-fixed) symptom, but because it is bounded, costs
// nothing, and the spec mandates it: the honest reason to keep a guard is
// not always the reason it was first written for.
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
//
// WHY REFRESHES NEED THEIR OWN IN-FLIGHT GUARD, NOT JUST THE INTERVAL
//
// Production regression, 4 Sept 2026: a tab left open through several
// missed messages went completely dead — no card taps, no navigation, no
// sends reaching the server; reloading fixed it. The cause: Next dispatches
// every server action AND every refresh through one strictly serial queue
// (node_modules/next/dist/client/components/app-router-instance.js's
// dispatchAction keeps a linked list, actionQueue.pending / actionQueue.last,
// and starts the next action only once the current one resolves). Before
// this guard, a tick landing while the previous refresh's RSC render was
// still outstanding called router.refresh() again anyway, queueing a second
// ACTION_REFRESH behind the first. If a render ever takes longer than
// REFRESH_INTERVAL_MS, every later tick adds another queued action, and
// because a send is a server action too, an RSVP tap or a chat message
// queues behind all of them and never reaches the server while the page
// still looks alive (the optimistic layer keeps drawing). Full incident in
// docs/superpowers/specs/2026-09-04-refresh-backpressure-design.md.
//
// The property this file now holds: at most one refresh in flight, and a
// tick or event landing while one is outstanding does NOTHING — dropped,
// not queued, no scheduled catch-up. A tab that slept through fifty ticks
// owes exactly one refresh on waking, not fifty.
//
// THE MECHANISM, AND WHY IT IS TRUSTWORTHY HERE
//
// router.refresh() returns void, so there is nothing to await. The signal
// used instead is useTransition()'s own isPending, read via
// refreshPendingRef the same way `paused` is read via pausedRef: mirrored by
// a small effect rather than closed over directly, so the long-lived
// interval and listeners never need tearing down just because a refresh
// started or settled.
//
// Verified against Next 16.3.2's own source rather than assumed: refresh()
// is `startTransition(() => dispatchAppRouterAction({type: ACTION_REFRESH}))`,
// and that dispatch itself does a SECOND, nested `startTransition(() =>
// setState(deferredPromise))`, setting the router's own rendered state to a
// promise that the AppRouter component reads with `use()`. A transition
// that suspends holds its own isPending true until the suspending promise
// resolves — and, reproduced in a throwaway test rather than taken on
// faith, a SEPARATE, unrelated useTransition() whose startTransition call
// happens to run in the same synchronous window as that nested one stays
// pending too, because React renders every lane scheduled in that window
// together and a suspense anywhere in the render holds the whole batch
// back. That is what makes wrapping router.refresh() in this component's
// own useTransition() an honest signal of when the real RSC fetch has
// actually landed, not just of when this component's own callback (which
// does nothing but call a void function) happened to return.
//
// Two things checked against this codebase's own history before trusting
// it, per the design doc:
//
// 1. GroupHome.tsx's header warns against re-adding a useTransition
//    believing it fixes a timing problem — but that warning is about the
//    SEND path's server-action dispatch, where the transition itself was
//    what held useOptimistic's entry open. This component owns no
//    useOptimistic entry and sends nothing; it only reads isPending, which
//    changes nothing about how long any OTHER component's own transition
//    takes to settle.
// 2. Does wrapping refresh() here ever lengthen the hold that used to grey
//    out a member's own message? No, for two independent reasons. First,
//    `paused` already blocks every refresh for the whole life of a send
//    (see GroupHome's sendsInFlight binding), so a refresh's transition and
//    a send's transition are never both active at once by construction.
//    Second, even if they somehow overlapped, MessageFeed no longer draws a
//    message's "sending" look from the raw useOptimistic isPending flag at
//    all — src/lib/messages/optimistic-display.ts's applySettledSends
//    decides that from the send's own promise, and a longer-held raw
//    transition is explicitly "fine for cleanup, fatal for paused"
//    (GroupHome's own words) but invisible on screen either way.
//
// The try/catch below stays exactly where it was: INSIDE the transition's
// callback, wrapping the raw router.refresh() call, not wrapping
// startRefreshTransition itself. React's own startTransition has its own
// internal catch that swallows a synchronous throw differently (into a
// rejected result this component never reads), and relying on that instead
// would change what the existing, already-verified "swallows a synchronous
// throw" test actually proves. Catching it here first keeps that test's
// meaning untouched by this slice.

import { useEffect, useRef, useTransition } from "react"
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

  // isRefreshPending is the in-flight signal itself; see this file's header,
  // "THE MECHANISM, AND WHY IT IS TRUSTWORTHY HERE", for why useTransition's
  // own isPending is an honest read of whether the last-started refresh has
  // actually landed. Mirrored into a ref for the same reason pausedRef
  // exists: the interval/listener closures below are set up once and must
  // see the latest value without tearing themselves down every time a
  // refresh starts or settles.
  const [isRefreshPending, startRefreshTransition] = useTransition()
  const refreshPendingRef = useRef(isRefreshPending)
  useEffect(() => {
    refreshPendingRef.current = isRefreshPending
  }, [isRefreshPending])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    let lastRefreshAt = 0

    const refresh = () => {
      if (pausedRef.current) return
      // The whole slice: a trigger landing while a refresh is still
      // outstanding does nothing at all. Checked before the coalesce
      // window (not after and not merged with it) because this is the
      // primary guard now, and because updating lastRefreshAt here would
      // needlessly delay the very next tick once the in-flight one clears.
      if (refreshPendingRef.current) return
      const now = Date.now()
      if (now - lastRefreshAt < REFRESH_COALESCE_WINDOW_MS) return
      lastRefreshAt = now
      startRefreshTransition(() => {
        try {
          router.refresh()
        } catch {
          // Swallow a synchronous throw at the call site (e.g. dispatched
          // before router initialization). See this file's header for what
          // this does and does not defend against, and for why this catch
          // stays inside the transition's callback rather than around
          // startRefreshTransition itself.
        }
      })
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
        // refresh() is synchronous, so visibility cannot have changed
        // between these two lines; no re-check needed before starting the
        // interval back up.
        refresh()
        startInterval()
      } else {
        stopInterval()
      }
    }

    const handleFocus = () => {
      refresh()
      // See header, "focus also has to restart the interval": a platform
      // that stopped the interval on the way to hidden but does not fire
      // visibilitychange on the way back (iOS Safari returning from another
      // app) would otherwise get exactly one refresh here and then a
      // permanently frozen screen. startInterval() is idempotent, so this
      // is a no-op on every ordinary focus where the interval is already
      // running.
      if (document.visibilityState === "visible") {
        startInterval()
      }
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
