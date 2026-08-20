// src/components/TailedOrbitBubble.tsx
//
// Orbit's tailed bubble: no avatar, left-margin position, small tail
// pointing up at the header's own Orbit mark (the onboarding header
// exception, build-notes §7). Extracted from Step1Describe.tsx (polish
// slice two phone QA: step 2's header mark and its own bubble avatar were
// stacking as two Orbit faces) so both onboarding steps that sit directly
// under the header share one implementation instead of a hand-copied tail
// drifting apart in two files.
//
// Two stacked triangles (back in --hairline, front in --surface-raised) so
// the tail reads as a hairline continuation of the bubble's own border, per
// walkthrough.css .s2r-msg-tail::before/::after. The decorative triangles
// are aria-hidden; the header's own Orbit mark (rendered by the caller,
// outside this component) is what still carries the accessible "Orbit"
// name, so no accessible name is lost by dropping the avatar here.
//
// Presentational only, no hooks, so it needs no "use client" directive and
// stays server-compatible.

import type { ReactNode } from "react"

export function TailedOrbitBubble({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -11,
          left: 18,
          width: 0,
          height: 0,
          borderLeft: "9px solid transparent",
          borderRight: "9px solid transparent",
          borderBottom: "13px solid var(--hairline)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -10,
          left: 19,
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderBottom: "12px solid var(--surface-raised)",
        }}
      />
      <div
        style={{
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--hairline)",
          borderRadius: "16px 16px 16px 5px",
          padding: "12px 14px",
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
