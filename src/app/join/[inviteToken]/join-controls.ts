// src/app/join/[inviteToken]/join-controls.ts
//
// The two control shapes the invite screen draws, lifted out of JoinForm so
// the sign-in panel wears the same ones rather than a second set that could
// drift. Values unchanged from the visual-polish port: the full-width pill
// field (walkthrough.css jn- block plus the 575-578 override) and the teal
// pill button. Nothing here is new; this file exists only so there is one copy.

import type { CSSProperties } from "react"

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "26px",
  padding: "14px 18px",
  backgroundColor: "var(--surface-raised)",
  // The 575-578 override (1px solid --hairline) replaces the screen block's
  // 2px solid --ink border and its shadow.
  border: "1px solid var(--hairline)",
  // --type-body (17px) and not a smaller step, and this one is not a style
  // choice: iOS Safari and iOS Chrome zoom the whole viewport when a focused
  // input computes under 16px, and nothing in layout.tsx suppresses it. This
  // slice already shipped that bug once, on the group home's field.
  fontSize: "var(--type-body)",
  color: "var(--text-primary)",
  outline: "none",
}

export function buttonStyle(isPending: boolean): CSSProperties {
  return {
    width: "100%",
    marginTop: "14px",
    // min-height plus padding, never a fixed height: at an enlarged device
    // text size the label grows the button instead of being clipped by it.
    minHeight: "52px",
    borderRadius: "28px",
    backgroundColor: "var(--action)",
    color: "var(--action-ink)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "var(--type-body)",
    lineHeight: "var(--leading-normal)",
    fontWeight: 700,
    border: "none",
    // In-flight feedback: the old palette shifted the fill to a second teal;
    // the new palette has no second teal, so this dims instead, matching
    // MessageFeed's optimistic-message idiom (0.65, greyscale-safe, no new
    // token). No transition: this slice is no-animation, so it is instant.
    opacity: isPending ? 0.65 : 1,
    cursor: isPending ? "not-allowed" : "pointer",
  }
}
