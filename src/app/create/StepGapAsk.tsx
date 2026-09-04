// src/app/create/StepGapAsk.tsx
//
// The gap-ask step (mockup screen 03): the playback card with a lime marker
// on the one gap, Orbit's question in a feed-style bubble, and a message
// input with example answers as hint text. Presentational — the wizard owns
// state and the merge call.
//
// Recorded deviations, per the approved plan: the name row is read-only
// here (each merge round can return a new suggestion, which would silently
// overwrite a mid-loop edit; renaming lives on Step 2), and the send button
// follows the ChatInput recipe (neutral when empty, teal when typed) — lime
// is Orbit's gap-prompt cue on the marker, never a button. The card shows
// no confirm affordance: while a gap is open, the answer is the one action.

"use client"

import { useEffect, useRef } from "react"
import type { GapPayload } from "@/app/actions/extract-group"
import { GAP_HINT_EXAMPLES, gapBubbleLine } from "@/lib/orbit/gap"
import { formatGapRhythmRow, formatRhythmRow } from "@/lib/orbit/playback"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"
import OrbitPause from "./OrbitPause"
import { OrbitBubble } from "@/components/OrbitBubble"
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

/** Which flavor of failure the last merge attempt hit. "generic" keeps the
 * old one-size retry line; the other two carry the honest reason. */
export type MergeErrorKind = "generic" | ModelFailureReason

interface Props {
  founderName: string
  gap: GapPayload
  round: number
  /** Last answer moved nothing: the lead-in acknowledges instead of thanks. */
  stalled: boolean
  answer: string
  onAnswerChange: (v: string) => void
  onSubmit: () => void
  onEditDescription: () => void
  isMerging: boolean
  mergeError: MergeErrorKind | null
}

export default function StepGapAsk({
  founderName,
  gap,
  round,
  stalled,
  answer,
  onAnswerChange,
  onSubmit,
  onEditDescription,
  isMerging,
  mergeError,
}: Props) {
  const gapRow = formatGapRhythmRow(gap.rhythms[0], gap.missing, gap.candidateTimeLocal)
  const hasText = answer.trim().length > 0
  const bubbleLine = gapBubbleLine(gap.question, round, stalled)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Runs on every value change, whichever direction: growing while the
  // founder types past one line, shrinking back when the answer is cleared
  // (a fresh merge round, or the wizard moving on).
  useEffect(() => {
    const el = textareaRef.current
    if (el) autoGrow(el)
  }, [answer])

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
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

      {/* Orbit's question: deterministic lead-in composed by code around the
          one validated (or fire-exit template) sentence. */}
      <div style={{ width: "100%", marginBottom: "1.5rem" }}>
        <OrbitBubble>
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {bubbleLine}
          </p>
        </OrbitBubble>
      </div>

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
          disabled={isMerging}
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

      {/* One line below the input: hint examples normally, the labeled pause
          while the one merge call per answer runs. */}
      <div style={{ marginTop: "0.5rem", minHeight: "2.75rem" }}>
        {isMerging ? (
          <OrbitPause copy={MERGE_PAUSE_COPY} />
        ) : (
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
        )}
      </div>

      <button
        type="button"
        onClick={onEditDescription}
        disabled={isMerging}
        style={{
          display: "block",
          margin: "1rem auto 0",
          background: "none",
          border: "none",
          padding: "0.25rem 0.5rem",
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          textDecoration: "underline",
          cursor: isMerging ? "not-allowed" : "pointer",
        }}
      >
        Edit my description
      </button>
    </div>
  )
}
