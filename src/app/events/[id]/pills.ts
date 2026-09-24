// src/app/events/[id]/pills.ts
//
// The event screen's pill geometry, shared by CancelControls and
// EditEventDetails. It lived as module-local consts in CancelControls, and
// EditEventDetails carried a hand copy of the teal one; the QA rework of
// 24 Sept 2026 puts "Edit" and "Call off" side by side in one row, so the two
// files now have to agree on the exact same shape, and a second copy would
// let them drift. A plain module rather than an export from either client
// component, so nothing here depends on "use client".
//
// Geometry read from AddToCalendarButton, so every pill below the details
// card stacks as one column. minHeight is a floor, never a fixed height, per
// the layout-grows rule.

import type { CSSProperties } from "react"

export const pill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  width: "100%",
  minHeight: "44px",
  padding: "0.75rem 1.5rem",
  borderRadius: "24px",
  fontSize: "var(--type-label)",
  fontWeight: 600,
  lineHeight: "var(--leading-normal)",
  cursor: "pointer",
}

export const outlinedPill: CSSProperties = {
  ...pill,
  background: "transparent",
  border: "1px solid var(--hairline)",
  color: "var(--text-secondary)",
}

export const tealPill: CSSProperties = {
  ...pill,
  backgroundColor: "var(--action)",
  color: "var(--action-ink)",
  border: "1px solid var(--action)",
}

// Two outlined pills sharing one row equally: the resting "Edit" | "Call
// off" pair, and the cancel confirm row. Horizontal padding drops from 1.5rem
// to 0.75rem because two pills side by side on a 375px phone cannot each
// carry 1.5rem and still hold "Yes, call it off" on one line; the text wraps
// inside the pill rather than the pills stacking, since minHeight is a floor.
export const pairPill: CSSProperties = {
  ...outlinedPill,
  // Longhands rather than the `flex` shorthand: identical in a browser, and
  // jsdom drops `flex: 1 1 0` outright, so the shorthand would leave the
  // shared-width rule untestable.
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
  padding: "0.75rem",
}

export const pairRow: CSSProperties = { display: "flex", gap: "0.625rem" }
