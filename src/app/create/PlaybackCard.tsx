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
import { Clock } from "@/components/glyphs"

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
 * hidden` above), which is what makes Step2Playback's confirm button read
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
 * gapped rhythm), which colors the key lime, the row-level counterpart to
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
    // The stylesheet's fixed 62px key column assumes short labels (WHO,
    // GROUP NAME), but a rhythm row's label is the founder's own activity
    // word uppercased (up to two words, see formatRhythmRow), and CLIMBING
    // at 13px with 0.12em tracking needs 77px. A fixed 62px forced it to
    // break mid-word ("CLIMBI / NG") at the exact moment the founder is
    // asked to confirm Orbit read them right.
    //
    // min-content plus a 62px floor gives each label the narrowest width it
    // can take without breaking a word: a label with a space in it (GROUP
    // NAME) still wraps inside the design's 62px column and keeps the
    // card's rhythm, while a single word that cannot wrap widens the column
    // instead of being cut in half ("layout grows with content, never
    // clips"). Measured at 375px: WHO and GROUP NAME hold 62px, PICKLEBALL
    // takes 94px, and the value column stays on one line in all three.
    width: "min-content",
    minWidth: "62px",
    flex: "0 0 auto",
    // Ceiling so a pathological label can never push the value column out
    // of the row (the card hides its overflow, and clipping is the one
    // outcome the layout rule forbids). The row is 281px at a 375px
    // viewport, so 60% is about 17 characters: every plausible activity
    // word clears it (MOUNTAINEERING lands at 139px on one line, leaving
    // the value 130px). break-word applies only past the ceiling, where
    // breaking a made-up 20-letter word beats clipping it.
    maxWidth: "60%",
    overflowWrap: "break-word",
    // --ink-faint in the stylesheet is #A7AAB6, which is this project's
    // --text-secondary (#A7AAB6), not --text-faint (#8D91A2, a dimmer
    // gray). The stylesheet's own inline comment on --ink-faint says as
    // much: it names the token a retired dim gray now standing in for
    // secondary.
    color: pending ? "var(--lime)" : "var(--text-secondary)",
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
 * The group-name row: full width, the label stacked above the value rather
 * than beside it in the narrow key column every other row uses. The name is
 * the card's headline and the widest label in the deck ("GROUP NAME"), which
 * used to wrap onto two lines squeezed into the 62px key column next to a
 * large bold input, the ugliest thing on the card (owner phone QA, polish
 * slice two). Stacking removes the wrap without touching what makes the row
 * a row: it still sits inside the card's own row list, keeps the same
 * top/bottom padding and hairline divider as every other row, and (via
 * `htmlForLabel`) still renders a real `<label>` over an editable input on
 * Step 2, or a plain key over read-only text on the gap-ask, exactly as
 * `PlaybackRow` did before this. Editability itself is unchanged: this
 * component only reorders the label and the value, it does not decide
 * whether the value is an input or a paragraph, so the group-name input on
 * Step 2 keeps its own box and stays obviously tappable. `isLast` drops the
 * divider and tightens the bottom padding, matching `PlaybackRow`'s own
 * last-row rule; both current call sites always have a WHO row after this
 * one, so `isLast` defaults to false and neither screen's rendering changes.
 */
export function PlaybackNameRow({
  htmlForLabel,
  isLast = false,
  children,
}: {
  htmlForLabel?: string
  isLast?: boolean
  children: ReactNode
}) {
  const nameKeyStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "var(--type-eyebrow)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "var(--text-secondary)",
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        paddingTop: "9px",
        paddingBottom: isLast ? "2px" : "9px",
        borderBottom: isLast ? "none" : "1.4px solid var(--hairline)",
      }}
    >
      {htmlForLabel ? (
        <label htmlFor={htmlForLabel} style={nameKeyStyle}>
          Group name
        </label>
      ) : (
        <p style={nameKeyStyle}>Group name</p>
      )}
      {children}
    </div>
  )
}

/**
 * The "what time?" style marker Orbit points at a missing field: a dashed
 * lime underline and a lime clock glyph around whatever prompt text the
 * caller passes (the marker's icon is lime; its text stays the row's
 * ordinary secondary color, per the color rules: lime marks the cue, not
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
      <Clock size={12} stroke="var(--lime)" strokeWidth={2} />
      {children}
    </span>
  )
}
