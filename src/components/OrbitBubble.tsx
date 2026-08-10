// src/components/OrbitBubble.tsx
//
// Orbit's chat bubble, extracted from the inline JSX in MessageFeed so any
// surface that speaks in Orbit's voice (the feed, and now the pending-surface
// panel) renders the same avatar + bubble. Styles are copied verbatim from
// the feed (build-notes §7 chat voice system: lime avatar, no name label,
// --surface-orbit fill); this component moves pixels, it does not change
// them.
//
// Presentational only, no hooks, so it needs no "use client" directive and
// stays server-compatible.

import type { ReactNode } from "react"

export function OrbitBubble({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
      <div
        aria-label="Orbit"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          backgroundColor: "var(--color-lime)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: "#0a0a0a",
        }}
      >
        O
      </div>
      <div
        style={{
          backgroundColor: "var(--surface-orbit)",
          borderRadius: "4px 16px 16px 16px",
          padding: "0.5rem 0.75rem",
          maxWidth: "80%",
        }}
      >
        {children}
      </div>
    </div>
  )
}
