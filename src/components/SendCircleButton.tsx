// src/components/SendCircleButton.tsx
//
// The send circle, shared by the group chat composer (ChatInput) and the
// onboarding gap-ask input (StepGapAsk). Both drew it independently, SVG and
// all, differing only in size; polish slice two made them agree on the
// design's 40px, at which point the second copy was pure duplication.
//
// Two states, per walkthrough.css's last word on .gh-send / .s2r-send (the
// REFINEMENT PASS block, lines 694-697), which governs both selectors
// together:
// - resting (nothing to send): raised fill, hairline border, faint arrow.
// - active (there is text): teal fill, teal border, dark arrow.
// The border is 1px in both states and only its colour switches, so the
// circle can never change size when the state flips. Sending is an action
// that matters, which is what earns the teal; it is contextual, live only
// while composing, so it is not a second persistent primary action.
//
// Presentational, no hooks, so no "use client" directive is needed and the
// component stays server-compatible.

interface Props {
  /** There is something to send: the circle fills teal. */
  active: boolean
  /** Not pressable right now (nothing to send, or a send in flight). */
  disabled: boolean
  /** Accessible name; the two surfaces name the same act differently. */
  label: string
}

export default function SendCircleButton({ active, disabled, label }: Props) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: active ? "1px solid var(--action)" : "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
        backgroundColor: active ? "var(--action)" : "var(--surface-raised)",
        color: active ? "var(--action-ink)" : "var(--text-faint)",
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
  )
}
