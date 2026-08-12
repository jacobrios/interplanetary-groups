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

import type { GapPayload } from "@/app/actions/extract-group"
import { GAP_HINT_EXAMPLES, gapBubbleLine } from "@/lib/orbit/gap"
import { formatGapRhythmRow, formatRhythmRow } from "@/lib/orbit/playback"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"
import OrbitPause from "./OrbitPause"

const MERGE_PAUSE_COPY = "One sec, I'm updating your schedule."

// Same soft-retry contract and copy as Step 1's extraction error.
const MERGE_ERROR_COPY = "Hmm, that didn't go through. Give it another try in a moment."

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

const rowLabelStyle: React.CSSProperties = {
  fontSize: "var(--type-eyebrow)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: 0,
}

const rowValueStyle: React.CSSProperties = {
  fontSize: "var(--type-body)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-primary)",
  margin: 0,
}

function OrbitAvatar() {
  return (
    <div
      aria-label="Orbit"
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        backgroundColor: "var(--lime)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 700,
        color: "#0a0a0a",
        marginTop: "0.25rem",
      }}
    >
      O
    </div>
  )
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

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Playback card: same feed-style Orbit bubble chrome as Step 2, minus
          the confirm affordance. The gapped primary is always row zero. */}
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "1rem" }}
      >
        <OrbitAvatar />
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            borderRadius: "4px 16px 16px 16px",
            padding: "0.75rem 1rem",
            flex: 1,
          }}
        >
          {gap.groupName !== null && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p style={rowLabelStyle}>Group name</p>
              <p
                style={{
                  fontSize: "var(--type-heading)",
                  lineHeight: "var(--leading-tight)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: "0.125rem 0 0",
                }}
              >
                {gap.groupName}
              </p>
            </div>
          )}

          <div style={{ marginBottom: "0.5rem" }}>
            <p style={rowLabelStyle}>Who</p>
            <p style={rowValueStyle}>{founderName}</p>
          </div>

          {/* The gapped row: known part plus the lime-underlined marker Orbit
              is pointing at. Lime here is the gap-prompt cue, not an action. */}
          <div style={{ marginBottom: gap.rhythms.length > 1 ? "0.5rem" : 0 }}>
            <p style={{ ...rowLabelStyle, color: "var(--lime)" }}>{gapRow.label}</p>
            <p style={rowValueStyle}>
              {gapRow.known !== null && <>{gapRow.known} </>}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontStyle: "italic",
                  color: "var(--text-secondary)",
                  borderBottom: "2px solid var(--lime)",
                  padding: "0 3px 1px",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {gapRow.marker}
              </span>
            </p>
          </div>

          {gap.rhythms.slice(1).map((r, i) => {
            const row = formatRhythmRow(r)
            return (
              <div
                key={i}
                style={{ marginBottom: i === gap.rhythms.length - 2 ? 0 : "0.5rem" }}
              >
                <p style={rowLabelStyle}>{row.label}</p>
                <p style={rowValueStyle}>{row.value}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Orbit's question: deterministic lead-in composed by code around the
          one validated (or fire-exit template) sentence. */}
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "1.5rem" }}
      >
        <OrbitAvatar />
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            borderRadius: "4px 16px 16px 16px",
            padding: "0.75rem 1rem",
          }}
        >
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
        </div>
      </div>

      {mergeError && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
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
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <label htmlFor="gapAnswer" style={{ display: "none" }}>
          Message Orbit
        </label>
        <input
          id="gapAnswer"
          type="text"
          autoComplete="off"
          placeholder="Message Orbit"
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          disabled={isMerging}
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "1.5rem",
            color: "var(--text-primary)",
            fontSize: "var(--type-body)",
            outline: "none",
            caretColor: "var(--action)",
          }}
        />

        {/* Send arrow: dim when empty, teal when the founder has typed. */}
        <button
          type="submit"
          disabled={!hasText || isMerging}
          aria-label="Send answer"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: hasText && !isMerging ? "pointer" : "default",
            flexShrink: 0,
            alignSelf: "center",
            transition: "color 0.15s ease",
            color: hasText ? "var(--action)" : "var(--placeholder)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 16V4M10 4L5 9M10 4L15 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
              fontSize: "var(--type-eyebrow)",
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
