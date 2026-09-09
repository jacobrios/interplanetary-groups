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
// interval and three listeners are torn down on unmount without exception.
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
//    out a member's own message? No — but not for the reason an earlier
//    draft of this comment gave, and that correction belongs on the
//    record rather than silently fixed. `paused` stops a refresh from
//    STARTING during a send; it does nothing about a send starting while a
//    refresh is already in flight, and GroupHome.tsx:368 dispatches sends
//    inside their own async transition, so that overlap is genuinely live
//    in that window. The real reason there is no regression: the
//    suspending update is Next's, not ours. dispatchAction's
//    setState(deferredPromise) is created inside Next's router the moment
//    router.refresh() is called, whether or not this component wraps that
//    call in its own useTransition. Wrapping only adds two boolean state
//    updates (isPending flipping true, then false) onto a lane that
//    already contains the suspending one; useOptimistic's hold does not
//    lengthen by a millisecond either way. Independently, and sufficient
//    on its own even if the above were wrong: MessageFeed no longer draws
//    a message's "sending" look from the raw useOptimistic isPending flag
//    at all — src/lib/messages/optimistic-display.ts's applySettledSends
//    decides that from the send's own promise instead.
//
// BOUNDING THE IN-FLIGHT FLAG, SO IT CANNOT STICK FOREVER
//
// isRefreshPending has exactly one way out: the RSC promise this
// transition wraps actually settling. Nothing bounds that on its own. A
// refresh whose fetch neither answers nor errors — dropped mid-flight, a
// connection that never resolves — would leave this flag true for the
// rest of the tab's life, and because every trigger sits behind it, the
// member could not even force recovery by returning to the tab: silent
// polling forever, reload the only way out.
//
// Not hypothetical in this codebase: GroupHome.tsx documents the
// identical mechanism for a hung SEND, verified on a real phone — a
// transition left pending "for the rest of the tab's life" after a
// dropped connection mid-send — and answers it with a wall-clock deadline
// (withDeadline / SEND_DEADLINE_MS) rather than trusting React's own
// settlement, because an unbounded wait there is, in that file's own
// words, "fatal for paused". Same medicine here: refreshStartedAtRef
// stamps when the current transition started, and a refresh counts as
// still in flight only within REFRESH_IN_FLIGHT_TIMEOUT_MS of that stamp.
// Past it, isPending's own true value is not trusted, and a fresh attempt
// is let through.
//
// The honest counterweight, so this is not oversold: a refresh that
// genuinely hangs this long means Next's own serial action queue has a
// stuck action at its head (see "WHY REFRESHES NEED THEIR OWN IN-FLIGHT
// GUARD" above) — the tab is very likely wedged for reasons this bound
// cannot fix, since a fresh router.refresh() dispatched into that same
// queue just queues up behind the one already stuck. This bound is
// insurance against OUR OWN flag sticking forever, not a cure for an
// actually stuck queue: it is what stands between "broken until reload"
// and "broken until the next expiry window," not between "broken" and
// "fine."
//
// The try/catch below stays exactly where it was: INSIDE the transition's
// callback, wrapping the raw router.refresh() call, not wrapping
// startRefreshTransition itself. An earlier draft of this comment said
// React's own internal catch swallows a synchronous throw here "into a
// result this component never reads" — that is backwards, and worth
// correcting in place rather than silently. React DOES put a rejected
// thenable into this hook's own state, and updateTransition reads it back
// through useThenable, which THROWS during render on exactly that
// rejected status — straight into src/app/error.tsx, taking the whole
// group home down, and leaving isPending itself broken from then on,
// which would also break this guard. The real reason to keep the catch
// inside the callback rather than around startRefreshTransition: letting
// a synchronous throw reach React's own machinery here would crash the
// group home AND break this guard, not harmlessly disappear into state
// nobody reads. Catching it here, before React ever sees it, is also why
// the existing, already-verified "swallows a synchronous throw" test
// still proves what it always did.

import { useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"

const REFRESH_INTERVAL_MS = 10_000
// See header: coalesces a visibilitychange+focus double-fire on tab return
// into one refresh. Comfortably shorter than REFRESH_INTERVAL_MS so it never
// swallows a legitimate later tick.
const REFRESH_COALESCE_WINDOW_MS = 1_000
// See header, "BOUNDING THE IN-FLIGHT FLAG": a refresh whose transition
// never settles (a hung or dropped fetch) must not disable this component
// forever. "A few intervals" rather than one, so a merely-slow render
// (still well short of hung) is never mistaken for a stuck one. Exported
// so the test file computes elapsed time off the same single constant
// rather than a duplicated number that could drift.
export const REFRESH_IN_FLIGHT_TIMEOUT_MS = REFRESH_INTERVAL_MS * 3

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
  // When the currently-tracked transition started, if any. See header,
  // "BOUNDING THE IN-FLIGHT FLAG": this is what lets a hung refresh's
  // isPending=true be overridden after REFRESH_IN_FLIGHT_TIMEOUT_MS rather
  // than trusted forever. Cleared back to null once isRefreshPending goes
  // false on its own, purely so a stale timestamp can never be misread —
  // the in-flight check below never reads it unless refreshPendingRef.current
  // is also true, so this reset is hygiene, not load-bearing.
  const refreshStartedAtRef = useRef<number | null>(null)
  useEffect(() => {
    refreshPendingRef.current = isRefreshPending
    if (!isRefreshPending) refreshStartedAtRef.current = null
  }, [isRefreshPending])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    let lastRefreshAt = 0

    const refresh = () => {
      // OFFLINE IS CHECKED FIRST, ABOVE EVERY OTHER GUARD.
      //
      // Not arbitrary ordering. The other three early returns are about this
      // app's own state (a send is in flight, a refresh is in flight, one just
      // happened), and when this one is true none of them can matter, because
      // nothing is going to happen either way. There is no point asking
      // whether we are allowed to refresh when we cannot refresh.
      //
      // WHY THIS GUARD EXISTS AT ALL, since the failure it prevents is not
      // visible from this file. router.refresh() ends in Next's
      // fetchServerResponse, which on a network failure does NOT rethrow: it
      // logs "Failed to fetch RSC payload... Falling back to browser
      // navigation." (fetch-server-response.js:237) and returns the
      // request's own URL as a plain string (fetch-server-response.js:242),
      // not a doMpaNavigation call, which is a DIFFERENT branch used for a
      // build id mismatch or a redirect, not for this one. The string return
      // is read by fetchMissingDynamicData (ppr-navigations.js:1109), which
      // turns it into exitStatus 2 (ppr-navigations.js:1123) and, in that
      // exit status's own case block (ppr-navigations.js:987), dispatches a
      // retry action with mpa: true. server-patch-reducer.js:22 reads that
      // flag and calls completeHardNavigation at its own call site,
      // server-patch-reducer.js:29 (the function itself is defined at
      // segment-cache/navigation.js:340 and exported at :20-21). Calling it
      // sets pushRef.mpaNavigation. app-router.js:214 checks that flag and
      // calls location.replace() at app-router.js:221. A full
      // browser navigation with no connectivity lands the member on the
      // browser's own error page, and the group home they were reading is
      // gone until they reload by hand. Every line above was read in
      // node_modules/next/dist/client/components/, Next 16.3.2, not assumed
      // from an earlier version's trace.
      //
      // THERE IS A RETRY-ON-RECONNECT BRANCH IN THAT SAME CATCH, AND IT IS OFF
      // HERE. It is gated on process.env.__NEXT_USE_OFFLINE, which
      // node_modules/next/dist/build/define-env.js:126 defines from
      // config.experimental.useOffline. next.config.ts does not set it, so the
      // branch is dead code in this build. Recorded because it is the most
      // likely thing a future session will find and use to argue this guard is
      // redundant: if that flag is ever turned on, re-evaluate this guard
      // rather than keeping it out of habit.
      //
      // THE SECOND THING THIS DOES NOT COVER, and it is structural rather than
      // a decision: this stops a refresh from STARTING while offline. It can
      // do nothing about one already IN FLIGHT when the connection drops.
      // That request fails inside Next, takes the same fallback traced above,
      // and hard-navigates. There is no hook between the failure and
      // location.replace() for us to hold, so closing this would mean not
      // using router.refresh() at all, which is a redesign rather than a
      // guard. The window is one round trip per REFRESH_INTERVAL_MS, so it is
      // small in production and much wider on a dev server, where a refresh
      // compiles on demand. Named here because the QA that verified this
      // guard (8 Sept 2026) could not distinguish it from a page still
      // loading when the network died, which is ordinary browser behaviour
      // and not this component's to fix.
      //
      // WHAT THIS DOES NOT COVER, decided rather than overlooked: a device
      // connected to a network that has no working internet (a captive portal,
      // a wifi with no backhaul) reports itself online, so this guard misses
      // it. Jacob's ruling, 8 Sept 2026: in that state everything else in the
      // app is broken too, so the member already knows something is wrong. The
      // alternative, a pre-flight probe before each refresh, was declined
      // because it permanently doubles request volume on this screen to buy a
      // subset of cases. Trigger for revisiting: somebody actually observing
      // the browser error page after this shipped.
      //
      // `=== false` rather than `!navigator.onLine`, so this fails toward
      // working: only an explicit false blocks a refresh. A platform where the
      // property is missing gets the old behaviour rather than a component
      // that silently never refreshes again.
      if (navigator.onLine === false) return
      if (pausedRef.current) return
      const now = Date.now()
      // The whole slice: a trigger landing while a refresh is still
      // outstanding does nothing at all — UNLESS it has been outstanding
      // longer than REFRESH_IN_FLIGHT_TIMEOUT_MS, in which case isPending's
      // own true value is not trusted (see header) and this falls through
      // to attempt a fresh one. Checked before the coalesce window (not
      // after and not merged with it) because this is the primary guard
      // now, and because updating lastRefreshAt here would needlessly
      // delay the very next tick once the in-flight one clears or expires.
      const stillInFlight =
        refreshPendingRef.current &&
        refreshStartedAtRef.current !== null &&
        now - refreshStartedAtRef.current < REFRESH_IN_FLIGHT_TIMEOUT_MS
      if (stillInFlight) return
      if (now - lastRefreshAt < REFRESH_COALESCE_WINDOW_MS) return
      lastRefreshAt = now
      refreshStartedAtRef.current = now
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

    // A member who walks back into signal should see the catch-up now, not up
    // to REFRESH_INTERVAL_MS later. The coalesce window keeps this from
    // double-firing with a tick that lands in the same moment.
    //
    // DELIBERATELY NO MATCHING "offline" LISTENER, and this is a question the
    // next reader will have. Stopping the interval on the way out would add a
    // second piece of state to keep consistent with this one, for no benefit:
    // the tick is already gated on visibility and now on connectivity, so a
    // tick while offline costs one boolean read and nothing else.
    //
    // This deliberately does NOT call startInterval(). If the tab is visible
    // the interval is already running; if it is hidden it must stay stopped,
    // and visibilitychange starts it when the member comes back. That is the
    // opposite of handleFocus, which does restart it, because focus is a
    // return-to-the-tab signal and this is not.
    //
    // GATED ON VISIBILITY, UNLIKE handleFocus's refresh, and the difference is
    // worth spelling out since the two look alike at a glance. handleFocus's
    // own refresh() call is deliberately NOT gated on document.visibilityState,
    // because focus is a return-to-the-tab signal that stands in for a
    // visibility event some platforms do not fire (see above); gating the
    // refresh on the very property it exists to substitute for would reopen
    // the gap it closes. handleFocus DOES read document.visibilityState
    // itself, at line 453 below, but only to decide whether to restart the
    // interval, never to decide whether to refresh. An `online`
    // event carries none of that meaning. It says the device's network came
    // back, nothing about whether anyone is looking at this tab, so a
    // backgrounded tab whose wifi drops and reconnects would otherwise fetch
    // a full server render for a screen nobody is reading, and queue that
    // refresh in front of any send the member makes the moment they unlock
    // the phone (see "WHY REFRESHES NEED THEIR OWN IN-FLIGHT GUARD" for why a
    // queued refresh is not a free mistake). The tick already refuses to run
    // while hidden; this listener now makes the same call itself.
    const handleOnline = () => {
      if (document.visibilityState !== "visible") return
      refresh()
    }

    if (document.visibilityState === "visible") {
      startInterval()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleOnline)

    return () => {
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleOnline)
    }
  }, [router])

  return null
}
