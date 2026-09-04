"use client"

// Renders nothing. Its only job is to notice that a newer version of this
// product has been deployed, and to put the member's open tab onto it at a
// moment that does not interrupt them.
//
// WHY THIS EXISTS WHEN NEXT ALREADY HAS A VERSION-SKEW RELOAD
//
// Because on this product Next's own reload can never fire, and the record
// used to say otherwise. Vercel's Skew Protection pins every
// framework-managed request — router navigations, server actions, and
// LiveRefresh's router.refresh() — back to the deployment the tab booted
// from, so the deployment id in a poll's response is always the id the tab
// already holds. The mismatch Next reacts to does not occur. Proven in
// production, with a redeploy watched on a phone.
//
// A plain fetch() we write ourselves is NOT framework-managed: it carries no
// x-deployment-id, production sets no __vdpl cookie, and it therefore reaches
// the CURRENT deployment. That one difference is the whole mechanism here,
// and it is why the check has to go through src/app/api/deployment/route.ts
// by hand rather than riding anything Next fetches for us.
//
// WHY IT IS NOT FOLDED INTO LiveRefresh
//
// LiveRefresh carries hard-won reasoning about refresh back-pressure, Next's
// serial action queue, and a bounded in-flight flag — a production incident's
// worth of it. This component shares none of that: it dispatches nothing
// through Next's action queue, holds no optimistic state, and its worst
// failure mode is a different one. Two concerns in that file would mean every
// future reader of either has to disentangle them.
//
// WHAT MAKES THIS SAFE, WHICH IS THE PART TO READ BEFORE CHANGING ANYTHING
//
// A reload loop would be far worse than the stale screen this fixes: it is
// unrecoverable from inside the app, and it would take the group home away
// from a member every minute for as long as the tab lived. Three things stand
// between this and that, and all three must survive any edit:
//
//   1. The deployment id this tab has already reloaded FOR is written to
//      sessionStorage BEFORE window.location.reload() is called, and a write
//      that throws cancels the reload. Writing after would be writing code
//      that never runs.
//   2. Every read failure — a rejected fetch, a body that is not the expected
//      shape, an endpoint that answers non-200, a storage accessor that
//      throws — resolves to "do nothing this tick", never to "something
//      changed". Absent means detection is off.
//   3. decideReload (src/lib/deploy/should-reload.ts) holds the rules,
//      including the per-tab cap that covers the case rule 1 cannot see.
//
// WHY THERE IS NO IN-FLIGHT FLAG, WITH THE REASONING CORRECTED AFTER REVIEW
//
// Two checks can be in the air at once: a tab returning to the foreground can
// fire visibilitychange and focus for the same one action, and a slow answer
// can still be outstanding when the next interval tick lands. That is
// harmless, and the reason it is harmless is not the one the first version of
// this comment gave.
//
// The wrong reason, recorded rather than deleted because it is the kind that
// gets copied: it cited the 4 Sept 2026 LiveRefresh incident about unbounded
// in-flight flags. That incident is about Next's strictly serial action
// queue, where a queued refresh blocks every later server action including a
// member's own send. NOTHING here touches that queue — this component
// dispatches no server action, holds no optimistic state, and calls a plain
// fetch — so that precedent does not transfer and must not be leaned on.
//
// The reason that does hold, and it is about this function's own shape:
// there are TWO awaits in a check (the fetch, then reading the body as JSON),
// and after the LAST of them nothing suspends. Read the record, decide, write
// the record, reload: all synchronous, in one turn. So a second check cannot
// resume between the first check's decision and its write. Whichever gets
// there first records the id it reloaded for, and guard 1 then refuses the
// other. Two checks therefore still produce exactly one reload. A flag is
// unnecessary, and an unnecessary flag is not free — this repo found two
// unbounded ones in a single day, one of which wedged a tab for its whole
// life.
//
// What a double-fire DOES cost is a second request for one gesture, which is
// a cost rather than a hazard, and CHECK_COALESCE_WINDOW_MS below answers it
// the same way LiveRefresh answers the identical double-fire.
//
// WHAT "SAFE TO RELOAD" MEANS, WIDENED 4 SEPT 2026 AFTER REVIEW
//
// It used to mean "the chat composer is empty and no send is outstanding",
// which was far too narrow, and the failure was realistic and expensive: a
// member opens the email sheet, submits their address, switches to their mail
// app for the one-time code, and comes back. Coming back is EXACTLY when this
// component checks. The composer is empty, no send is in flight, so the tab
// reloaded and took the sheet, the step it was on and the typed address with
// it — leaving a member holding a code with nowhere to type it.
//
// Two more signals now count as busy, and both are read from the DOM at
// decision time rather than threaded down as props. That is deliberate: a
// prop covers exactly the one sheet that exists today, while
// `[role="dialog"]` covers every modal this product ever grows, including
// ones nobody has written yet, and the alternative is a slice three months
// from now silently reintroducing this bug by adding a sheet and not knowing
// this file exists. EmailAskNote already carries role="dialog" with
// aria-modal (its own header documents that as the product's modal
// precedent), so the selector matches something real today, and the
// precedent it sets is one a new modal gets for free by being accessible.
//
// THE LIMIT, NAMED SO IT IS NOT MISTAKEN FOR COVERAGE: GaugeChips.tsx,
// ProposalChips.tsx and GroupProposalChips.tsx each dispatch a server action
// that neither signal can see, so a reload can still land mid-chip-tap. Left
// alone on cost: the vote either reached the server or it did not, the
// reloaded screen shows which, and nothing a member typed is lost.

import { useEffect, useRef } from "react"
import { decideReload } from "@/lib/deploy/should-reload"

/**
 * How often a visible tab asks which build is live.
 *
 * One small request a minute per open, visible tab, which is negligible at
 * this product's size and is registered debt in the slice record. If the cost
 * ever matters, THIS is the lever, not the transport: making the endpoint a
 * static asset would put the answer back inside the `?dpl=` pinning machinery
 * this whole design routes around.
 *
 * Exported so the test file measures elapsed time off the same single
 * constant rather than a duplicated number that could drift.
 */
export const DEPLOYMENT_CHECK_INTERVAL_MS = 60_000

/**
 * How long one check is allowed to take before it is abandoned.
 *
 * Without this, a stalled connection means a request that never settles, one
 * more of them every minute for as long as the tab lives, and none of them
 * ever released. Comfortably shorter than the interval, so a tab can never
 * accumulate them: the previous check is always either answered or abandoned
 * before the next one starts.
 *
 * An abandoned check is not an error and is not reported; it is just this
 * tick doing nothing, like every other read failure here.
 *
 * Exported so the test file measures elapsed time off the same single
 * constant rather than a duplicated number that could drift.
 */
export const DEPLOYMENT_CHECK_TIMEOUT_MS = 10_000

/**
 * Two triggers landing inside this window count as one.
 *
 * Returning to a backgrounded tab commonly raises visibilitychange AND focus
 * for one single gesture, and each independently starts a check, so every tab
 * return costs two requests rather than one. Same window, same reasoning and
 * same mechanism as LiveRefresh's REFRESH_COALESCE_WINDOW_MS. It is a
 * sixtieth of the interval, so it can never swallow a legitimate later tick.
 */
const CHECK_COALESCE_WINDOW_MS = 1_000

/** The deployment id this tab has already reloaded for. See guard 1 above. */
const RELOADED_FOR_KEY = "ipg:deploy:reloaded-for"
/** How many times this tab has reloaded itself. Feeds the per-tab cap. */
const RELOAD_COUNT_KEY = "ipg:deploy:reload-count"

interface TabRecord {
  alreadyReloadedFor: string | null
  reloadCount: number
}

/**
 * What this tab remembers about its own reloads, or null when the store
 * cannot be read at all.
 *
 * sessionStorage rather than localStorage, and the reason is the same one
 * GroupHome's parked draft gives: this is per-tab state, and localStorage is
 * shared across every tab on the origin, so one tab's reload would silence
 * another tab's. It also has the property this specifically needs — it
 * survives the reload it is written for.
 *
 * The try starts BEFORE `window.sessionStorage`, not around getItem alone:
 * the property access itself throws in a private window and wherever the
 * browser blocks site data, before any method is called.
 *
 * Null is the "cannot read" answer and the caller does nothing with it. That
 * is the only safe direction: with no store there is no way to remember that
 * a reload has happened, and a reload nobody remembers is a loop.
 */
function readTabRecord(): TabRecord | null {
  try {
    const store = window.sessionStorage
    const raw = store.getItem(RELOAD_COUNT_KEY)
    return {
      alreadyReloadedFor: store.getItem(RELOADED_FOR_KEY),
      // Handed on exactly as parsed, NaN and negatives included, rather than
      // interpreted here. decideReload's rule 4 owns what an unusable count
      // means (spent, never a fresh allowance), and it owns it alone: a
      // second interpretation in this file would be a second place to fix
      // and a second place to get it wrong. An earlier version of this line
      // mapped NaN to the cap here and let a NEGATIVE through untouched,
      // which bought an unbounded reload loop out of one hand-edited value.
      reloadCount: raw === null ? 0 : Number.parseInt(raw, 10),
    }
  } catch {
    return null
  }
}

/**
 * Records the reload about to happen. Returns false if it could not be
 * written, in which case the reload MUST NOT proceed — see guard 1.
 */
function recordReload(deploymentId: string, nextCount: number): boolean {
  try {
    window.sessionStorage.setItem(RELOADED_FOR_KEY, deploymentId)
    window.sessionStorage.setItem(RELOAD_COUNT_KEY, String(nextCount))
    return true
  } catch {
    return false
  }
}

/**
 * The live deployment id out of the endpoint's body, or null for anything
 * that is not a plainly readable one.
 *
 * `unknown` in and a hand-written shape check rather than a cast, because the
 * client asking is by the nature of this feature always OLDER than the server
 * answering: a future body shape, an error page served by an edge, or an
 * empty response all have to land on null rather than on a value that gets
 * compared as if it meant something.
 */
/**
 * Whether a modal or sheet is open over the screen right now.
 *
 * A DOM query rather than a threaded prop, and that is the whole point: a
 * prop would cover exactly the one sheet that exists today, while this covers
 * every modal this product ever grows, including ones nobody has written yet.
 * The alternative is a slice months from now adding a sheet, knowing nothing
 * about this file, and silently reintroducing the reload-over-a-half-finished
 * sign-in bug this check exists to stop.
 *
 * `role="dialog"` is the right hook because it is not decoration: it is what
 * makes a modal announce itself to a screen reader, so a new modal earns this
 * protection by being accessible rather than by remembering a rule. The
 * product's own precedent (EmailAskNote.tsx's header, "THE PRODUCT'S FIRST
 * MODAL") already settles role="dialog" with aria-modal as the shape.
 */
function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null
}

/**
 * Whether the caret is sitting in something a member could be typing into,
 * anywhere on the screen rather than only in the chat composer.
 *
 * Focus rather than content, deliberately: an open phone keyboard over an
 * empty field is still a member in the middle of something, and this is what
 * the "a reload closes the keyboard" reasoning actually rests on. It is also
 * what reaches the one-time-code field inside the email sheet, which holds no
 * chat text at all.
 */
function isFocusInTextField(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (active.isContentEditable) return true
  const tag = active.tagName
  return tag === "INPUT" || tag === "TEXTAREA"
}

function readDeploymentId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const id = (body as { id?: unknown }).id
  return typeof id === "string" && id.length > 0 ? id : null
}

interface Props {
  /**
   * The deployment that server-rendered this document, from the page's own
   * process.env.VERCEL_DEPLOYMENT_ID. Null off Vercel, which means detection
   * is off entirely: no interval, no listeners, no requests.
   */
  bootedId: string | null
  /** True while there is anything in the chat composer. Owned by GroupHome. */
  composerHasText: boolean
  /** True while a send has not settled. Owned by GroupHome. */
  sendInFlight: boolean
}

export default function DeployWatch({ bootedId, composerHasText, sendInFlight }: Props) {
  // Read inside long-lived interval and listener callbacks, mirrored into
  // refs for the same reason LiveRefresh mirrors `paused`: a member typing a
  // character must not tear down and rebuild the interval and both listeners
  // on every keystroke.
  const composerHasTextRef = useRef(composerHasText)
  const sendInFlightRef = useRef(sendInFlight)
  useEffect(() => {
    composerHasTextRef.current = composerHasText
    sendInFlightRef.current = sendInFlight
  }, [composerHasText, sendInFlight])

  useEffect(() => {
    // Detection off. Nothing is scheduled and nothing is requested, so a
    // local development run and a member on a build that predates Vercel
    // supplying the variable both cost exactly nothing.
    if (bootedId === null) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined
    // When the last check STARTED, for the coalescing window. Negative
    // infinity rather than 0 so the very first check is never mistaken for a
    // repeat of one that never happened.
    let lastCheckAt = Number.NEGATIVE_INFINITY
    // Everything currently in the air, so unmount can abandon all of it: the
    // request itself and the deadline timer watching it. A dangling timer is
    // not hypothetical here; one left in ShareInviteLink.tsx blocked a
    // safety-net hook on 1 Sept 2026.
    const pending = new Set<{
      controller: AbortController
      timeoutId: ReturnType<typeof setTimeout>
    }>()

    const check = async () => {
      // See CHECK_COALESCE_WINDOW_MS: a tab return raises visibilitychange
      // and focus for one gesture, and each starts a check. Read before the
      // request rather than after, because what is being prevented is the
      // second REQUEST, not the second decision.
      const now = Date.now()
      if (now - lastCheckAt < CHECK_COALESCE_WINDOW_MS) return
      lastCheckAt = now

      // The deadline, and the abort it fires, exist so a stalled connection
      // cannot leave one never-settling request per minute behind it for the
      // life of the tab. Registered in `pending` before the await so unmount
      // can reach it.
      const controller = new AbortController()
      const inFlight = {
        controller,
        timeoutId: setTimeout(() => controller.abort(), DEPLOYMENT_CHECK_TIMEOUT_MS),
      }
      pending.add(inFlight)

      let currentId: string | null
      try {
        // cache: "no-store" belt to the route's own header: a cached answer
        // means either a missed deploy or a reload loop, and the two ends of
        // this are deployed at different times by definition.
        const response = await fetch("/api/deployment", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) return
        currentId = readDeploymentId(await response.json())
      } catch {
        // Offline, a dropped connection, an aborted request, a body that
        // will not parse. All of them mean "do nothing this tick". This
        // feature must never be able to break the group home: a member
        // cannot even report a bug from a screen that will not load.
        return
      } finally {
        clearTimeout(inFlight.timeoutId)
        pending.delete(inFlight)
      }

      // The member has left this screen since the request went out. Reloading
      // now would reload wherever they are instead.
      if (cancelled) return

      const record = readTabRecord()
      if (record === null) return

      const decision = decideReload({
        bootedId,
        currentId,
        composerHasText: composerHasTextRef.current,
        sendInFlight: sendInFlightRef.current,
        // Read HERE, at the moment of the decision, rather than when the
        // request went out: a member can open the sheet or tap into a field
        // during the round trip, and the question this answers is whether it
        // is safe to reload NOW.
        modalOpen: isModalOpen(),
        focusInTextField: isFocusInTextField(),
        alreadyReloadedFor: record.alreadyReloadedFor,
        reloadCount: record.reloadCount,
      })

      if (!decision.reload) return
      // decideReload's rule 1 already guarantees a non-null currentId behind
      // a true verdict; this restates it for the compiler and costs nothing.
      if (currentId === null) return

      // Written BEFORE the reload, and a failed write cancels it. See guard 1
      // in this file's header: code after reload() is code that never runs.
      if (!recordReload(currentId, record.reloadCount + 1)) return

      // reload(), not replace(), and no confirmation dialogue: this is the
      // same document coming back on a newer build, so it belongs in history
      // exactly where it already is.
      window.location.reload()
    }

    // The interval's own gate on top of start/stop-by-event, and the two are
    // not the same guard: a tick can be queued in the same task-queue turn as
    // a visibility flip the listener has not handled yet, and a backgrounded
    // tab throttles timers in ways that let a stale tick land late. Same
    // reasoning, at more length, in LiveRefresh.tsx's header.
    const tick = () => {
      if (document.visibilityState !== "visible") return
      void check()
    }

    const startInterval = () => {
      if (intervalId !== undefined) return
      intervalId = setInterval(tick, DEPLOYMENT_CHECK_INTERVAL_MS)
    }

    const stopInterval = () => {
      clearInterval(intervalId)
      intervalId = undefined
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Immediately, not up to a minute from now: a member who has just
        // looked back at the screen is the likeliest person to be about to
        // tap something, which is the moment a stale build hurts.
        void check()
        startInterval()
      } else {
        stopInterval()
      }
    }

    // WHY FOCUS IS HERE AT ALL, since the slice document names only
    // visibilitychange and the interval. Lifted from LiveRefresh.tsx, which
    // added it after review for a measured reason that applies identically
    // here: iOS Safari returning from another app fires visibilitychange on
    // the way OUT (which stops the interval) but not reliably on the way back
    // IN. Without this listener, the interval would never restart and this
    // component would be permanently dead for the first member who ever
    // backgrounded the tab — on the platform this product is actually used
    // on. Not gated on document.visibilityState, for the same reason
    // LiveRefresh's is not: gating the fallback on the very property it
    // stands in for would reopen the gap it exists to close. startInterval()
    // is idempotent, so this is free on every ordinary focus.
    const handleFocus = () => {
      void check()
      if (document.visibilityState === "visible") startInterval()
    }

    if (document.visibilityState === "visible") startInterval()

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      // `cancelled` stops a late answer acting; aborting stops the request
      // itself, which is the difference between a leaked connection and a
      // released one when a member leaves the screen mid-check. The rest
      // covers everything that could start a new one. A dangling timer is
      // not a hypothetical concern in this repo: one left in
      // ShareInviteLink.tsx blocked a safety-net hook on 1 Sept 2026, which
      // is why the deadline timers are cleared here as well as aborted.
      cancelled = true
      for (const inFlight of pending) {
        clearTimeout(inFlight.timeoutId)
        inFlight.controller.abort()
      }
      pending.clear()
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [bootedId])

  return null
}
