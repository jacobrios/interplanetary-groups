"use client"

// src/components/InstallHintSheet.tsx
//
// The how-to for putting Orbit on an iPhone home screen: three pictured steps
// in a bottom sheet, with one outlined button pinned to the bottom.
//
// Its modal behaviour is copied from src/app/groups/[id]/EmailAskNote.tsx, the
// product's first modal, whose header documents each decision (focus goes to
// the sheet, not a field; focus is trapped; scroll is locked and the previous
// value handed back; scrim tap and Escape both leave). Read that before
// changing any of it here. This sheet keeps no state of its own about being
// seen: whoever renders it decides that and calls onClose.
//
// The button is pinned and the steps scroll above it, so at large text sizes or
// on a small phone the way out is always on screen.
//
// Step rows are a flex row so wrapped text aligns under the text, never under
// the number. The lime rings are Orbit pointing at the control; nothing here is
// teal because nothing here is a primary action.
//
// Bottom padding uses the shared email-ask-safe-bottom class rather than an
// inline calc(): jsdom throws on a longhand padding holding an unresolved
// calc(), and the class already adds the home-bar inset.

import { useId, type ReactNode } from "react"
import { useModalSheet } from "./useModalSheet"

export interface InstallHintSheetProps {
  browser: "safari" | "chrome"
  buttonLabel: string
  onClose: () => void
}

type Ring =
  | { kind: "circle"; cx: number; cy: number; d: number }
  | { kind: "box"; inset: number; top: number; height: number }

interface Step {
  text: ReactNode
  src: string
  alt: string
  /** Width / height of the picture, so the box reserves space before load. */
  ratio: string
  ring: Ring
}

const VIEW_MORE_RING: Ring = { kind: "circle", cx: 87.75, cy: 28.2, d: 20 }

function stepsFor(browser: "safari" | "chrome"): Step[] {
  const first: Step =
    browser === "safari"
      ? {
          text: (
            <>
              Tap the <strong>Share</strong> button at the bottom.
            </>
          ),
          src: "/install-hint/safari-share.png",
          alt: "Safari's toolbar with the Share button circled",
          ratio: "923 / 285",
          ring: { kind: "circle", cx: 47, cy: 73, d: 12 },
        }
      : {
          text: (
            <>
              Tap the <strong>Share</strong> button in the address bar.
            </>
          ),
          src: "/install-hint/chrome-share.png",
          alt: "Chrome's address bar with the Share button circled",
          ratio: "923 / 140",
          ring: { kind: "circle", cx: 91.5, cy: 50, d: 11 },
        }
  return [
    first,
    {
      text: (
        <>
          Tap <strong>View More</strong>.
        </>
      ),
      src: `/install-hint/${browser}-view-more.png`,
      alt: `The ${browser === "safari" ? "Safari" : "Chrome"} share menu with View More circled`,
      ratio: "800 / 340",
      ring: VIEW_MORE_RING,
    },
    {
      text: (
        <>
          Scroll down, tap <strong>Add to Home Screen</strong>.
        </>
      ),
      src: "/install-hint/add-to-home-screen.png",
      alt: "The Add to Home Screen row highlighted in the share menu",
      ratio: "790 / 95",
      ring: { kind: "circle", cx: 7.85, cy: 55, d: 10.5 },
    },
  ]
}

function ringStyle(ring: Ring): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    border: "3px solid var(--lime)",
    pointerEvents: "none",
    boxSizing: "border-box",
  }
  if (ring.kind === "circle") {
    return {
      ...base,
      left: `${ring.cx}%`,
      top: `${ring.cy}%`,
      width: `${ring.d}%`,
      // Diameter is a share of the WIDTH, so height comes from the box's aspect
      // ratio, keeping it round on every picture.
      aspectRatio: "1 / 1",
      transform: "translate(-50%, -50%)",
      borderRadius: "50%",
    }
  }
  return {
    ...base,
    left: `${ring.inset}%`,
    right: `${ring.inset}%`,
    top: `${ring.top}%`,
    height: `${ring.height}%`,
    borderRadius: 12,
  }
}

export default function InstallHintSheet({
  browser,
  buttonLabel,
  onClose,
}: InstallHintSheetProps) {
  const headingId = useId()
  const sheetRef = useModalSheet(onClose)

  const steps = stepsFor(browser)

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
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

        {/* Scrolls; the button below does not. */}
        <div
          style={{
            padding: "10px 18px 0",
            overflowY: "auto",
            minHeight: 0,
            flex: "1 1 auto",
          }}
        >
          <h2
            id={headingId}
            style={{
              margin: "2px 0 16px",
              // 1.125rem (18px) is between --type-meta and --type-heading and
              // has no token; kept literal on purpose (no new token). Measured
              // to fit one row at 390pt.
              fontSize: "1.125rem",
              lineHeight: "var(--leading-tight)",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            Follow the 3 steps below to add its icon.
          </h2>

          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {steps.map((step, i) => (
              <li key={step.src} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      backgroundColor: "var(--surface-raised)",
                      border: "1px solid var(--hairline)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--type-meta)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      flex: "1 1 0",
                      minWidth: 0,
                      fontSize: "var(--type-body)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {step.text}
                  </span>
                </div>
                {/* Frame: sits under the step text (36 = number 24 + gap 12), not the
                    number, and lifts the picture off the sheet. */}
                <div
                  style={{
                    marginTop: 8,
                    marginLeft: 36,
                    padding: 8,
                    backgroundColor: "var(--surface-base)",
                    borderRadius: 14,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      border: "1px solid var(--hairline)",
                      borderRadius: 10,
                      overflow: "hidden",
                      aspectRatio: step.ratio,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.src}
                      alt={step.alt}
                      style={{ display: "block", width: "100%", height: "100%" }}
                    />
                    <span aria-hidden="true" style={ringStyle(step.ring)} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div
          // The class owns bottom and side padding (with !important), so only
          // the top is set inline. Reused for its home-bar and notch insets.
          className="email-ask-safe-bottom"
          style={{
            paddingTop: 20,
            marginTop: 4,
            borderTop: "1px solid var(--hairline)",
            flex: "0 0 auto",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              minHeight: 48,
              borderRadius: 26,
              border: "1.6px solid var(--hairline)",
              backgroundColor: "transparent",
              color: "var(--text-primary)",
              fontSize: "var(--type-body)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
