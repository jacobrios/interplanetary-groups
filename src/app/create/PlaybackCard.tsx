// src/app/create/PlaybackCard.tsx
//
// The playback card: the schedule-row treatment shared by Step2Playback and
// StepGapAsk (walkthrough.css .cardX / .s2-srow / .s2-gap, task 4 of polish
// slice two). Both screens list the same key/value rows and use the same
// lime gap marker for a missing field; only the confirm band (.cfA) is
// Step2Playback's own, since StepGapAsk shows no confirm affordance while a
// gap is open (see that file's own header comment).
//
// Rows are laid out with inline styles rather than the stylesheet's
// `:last-child` selector, so "is this the last row" is an explicit prop
// here rather than DOM position: a screen may render a footnote (the
// timezone reference line) or an error message after the row list without
// that content silently becoming "the last row" and losing its divider.
//
// Presentational only, no hooks, so it needs no "use client" directive and
// stays server-compatible.

import type { ReactNode } from "react"

const cardOuterStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-raised)",
  border: "1.7px solid var(--hairline)",
  borderRadius: "14px",
  maxWidth: "96%",
  marginBottom: "16px",
  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  overflow: "hidden",
}

const cardPadStyle: React.CSSProperties = {
  padding: "13px 15px 12px",
}

/**
 * The card shell. `footer`, when given, renders full-bleed below the padded
 * content (edge to edge, clipped to the card's own corners by `overflow:
 * hidden` above) — that is what makes Step2Playback's confirm button read
 * as a band on the card rather than a button floating beneath it.
 */
export function PlaybackCard({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div style={cardOuterStyle}>
      <div style={cardPadStyle}>{children}</div>
      {footer}
    </div>
  )
}

/** Shared value-text style for a row whose value is plain text (as opposed
 * to an input or a tap-to-reveal control, which style themselves). */
export const rowValueTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--type-meta)",
  color: "var(--text-primary)",
  lineHeight: "var(--leading-normal)",
}

/**
 * One key/value row. `pending` marks the row Orbit is waiting on (the
 * gapped rhythm), which colors the key lime — the row-level counterpart to
 * `PlaybackGapMarker` coloring the value. `isLast` drops the divider and
 * tightens the bottom padding, matching the card's own last-row rule.
 * `htmlForLabel` swaps the key from a `<p>` to a real `<label>` when the
 * value is an input (the group-name row), preserving its accessible name.
 */
export function PlaybackRow({
  label,
  pending = false,
  isLast = false,
  htmlForLabel,
  children,
}: {
  label: string
  pending?: boolean
  isLast?: boolean
  htmlForLabel?: string
  children: ReactNode
}) {
  const keyStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "var(--type-eyebrow)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
    width: "62px",
    flex: "0 0 auto",
    // The stylesheet's fixed 62px key column assumes short labels (WHO,
    // BEERS); a longer single-word activity (CLIMBING) has no space to
    // wrap and would otherwise overflow into the value column with no
    // visible gap. Wrapping mid-word here keeps every label inside its
    // own column (the "layout grows with content, never clips" rule),
    // which is not itself in the stylesheet since its own vocabulary
    // never produced a label this long.
    overflowWrap: "break-word",
    color: pending ? "var(--lime)" : "var(--text-faint)",
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        alignItems: "baseline",
        paddingTop: "9px",
        paddingBottom: isLast ? "2px" : "9px",
        borderBottom: isLast ? "none" : "1.4px solid var(--hairline)",
      }}
    >
      {htmlForLabel ? (
        <label htmlFor={htmlForLabel} style={keyStyle}>
          {label}
        </label>
      ) : (
        <p style={keyStyle}>{label}</p>
      )}
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>{children}</div>
    </div>
  )
}

/**
 * The "what time?" style marker Orbit points at a missing field: a dashed
 * lime underline and a lime clock glyph around whatever prompt text the
 * caller passes (the marker's icon is lime; its text stays the row's
 * ordinary secondary color, per the color rules — lime marks the cue, not
 * the sentence).
 */
export function PlaybackGapMarker({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontStyle: "italic",
        color: "var(--text-secondary)",
        borderBottom: "2px dashed var(--lime)",
        padding: "0 3px 1px",
        marginLeft: "2px",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--lime)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {children}
    </span>
  )
}
