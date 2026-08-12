// src/components/OrbitBubble.tsx
//
// Orbit's chat bubble, extracted from the inline JSX in MessageFeed so any
// surface that speaks in Orbit's voice (the feed, and now the pending-surface
// panel) renders the same avatar + bubble. Styles are copied verbatim from
// the feed (build-notes §7 chat voice system: lime avatar, no name label,
// --surface-raised fill). Originally just relocated pixels verbatim; the
// visual-polish slice since changed its notch, padding, gap, border and max
// width, so it is no longer a pixel-for-pixel copy of the feed's inline
// version, just the same voice-system rules applied here.
//
// Presentational only, no hooks, so it needs no "use client" directive and
// stays server-compatible.

import type { ReactNode } from "react"
import { OrbitMark } from "@/components/OrbitMark"

export function OrbitBubble({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "9px",
        marginTop: "12px",
        maxWidth: "93%",
      }}
    >
      <OrbitMark size={28} />
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
