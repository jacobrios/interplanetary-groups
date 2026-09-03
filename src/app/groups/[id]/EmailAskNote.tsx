"use client"

// src/app/groups/[id]/EmailAskNote.tsx
//
// Orbit asking for a way to remember this member, as a bottom sheet over the
// group home. It is the only part of the email slice most members will ever
// see.
//
// Why it is here at all: without an email, a member who loses their session
// taps the invite link again and joins as a SECOND person. The group holds two
// of them, their earlier answers belong to an identity nobody can reach, and
// every attendance count is quietly wrong, in the one product whose whole
// claim is accurate attendance.
//
// WHY A SHEET, replacing the inline note that shipped 26 Aug 2026. The owner's
// diagnosis on a real phone: the inline version was "the worst case in-between,
// where it doesn't take up enough space that it seems like you can work around
// it but not enough space to really stand out." The counterintuitive half is
// the one worth keeping, because it is what makes this consistent with the
// anti-clutter brand rather than an exception to it: a sheet costs LESS total
// screen time than the inline note did. The note was sticky until answered and
// competed with the chat feed the entire time a member stayed undecided; the
// sheet takes the screen once and ends.
//
// Bottom sheet rather than full screen, from round 10: a full screen hides the
// header, and the header is exactly what the second ask tells the member to
// tap.
//
// A NOTE, not a chat bubble, and that survives the move. The bubble rule would
// allow one here, since the member's next action does answer Orbit, but a
// bubble only one viewer can see would read as a message everyone else can
// see. The labeled-note treatment (mark, "A NOTE FROM ORBIT" eyebrow, copy) is
// round 10's, and the grid is load-bearing: the mark sits in its own column so
// no line of a six-line paragraph wraps around it.
//
// Nothing here is ever posted to the feed, and nothing about it reaches the
// database except the answer: a worded dismissal advances the counter, an
// attach creates the contact method, and nothing else writes a row. Being
// shown does now leave one mark, and it is deliberately not a row: a
// device-local cooldown cookie, described under THE COOLDOWN below.
//
// The field state, request/confirm calls, and error copy live in
// EmailAttachFlow, shared with the group info page's permanent row. What stays
// here: the shell, the note box, which of the two settled asks to show, and
// what each way out costs.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PRODUCT'S FIRST MODAL. Read this before you build the second one.
// ─────────────────────────────────────────────────────────────────────────────
// Nothing in this app used a scrim, a sheet or a dialog before 27 Aug 2026, so
// there was no precedent to follow and these four decisions ARE the precedent.
// Each was made deliberately rather than inherited from a library:
//
//   FOCUS goes to the sheet itself, not to the email field. Focusing the input
//   raises the phone keyboard over an ask nobody has read yet, and this element
//   is copy first: the member has to understand what is being asked before the
//   field means anything. Focus is trapped inside the sheet while it is open
//   (Tab cycles, Shift+Tab cycles back) and returns to whatever held it before,
//   which is usually nothing, because this sheet is opened by the page rather
//   than by a member tapping something.
//
//   THE PAGE BEHIND does not scroll. The scrim covers the viewport and eats
//   the pointer events, and document.body's overflow is locked as well and
//   restored exactly to its previous value on the way out. The group home's own
//   feed is an inner scroll region rather than the body's, so the scrim is what
//   actually stops it; the body lock is what keeps this component honest on any
//   ordinary scrolling page a future caller mounts it on.
//
//   THE BACK GESTURE. Escape closes the sheet and costs nothing. The Android
//   system back gesture is deliberately NOT intercepted: catching it means
//   pushing a history entry, which puts this element into the router's back
//   stack and is a much larger decision than a sheet should make on its own.
//   Backing out of the page instead is consistent with the table below, since
//   navigating away has never spent an ask.
//
//   SEMANTICS: role="dialog" with aria-modal, labelled by the note's own
//   eyebrow. NOT role="alertdialog", which announces an urgent interruption
//   that must be answered; this one has three free ways out. The scrim carries
//   the dismiss tap but is not a control and has no role, because a screen
//   reader announcing a nameless button over the whole screen is worse than
//   nothing; Escape is the keyboard's equivalent.
//
// DRAG-TO-DISMISS IS NOT BUILT. The grab bar is drawn, because it is what says
// "sheet" at a glance, but dragging it does nothing today. Stated rather than
// left ambiguous: if the owner wants the gesture, it is a pointer-event
// handler on the sheet plus a transform, and it must land in the free column
// of the table below alongside the scrim tap.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT EACH WAY OUT COSTS. The asymmetry is deliberate and points one way.
// ─────────────────────────────────────────────────────────────────────────────
// Two columns, because there are now two mechanisms and they measure different
// things. The first column is the one that was always here and has not moved.
//
//                              lifetime asks (2 ever)   cooldown (24h)
//   "Not now" / "No thanks"    spends one               already running
//   Tapping the scrim          free                     already running
//   Escape                     free                     already running
//   Navigating away            free                     already running
//   The phone's back gesture   free                     already running
//
// The first column is the asymmetry, and it is unchanged: the silent gesture is
// the cheap one. Somebody who read the ask and tapped the worded exit has told
// us something, and spending an ask honours it. Inverted, it would be a bug.
// Both halves are tested, because testing only the expensive one would let the
// free ones quietly become expensive.
//
// The second column reads the same on every row for a reason, and it is the
// point rather than a shrug: no exit starts the cooldown, because the cooldown
// started when the sheet appeared, and it is already running by the time any of
// these happen.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COOLDOWN, added 3 Sept 2026. Spec:
// docs/superpowers/specs/2026-09-03-email-ask-cooldown-design.md
// ─────────────────────────────────────────────────────────────────────────────
// The defect it closes: "free" had been built as "means nothing at all," when
// tapping outside a sheet plainly means "not right now." So a member whose exit
// was the scrim tap met this sheet again on every single return to the group
// home, forever. That is the loop; the two lifetime asks were never the
// problem and are untouched.
//
// THE TRIGGER IS THE SHEET APPEARING, not any dismissal. That covers all four
// ways out with one write, including the one no dismissal handler can ever
// reach: the phone's own back gesture leaves the page entirely, so none of this
// component's code runs and nothing could be recorded on the way out. The bound
// therefore comes from the code rather than from a member's habits. This
// amended the decision Jacob arrived with, on his call, and the reasoning is in
// the spec's "The amendment" section.
//
// THE COOKIE IS READ TWICE, IN TWO PLACES, AND THE SECOND ONE IS NOT REDUNDANT.
// The server reads it and hands the answer down as `lastShownAt`. This
// component reads it once more, at mount, in the state initializer below. That
// second read exists because the browser and phone back gesture does NOT re-run
// the server render: Next's client router cache serves back and forward
// navigations from memory, by design, and it does not expire and is not
// configurable. That was measured against the real app before any of this was
// written (spec, "The task 0 result"), three independent ways: no server render
// logged, a 100-byte response where genuine renders return the whole payload,
// and the stale copy still served after waiting forty seconds. Left
// server-side only, this fix would be honoured on every path except the one an
// iPhone member reaches for first. Delete the mount check and you silently
// restore the bug on that path; a test in EmailAskNote.test.tsx fails if you
// do.
//
// The cookie records an IMPRESSION while the counter beside it records only
// ANSWERS. Nothing reads across, and the difference is on purpose.

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { shouldOfferEmail, type EmailAskState } from "@/lib/auth/email-offer"
import { emailAskCookieIsFresh, markEmailAskShown } from "@/lib/auth/email-ask-cooldown"
import { dismissEmailOfferAction } from "@/app/actions/email-ask"
import { OrbitMark } from "@/components/OrbitMark"
import EmailAttachFlow from "./EmailAttachFlow"

// The owner settled this copy over four rounds and overruled two objections on
// the record: that "log back in" is system language for someone who never
// knowingly made an account (logging in is universally understood), and that
// "lose access to this group" is inaccurate because a member keeps the invite
// link and loses their identity rather than their access (the two readings are
// the same thing from the member's side). Do not re-voice it.
//
// ONE STRING FOR EVERYONE. The founder's extra sentence ("It also means you
// won't lose the group you started.") was deleted 27 Aug 2026 by the owner: a
// founder already knows it is their group, and the clause gestured at a bigger
// stake without naming what a founder actually loses, which is the ability to
// manage members and reset the invite link. If founders should ever be warned
// about those powers, that is different copy written on purpose. The
// viewerIsFounder prop went with it, since deciding founder-ness was the only
// thing it did here.
const FIRST_ASK =
  "I haven't asked for a way to remember you. Add your email so you can log back in if necessary. This way you don't lose access to this group."

/**
 * The second and last ask. It points at the group name at the top of the
 * screen rather than naming a page, so it sends the member somewhere they can
 * already see. No expiry is named anywhere in this copy, deliberately: storage
 * does expire, but what applies to this app's setup was never verified, and a
 * number nobody can stand behind is worse than staying general.
 */
function secondAsk(groupName: string): string {
  return `You're still a temporary member. Without your email, you can't log back in if something happens. If now is not a good time, no worries. Just tap ${groupName} at the top of the screen whenever you're ready. I won't bother you like this again.`
}

/** Everything focusable the trap should cycle through. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface EmailAskNoteProps {
  groupName: string
  askState: EmailAskState
  latestContributionAt: Date | null
  hasVerifiedEmail: boolean
  /**
   * The moment this sheet was last shown to this member, or null if it never
   * has been. This arrives from the server (the page reads the cooldown
   * cookie and hands the value in as a prop) so that the same value is
   * present on the server render and on hydration. That is what stops the
   * sheet appearing and then vanishing. Fed straight into shouldOfferEmail,
   * which owns the comparison against the cooldown window.
   *
   * NARROWED 3 Sept 2026, task 5, and the original wording is worth keeping
   * in view because it was right about the danger and wrong about the scope.
   * It said this component "must never read the cookie itself." What must
   * never happen is a read that can change its answer WHILE the sheet is up:
   * a value re-read on a later render could hide a sheet somebody is reading
   * or typing into, which is the failure the sentence was guarding against
   * and is still forbidden. A single read taken in a state initializer, which
   * runs once during this mount's first render and never again, cannot do
   * that. It exists because the back gesture never re-runs the server render,
   * so this prop is stale on exactly the path a phone uses most; see THE
   * COOLDOWN in the header comment.
   */
  lastShownAt: Date | null
  /** Injected rather than read here, so a test's outcome never depends on the clock. */
  now: Date
}

export default function EmailAskNote({
  groupName,
  askState,
  latestContributionAt,
  hasVerifiedEmail,
  lastShownAt,
  now,
}: EmailAskNoteProps) {
  const [answered, setAnswered] = useState(false)
  /**
   * THE LATCH, and it exists because of a real phone: "The dialogue after I
   * entered in my code came up and disappeared way too fast. I didn't even
   * have time to read it."
   *
   * Nothing in this component closed it. Confirming the code writes a verified
   * ContactMethod, the route re-renders, the page recomputes the facts below
   * with `hasVerifiedEmail` now true, `shouldOfferEmail` correctly returns
   * null, and the sheet vanished mid-sentence. The gate was behaving
   * perfectly; the fault was that **the sheet's lifetime was tied to a server
   * prop that the member's own success invalidates.**
   *
   * So a flow that reached its end outranks the offer: once the address is
   * attached, the sheet stays until the member closes it, whatever the server
   * now says. This codebase had already learned the same lesson one file over,
   * in EmailStatusRow's `attached` state, for the same reason.
   *
   * Scoped deliberately, because the dangerous version of this is easy to
   * write: it holds a sheet that is ALREADY open, and it can never open one.
   * A member the gate says nothing to sees nothing, on any re-render, and a
   * test holds that. It stores which ask was live rather than a bare boolean,
   * so the copy cannot silently switch asks underneath a member reading it.
   *
   * Attach is the only case that needs this, and that is worth stating so the
   * next reader does not widen it on a hunch: of the gate's four inputs, only
   * `hasVerifiedEmail` can be flipped to null-the-offer by the member's own
   * action inside this sheet. A dismissal already sets `answered`.
   */
  const [attachedUnder, setAttachedUnder] = useState<ReturnType<typeof shouldOfferEmail>>(null)
  /**
   * THE MOUNT CHECK, and it looks redundant against `lastShownAt` above until
   * you know why it is here: the browser and phone back gesture does not
   * re-run the server render, so on that path `lastShownAt` is whatever the
   * cached render said, however long ago that was. The full measurement is in
   * the header comment under THE COOLDOWN. Delete this and the fix works
   * everywhere except the gesture an iPhone member reaches for first.
   *
   * WHY A STATE INITIALIZER, which is the odd-looking part:
   *
   *   An EFFECT runs after paint, so on a back-gesture return the sheet would
   *   draw and then vanish. That flicker is what the original
   *   no-client-suppression rule existed to prevent, and it would be worse
   *   than the bug being fixed.
   *
   *   A useLayoutEffect would avoid the paint but warns during server
   *   rendering, and would need an isomorphic wrapper for no gain.
   *
   *   A LAZY INITIALIZER runs during this mount's first render and never
   *   again. That is exactly the guarantee needed: it can never hide a sheet a
   *   member is already reading or typing into, however many times this
   *   component re-renders. Same class of protection as the `attachedUnder`
   *   latch above, reached for the same reason.
   *
   * HYDRATION: the `typeof document` check makes this false on the server. On
   * a genuine first load it is false on the client too, because the server
   * only rendered the sheet after finding no fresh cookie and nothing has
   * written one yet, so the two agree. The one way they can disagree is a
   * second tab writing the cookie between the server render and hydration,
   * which costs a hydration warning and a sheet that does not show. Named
   * rather than defended against.
   */
  const [suppressedByCooldown] = useState(
    () => typeof document !== "undefined" && emailAskCookieIsFresh()
  )
  const [, startTransition] = useTransition()
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)
  const eyebrowId = useId()

  // The gate lives in the component rather than in the page, because this repo
  // can test a component and cannot test a server-rendered screen. The page
  // gathers the facts; the one decision about whether a member is asked is made
  // here, where a test can hold it to it.
  const offer = shouldOfferEmail({
    user: askState,
    latestContributionAt,
    hasVerifiedEmail,
    lastShownAt,
    now,
  })
  // The live offer, or the one this sheet was opened under if the member has
  // since attached an address and made the live one null. See the latch above.
  const activeOffer = offer ?? attachedUnder
  const showing = !answered && !suppressedByCooldown && activeOffer !== null

  // The cooldown starts by the sheet appearing. Its own effect, deliberately
  // not folded into the focus-and-scroll-lock one below: that effect's cleanup
  // gives back things borrowed from the page, and this write is not borrowed
  // and must never be undone on the way out.
  //
  // GATED ON `showing`, WHICH ALREADY CARRIES `!suppressedByCooldown`, and that
  // is load-bearing rather than incidental. A suppressed mount that wrote
  // anyway would push the deadline another 24 hours out on every back-gesture
  // return, so a member who navigates that way would never be asked again,
  // silently and permanently. That is the worst outcome available here, and it
  // is why there is exactly one write site and it sits behind this flag.
  //
  // `now` is the server render's clock arriving as a prop, never new Date(), so
  // the stored instant never depends on the device's own clock. It is in the
  // dependency array because it is genuinely read here; the trigger is still
  // `showing`. A fresh server render while the sheet is open rewrites the same
  // cookie a few moments later, which is harmless: the member is looking at the
  // sheet at that moment, so that is when the cooldown should start.
  //
  // Development StrictMode runs this twice. The second write is the same value
  // to the same cookie, so there is deliberately no guard for it.
  useEffect(() => {
    if (!showing) return
    markEmailAskShown(now)
  }, [showing, now])

  // Focus and the page's scroll, taken on open and given back on close. Both
  // halves live in one effect because both are borrowed from the page and both
  // have to be returned by the same exit, however the sheet is dismissed.
  useEffect(() => {
    if (!showing) return
    returnFocusTo.current = document.activeElement
    sheetRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
      const back = returnFocusTo.current
      // isConnected, because the element that had focus may well have been
      // unmounted while the sheet was up.
      if (back instanceof HTMLElement && back.isConnected) back.focus()
    }
  }, [showing])

  // Escape, and the focus trap. On document rather than on the sheet so a key
  // pressed while focus has escaped (which it should not, but might) still
  // reaches this.
  useEffect(() => {
    if (!showing) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        // Free. See the table in the header comment.
        setAnswered(true)
        return
      }
      if (event.key !== "Tab") return

      const sheet = sheetRef.current
      if (!sheet) return
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        event.preventDefault()
        sheet.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      // The sheet itself counts as "before the first", because that is where
      // focus starts.
      if (event.shiftKey && (active === first || active === sheet)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [showing])

  if (!showing) return null

  /** The worded exit: the member answered, and it counts. */
  function handleDecline() {
    // Off the screen either way. The member said no; refusing to go away
    // because a write failed would be the worst possible reading of that.
    setAnswered(true)
    startTransition(async () => {
      await dismissEmailOfferAction()
    })
  }

  /** The scrim and Escape: gone for now, and nothing is written. */
  function handleLeaveQuietly() {
    setAnswered(true)
  }

  const dismissLabel = activeOffer === "first" ? "Not now" : "No thanks"
  const promptMessage = activeOffer === "first" ? FIRST_ASK : secondAsk(groupName)

  return (
    // The scrim. Fixed rather than absolute so it covers the header too: this
    // element is mounted inside the group home's column, and its DOM position
    // no longer decides where it appears. It stays mounted there because the
    // same `canPost` guard that wraps the composer is the guard this needs.
    //
    // The target check is what separates a tap on the scrim from a tap that
    // started inside the sheet and bubbled up here.
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) handleLeaveQuietly()
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        backgroundColor: "rgba(8,9,13,.70)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={eyebrowId}
        // -1 so the sheet can hold focus on open without joining the tab order.
        tabIndex={-1}
        style={{
          width: "100%",
          // A FLOOR, not a height. The second ask is the tall case and grows
          // past this; beyond the page, max-height plus the scrolling pad below
          // lengthen the scroll rather than pushing Save off the screen.
          minHeight: "65%",
          maxHeight: "100%",
          backgroundColor: "var(--surface-low)",
          borderTop: "1px solid var(--hairline)",
          borderRadius: "22px 22px 0 0",
          boxShadow: "0 -20px 44px rgba(0,0,0,.48)",
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* The grab bar. It says "sheet"; it does not drag (see the header). */}
        <div
          aria-hidden="true"
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            backgroundColor: "var(--hairline)",
            margin: "9px auto 0",
            flex: "0 0 auto",
          }}
        />

        {/* The pad scrolls inside the sheet, which is what keeps Save reachable
            at an enlarged device text size instead of clipping it. */}
        <div
          style={{
            padding: "4px 18px 20px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <EmailAttachFlow
            promptMessage={promptMessage}
            cancelLabel={dismissLabel}
            onCancel={handleDecline}
            variant="sheet"
            // The way off the done step. It writes NOTHING: saving an address
            // answers the offer by succeeding, and counting a decline here
            // would spend an ask on the one member who said yes. Without it the
            // done step has no control at all and the scroll lock plus the
            // scrim trap them; see EmailAttachFlow's onDone for the full story.
            onDone={handleLeaveQuietly}
            // Throws the latch. Captured as the offer that was live at this
            // moment rather than as a boolean, so the sheet cannot switch from
            // the first ask's wording to the second's underneath a member who
            // is mid-read.
            onAttached={() => setAttachedUnder(offer)}
            messageSlot={(message) => (
              // Round 10's labeled note. Grid, never a float: the mark occupies
              // its own column and spans both rows, so every line of copy
              // shares one left edge however long the ask runs.
              <div
                style={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 14,
                  padding: "15px 16px 17px",
                  display: "grid",
                  gridTemplateColumns: "34px 1fr",
                  columnGap: 13,
                }}
              >
                <span
                  style={{
                    gridColumn: 1,
                    gridRow: "1 / span 2",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "1.5px solid var(--text-primary)",
                    backgroundColor: "var(--surface-base)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    filter: "drop-shadow(0 0 9px rgba(164,239,78,.28))",
                  }}
                >
                  <OrbitMark size={26} label={null} />
                </span>
                <span
                  id={eyebrowId}
                  style={{
                    gridColumn: 2,
                    gridRow: 1,
                    alignSelf: "center",
                    minHeight: 34,
                    display: "flex",
                    alignItems: "center",
                    fontSize: "var(--type-eyebrow)",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-secondary)",
                    fontWeight: 700,
                  }}
                >
                  A note from Orbit
                </span>
                <p
                  style={{
                    gridColumn: 2,
                    gridRow: 2,
                    margin: "7px 0 0",
                    // 17px, up from the 15px the inline note used. The sheet
                    // has the room, and this is the sentence the whole element
                    // exists to get read.
                    fontSize: "var(--type-body)",
                    lineHeight: "var(--leading-normal)",
                    color: "var(--text-primary)",
                    textWrap: "pretty",
                  }}
                >
                  {message}
                </p>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  )
}
