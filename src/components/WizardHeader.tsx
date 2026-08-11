// The onboarding wizard's header (handoff S2Header): Orbit's avatar and name
// with "Step N of 3" beneath, and a back chevron only where back is real.
// The avatar is the product's letter-O placeholder, same as OrbitBubble; the
// real mascot face is queued for the visual-polish pass (spec decision).

"use client"

import Chevron from "./Chevron"

interface Props {
  step: 1 | 2 | 3
  /** Present only where back is real; step 3 never passes it (the group exists). */
  onBack?: () => void
}

export function WizardHeader({ step, onBack }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1.5rem",
      }}
    >
      {onBack && (
        <button
          aria-label="Back"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Chevron direction="left" />
        </button>
      )}
      <div
        aria-label="Orbit"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          backgroundColor: "var(--color-lime)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "#0a0a0a",
        }}
      >
        O
      </div>
      <div>
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Orbit
        </p>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 600,
            margin: "0.125rem 0 0",
          }}
        >
          Step {step} of 3
        </p>
      </div>
    </div>
  )
}
