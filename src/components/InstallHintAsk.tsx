"use client"

// src/components/InstallHintAsk.tsx
//
// The small arrival sheet: "Use Orbit like an app?" with two equal choices. It
// is the question; InstallHintSheet is the answer ("Show me" hands over to it).
// Arriving on the group home with the full three-step sheet was too much, so
// the first thing a member meets is this short ask sized to its content.
//
// Modal mechanics are the same as InstallHintSheet's, itself copied from
// src/app/groups/[id]/EmailAskNote.tsx, the product's first modal, whose header
// documents each decision (focus goes to the sheet, not a field; focus is
// trapped; scroll is locked and the previous value handed back; scrim tap and
// Escape both leave). Read that before changing any of it here. The scrim is
// lighter than the steps sheet's so the group stays readable behind a small ask.
//
// The two buttons are equal weight and neither is teal: an open question never
// leans. "Not now" swaps to a closing note ("No problem. You can find the steps anytime:"
// with two numbered rows) rather than closing; only "Got it" (or the direct exits:
// Escape and scrim tap) closes. Escape and the scrim stay direct exits from both states,
// free and without a note. Focus moves to the sheet on the swap, keeping it trapped.
// Bottom padding uses the shared email-ask-safe-bottom class (home-bar inset), with only
// the top set inline, as in InstallHintSheet.

import { useEffect, useId, useState, type CSSProperties } from "react"
import { useModalSheet } from "./useModalSheet"
import { OrbitMark } from "./OrbitMark"
import StepNumber from "./StepNumber"

export interface InstallHintAskProps {
  onShowMe: () => void
  onClose: () => void
}

const BUTTON: CSSProperties = {
  // "0px" rather than a bare 0: identical in a browser, but jsdom drops the
  // bare form, which would leave the equal-width guarantee untestable.
  flex: "1 1 0px",
  minWidth: 140,
  minHeight: 48,
  borderRadius: 26,
  border: "1.6px solid var(--hairline)",
  backgroundColor: "transparent",
  color: "var(--text-primary)",
  fontSize: "var(--type-body)",
  fontWeight: 700,
  cursor: "pointer",
}

export default function InstallHintAsk({ onShowMe, onClose }: InstallHintAskProps) {
  const headingId = useId()
  const sheetRef = useModalSheet(onClose)
  // "Not now" swaps the content for a closing note rather than closing; only
  // "Got it" (or a free exit: Escape, scrim) closes. Local on purpose: the
  // caller's once-only rules never see this state.
  const [note, setNote] = useState(false)
  // The focused "Not now" button unmounts with the swap, which would drop focus
  // to <body>, outside the modal. Put it back on the sheet, as at mount.
  useEffect(() => {
    if (note) sheetRef.current?.focus()
  }, [note, sheetRef])

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        backgroundColor: "rgba(8,9,13,.45)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        style={{
          width: "100%",
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

        <div
          // The class owns bottom and side padding (with !important); only the
          // top is set inline. Reused for its home-bar and notch insets.
          className="email-ask-safe-bottom"
          style={{ paddingTop: 12 }}
        >
          {note ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: "0 0 auto", display: "flex" }}>
                  <OrbitMark size={36} label={null} />
                </div>
                <h2
                  id={headingId}
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    margin: 0,
                    fontSize: "var(--type-body)",
                    lineHeight: "var(--leading-tight)",
                    fontWeight: 400,
                    color: "var(--text-primary)",
                  }}
                >
                  No problem. You can find the steps anytime:
                </h2>
              </div>
              <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
                {[
                  "Tap the group's name at the top of the screen",
                  "Look under \u201COn your phone\u201D",
                ].map((text, i) => (
                  <li
                    key={text}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      marginTop: i === 0 ? 0 : 8,
                    }}
                  >
                    <StepNumber n={i + 1} />
                    <span
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        fontSize: "var(--type-meta)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {text}
                    </span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={onClose}
                style={{ ...BUTTON, flex: "0 0 auto", width: "100%", marginTop: 16 }}
              >
                Got it
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: "0 0 auto", display: "flex" }}>
                  <OrbitMark size={36} label={null} />
                </div>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <h2
                    id={headingId}
                    style={{
                      margin: 0,
                      fontSize: "var(--type-heading)",
                      lineHeight: "var(--leading-tight)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    Use Orbit like an app?
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "var(--type-meta)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Add it as an icon to your home screen.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={onShowMe} style={BUTTON}>
                  Show me
                </button>
                <button type="button" onClick={() => setNote(true)} style={BUTTON}>
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
