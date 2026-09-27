// src/components/SelfBubble.tsx
//
// The viewer's own chat bubble, extracted from the inline JSX in MessageFeed
// so any surface that speaks in the founder's own voice (the feed, and now
// onboarding's gap-ask thread) renders the same bubble. Styles are copied
// verbatim from the feed (build-notes §7 chat voice system: viewer
// right-aligned, --surface-self, strongest neutral fill, never teal, never
// lime). Right-alignment stays the caller's job; this component only draws
// the bubble itself.
//
// The hairline border here is deliberate, not a stray leftover:
// walkthrough.css's later "CONTRAST + CONSISTENCY PASS" (around line 622)
// adds `1px solid var(--hairline)` to every raised chat surface including
// `.gh-self .smsg`, overriding an earlier "no border" rule by plain cascade
// order. Do not remove it again on the strength of the earlier block; the
// later block is the one that wins.
//
// Presentational only, no hooks, so it needs no "use client" directive and
// stays server-compatible.

import type { ReactNode } from "react"

export function SelfBubble({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: "93%" }}>
      <div
        style={{
          backgroundColor: "var(--surface-self)",
          border: "1px solid var(--hairline)",
          borderRadius: "16px 16px 5px 16px",
          padding: "11px 14px",
        }}
      >
        {children}
      </div>
    </div>
  )
}
