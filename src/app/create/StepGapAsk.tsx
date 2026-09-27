// src/app/create/StepGapAsk.tsx
//
// The gap-ask step (mockup screen 03): the playback card with a lime marker
// on the one gap, the conversation so far (Orbit's questions in feed-style
// bubbles, the founder's answers in their own), and a message input with
// example answers as hint text. Presentational — the wizard owns state, the
// thread, and the merge call (gap-ask-thread slice, task 3: the whole
// conversation stays on screen, so a founder's answer no longer vanishes
// the moment they send it). It renders two siblings for the wizard's
// full-height column (task 4): a scrolling middle holding the card and the
// thread, and a pinned bottom holding the composer.
//
// Recorded deviations, per the approved plan: the name row is read-only
// here (each merge round can return a new suggestion, which would silently
// overwrite a mid-loop edit; renaming lives on Step 2), and the send button
// follows the ChatInput recipe (neutral when empty, teal when typed) — lime
// is Orbit's gap-prompt cue on the marker, never a button. The card shows
// no confirm affordance: while a gap is open, the answer is the one action.
// No "Edit my description" link below the composer either (task 10,
// onboarding-step2-cleanup slice): the wizard header's own back arrow
// already does that, so a second control saying the same thing was
// redundant.

"use client"

import { useEffect, useRef } from "react"
import type { GapPayload } from "@/app/actions/extract-group"
import { GAP_HINT_EXAMPLES } from "@/lib/orbit/gap"
import { formatGapRhythmRow, formatRhythmRow } from "@/lib/orbit/playback"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"
import OrbitPause from "./OrbitPause"
import { OrbitBubble } from "@/components/OrbitBubble"
import { SelfBubble } from "@/components/SelfBubble"
import SendCircleButton from "@/components/SendCircleButton"
import {
  PlaybackCard,
  PlaybackNameRow,
  PlaybackRow,
  PlaybackGapMarker,
  rowValueTextStyle,
} from "./PlaybackCard"

const MERGE_PAUSE_COPY = "One sec, I'm updating your schedule."

// Same soft-retry contract and copy as Step 1's extraction error.
const MERGE_ERROR_COPY = "Hmm, that didn't go through. Give it another try in a moment."

// The composer wraps rather than scrolling sideways (spec:
// docs/superpowers/specs/2026-09-04-chat-input-wrap-design.md), the same fix
// as the group chat's ChatInput. Built from the CSS variable rather than a
// literal 7.5em for the reason ChatInput.tsx's copy of this constant states
// at length: a value copied by eye instead of read live is exactly how this
// project shipped the --ink-faint / --text-faint mixup (polish slice two).
// Not shared with ChatInput.tsx: the two composers differ in fill, border
// and radius by design (spec's own debt note), so a shared component isn't
// obviously right yet; if a third composer appears, extract then.
const MAX_LINES = 5
const LINE_HEIGHT = "var(--leading-normal)"
const MAX_HEIGHT = `calc(${LINE_HEIGHT} * ${MAX_LINES} * 1em)`

// How long to wait for the keyboard to resize the visual viewport before
// lifting the composer anyway. Long enough for iOS's keyboard animation
// (roughly 250ms) to finish, short enough that a founder whose keyboard was
// already up does not see the box jump late. See armKeyboardLift below.
const KEYBOARD_LIFT_FALLBACK_MS = 350

// Same auto-grow-then-shrink logic as ChatInput.tsx's autoGrow: resize to
// content on every value change, which covers both a founder typing past one
// line and the field being cleared out from under it (a merge round starting
// fresh, or the wizard advancing past this step). The border compensation
// matters here specifically: this composer's border (1px solid on every
// side) is what surfaced the bug in the first place, a real browser
// measurement 1.5px short of the input it replaced, because `scrollHeight`
// excludes border while `style.height` on this border-box element does not.
// ChatInput.tsx's own copy carries the full explanation.
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto"
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  el.style.height = `${el.scrollHeight + border}px`
}

/** One line of the gap-ask conversation. Orbit's text is composed once, by
 * the wizard, at the moment the line arrives (gapBubbleLine) and stored, so
 * an earlier line can never re-render with a later round's wording. */
export type GapTurn = { from: "orbit"; text: string } | { from: "founder"; text: string }

// Both voices share one text style: chat body, never shrunk (CLAUDE.md, §7).
const turnTextStyle = {
  fontSize: "var(--type-body)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-primary)",
  margin: 0,
} as const

/** Which flavor of failure the last merge attempt hit. "generic" keeps the
 * old one-size retry line; the other two carry the honest reason. */
export type MergeErrorKind = "generic" | ModelFailureReason

interface Props {
  founderName: string
  gap: GapPayload
  /** The conversation so far, oldest first; always opens with Orbit's
   * round-0 line. */
  thread: GapTurn[]
  answer: string
  onAnswerChange: (v: string) => void
  onSubmit: () => void
  isMerging: boolean
  mergeError: MergeErrorKind | null
}

export default function StepGapAsk({
  founderName,
  gap,
  thread,
  answer,
  onAnswerChange,
  onSubmit,
  isMerging,
  mergeError,
}: Props) {
  const gapRow = formatGapRhythmRow(gap.rhythms[0], gap.missing, gap.candidateTimeLocal)
  const hasText = answer.trim().length > 0
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Runs on every value change, whichever direction: growing while the
  // founder types past one line, shrinking back when the answer is cleared
  // (a fresh merge round, or the wizard moving on).
  useEffect(() => {
    const el = textareaRef.current
    if (el) autoGrow(el)
  }, [answer])

  // The view follows the newest line (task 4): on first arrival, when a
  // line is added, and when Orbit's pause appears or gives way to its
  // reply. Keyed on the length and the flag, both primitives, so a
  // keystroke in the box re-renders without yanking the view (MessageFeed's
  // messages.length precedent). Unlike the group chat this always follows
  // the tail: the founder is in a live one-question exchange, so the newest
  // line is the one they are waiting for, never something they scrolled up
  // away from. The optional call is EditGroupDetails.tsx's precedent: jsdom
  // has no scrollIntoView, and every real browser does.
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" })
  }, [thread.length, isMerging])

  // The first tap into the box (owner's iPhone Chrome pass, 27 Sept 2026).
  // Chrome on iOS floats its address bar just above the keyboard, and iOS's
  // own scroll-the-focused-field-into-view ignores that bar, so on the first
  // focus the composer and the hint line landed partly underneath it. Later
  // rounds already looked right, and that is the clue: after a send, the
  // effect above calls scrollIntoView while the keyboard is up, and
  // scrollIntoView scrolls every scrollable ancestor, the page and the visual
  // viewport included, which lifts the pinned bottom clear of the bar. So the
  // fix does the same thing on focus, aimed at the pinned bottom itself (the
  // composer row AND the hint, so both clear the bar), once the keyboard has
  // actually opened: scrolling before then would measure a viewport the
  // keyboard is about to shrink.
  //
  // "Once the keyboard has opened" is the visual viewport's first resize
  // after focus, since the keyboard is what shrinks it. A fallback timer
  // covers the cases where no resize comes: the keyboard was already up (a
  // re-focus after tapping the send button), a desktop browser with no
  // on-screen keyboard, or a browser with no visualViewport at all. Whichever
  // fires first does the scroll and disarms the other, so it happens once per
  // focus. Blur and unmount disarm both, since this repo's hooks refuse a
  // timer or listener left dangling. Like the effect above, the optional call
  // is for jsdom, which has no scrollIntoView. Verified structurally only:
  // whether the box truly clears Chrome's bar is judged on a real phone.
  const pinnedRef = useRef<HTMLDivElement>(null)
  const disarmKeyboardLift = useRef<(() => void) | null>(null)
  function armKeyboardLift() {
    disarmKeyboardLift.current?.()
    const viewport = typeof window !== "undefined" ? window.visualViewport : undefined
    const lift = () => {
      disarm()
      pinnedRef.current?.scrollIntoView?.({ block: "end" })
    }
    const timer = setTimeout(lift, KEYBOARD_LIFT_FALLBACK_MS)
    viewport?.addEventListener("resize", lift)
    function disarm() {
      clearTimeout(timer)
      viewport?.removeEventListener("resize", lift)
      if (disarmKeyboardLift.current === disarm) disarmKeyboardLift.current = null
    }
    disarmKeyboardLift.current = disarm
  }
  useEffect(() => () => disarmKeyboardLift.current?.(), [])

  return (
    <>
      {/* The scrolling middle: the card and the conversation move together,
          so a long exchange pushes the card up and out of view rather than
          squeezing the thread under it. The composer below is outside this
          region, pinned. The wizard's column gives this its height. */}
      <div
        data-gap-scroll
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 1.5rem" }}
      >
        {/* The playback card (walkthrough.css .cardX / .s2-srow, task 4),
            same treatment as Step2Playback so gap-ask and playback stay
            visually identical apart from the marker below. The gapped
            primary is always row zero. No confirm affordance here: while a
            gap is open, answering Orbit's question is the one action (see
            the header comment). */}
        <div style={{ width: "100%", marginBottom: "1rem" }}>
          <PlaybackCard>
            {gap.groupName !== null && (
              <PlaybackNameRow>
                <p
                  style={{
                    ...rowValueTextStyle,
                    fontSize: "var(--type-heading)",
                    lineHeight: "var(--leading-tight)",
                    fontWeight: 600,
                  }}
                >
                  {gap.groupName}
                </p>
              </PlaybackNameRow>
            )}

            <PlaybackRow label="Who">
              <p style={rowValueTextStyle}>{founderName}</p>
            </PlaybackRow>

            {/* The gapped row: known part plus the lime-underlined marker Orbit
                is pointing at. Lime here is the gap-prompt cue, not an action.
                A captured venue (extraction can capture one alongside a gapped
                day/time — the two are independent fields) is appended inline
                as " · venue", the same suffix the join screen and group info
                page already use for a rhythm's venue (join/[inviteToken]/
                page.tsx, groups/[id]/info/page.tsx). This is read-only: the
                founder edits it on Step 2, not here. Without this, a venue
                Orbit had already captured silently vanished on this card
                (venue-on-playback slice, task 9) — a card headed "Here's what
                I got" must not omit something Orbit got. */}
            <PlaybackRow label={gapRow.label} pending isLast={gap.rhythms.length === 1}>
              <p style={rowValueTextStyle}>
                {gapRow.known !== null && <>{gapRow.known} </>}
                <PlaybackGapMarker>{gapRow.marker}</PlaybackGapMarker>
                {gap.rhythms[0].venueName && <> · {gap.rhythms[0].venueName}</>}
              </p>
            </PlaybackRow>

            {gap.rhythms.slice(1).map((r, i) => {
              const row = formatRhythmRow(r)
              return (
                <PlaybackRow key={i} label={row.label} isLast={i === gap.rhythms.length - 2}>
                  <p style={rowValueTextStyle}>
                    {row.value}
                    {r.venueName && <> · {r.venueName}</>}
                  </p>
                </PlaybackRow>
              )
            })}
          </PlaybackCard>
        </div>

        {/* The conversation: Orbit's lines (each a deterministic lead-in
            composed by code around the one validated or fire-exit sentence,
            composed once by the wizard) and the founder's answers, oldest
            first. Orbit speaks with its avatar; the founder speaks right-
            aligned in the viewer's own bubble, exactly as in the group chat
            (SelfBubble leaves alignment to the caller). Index keys are safe
            here: turns are only ever appended, and the one removal (a failed
            merge rolling its answer back) takes that turn out by identity.
            It is always the newest turn in practice, because the send button
            refuses a second answer mid-merge and the header hides its back
            arrow mid-merge, so nothing else can change the thread while that
            merge runs. While the merge runs, Orbit's labeled pause is the
            thread's last item, where its reply is about to land. */}
        <div
          style={{
            width: "100%",
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {thread.map((turn, i) =>
            turn.from === "orbit" ? (
              <OrbitBubble key={i}>
                <p style={turnTextStyle}>{turn.text}</p>
              </OrbitBubble>
            ) : (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <SelfBubble>
                  <p style={turnTextStyle}>{turn.text}</p>
                </SelfBubble>
              </div>
            )
          )}
          {isMerging && <OrbitPause copy={MERGE_PAUSE_COPY} />}
        </div>
        {/* Scrolled into view by the effect above. After the thread's bottom
            margin, so the newest line settles with breathing room above the
            composer rather than flush against it. */}
        <div ref={endRef} aria-hidden />
      </div>

      {/* The pinned bottom: error line, composer and hint. Grounded with the
          group chat composer's own treatment (ChatInput.tsx: the page
          surface with a darkening scrim toward the bottom edge), reused
          rather than a new value. The bottom padding adds the phone's safe
          area so the hint clears the home indicator. */}
      <div
        ref={pinnedRef}
        data-gap-pinned
        style={{
          flexShrink: 0,
          backgroundColor: "var(--surface-base)",
          backgroundImage: "linear-gradient(0deg, rgba(0,0,0,.34), rgba(0,0,0,0))",
          padding: "0.5rem 1.5rem calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        {mergeError && (
          <p
            style={{
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              color: "var(--danger)",
              marginBottom: "0.75rem",
            }}
          >
            {mergeError === "generic" ? MERGE_ERROR_COPY : UNAVAILABLE_COPY[mergeError]}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (hasText && !isMerging) onSubmit()
          }}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <label htmlFor="gapAnswer" style={{ display: "none" }}>
            Message Orbit
          </label>
          <textarea
            ref={textareaRef}
            id="gapAnswer"
            autoComplete="off"
            placeholder="Message Orbit"
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            onFocus={armKeyboardLift}
            onBlur={() => disarmKeyboardLift.current?.()}
            // Never disabled, even mid-merge: on iOS a disabled field
            // dismisses the keyboard and does not bring it back, the reason
            // the group chat stopped disabling its input (message-send-latency
            // slice one). A second answer is refused by the send button and by
            // the form's submit handler above instead.
            rows={1}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--hairline)",
              borderRadius: 26,
              color: "var(--text-primary)",
              fontSize: "var(--type-body)",
              lineHeight: LINE_HEIGHT,
              outline: "none",
              caretColor: "var(--action)",
              resize: "none",
              maxHeight: MAX_HEIGHT,
              overflowY: "auto",
            }}
          />

          {/* The shared send circle, the same component the group chat
              composer uses. 40px is walkthrough.css .s2r-send (line 146), the
              same size as .gh-send; the 36px this shipped at was an unported
              value. The form centers its children, which is what the old
              inline alignSelf was doing. */}
          <SendCircleButton
            active={hasText}
            disabled={!hasText || isMerging}
            label="Send answer"
          />
        </form>

        {/* One line below the input: the hint examples, always. The merge
            pause used to swap in here; it now sits at the end of the thread,
            where Orbit's reply will appear. */}
        <div style={{ marginTop: "0.5rem", minHeight: "2.75rem" }}>
          <p
            style={{
              textAlign: "center",
              // Meta, not eyebrow: the role map reserves the 13px eyebrow
              // floor for uppercase eyebrows and puts sentence-case
              // reference text at meta, which is where step 1's own hint
              // line already sits.
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              color: "var(--placeholder)",
              margin: "0.375rem 0 0",
            }}
          >
            {GAP_HINT_EXAMPLES[gap.missing]}
          </p>
        </div>
      </div>
    </>
  )
}
