// The onboarding wizard's header (handoff S2Header): Orbit's avatar and name
// with "Step N of 3" beneath, and a back chevron only where back is real.

"use client"

import Chevron from "./Chevron"
import { OrbitMark } from "@/components/OrbitMark"

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
            justifyContent: "flex-start",
            width: "20px",
            height: "30px",
            marginRight: "-3px",
            marginLeft: "-4px",
          }}
        >
          <Chevron direction="left" />
        </button>
      )}
      {/* label={null}: the visible "Orbit" text sits right next to the mark,
          so the default accessible label would make a screen reader announce
          it twice. Same precedent as OrbitNoteScreen.
          size=44 (was 36): the mark draws at 156% of this slot with position
          absolute and overflow visible by default, so growing the slot does
          not clip the orbit path (verified in-browser, see task-7 report). */}
      <OrbitMark size={44} label={null} />
      <div>
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            // 800, per walkthrough.css .s2-top .nm (line 102). Geist is
            // loaded as a variable font through next/font, so 800 is a real
            // weight here rather than a synthesized one. This is the Orbit
            // wordmark, not a group name.
            fontWeight: 800,
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
