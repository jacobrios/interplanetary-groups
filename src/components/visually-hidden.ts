// src/components/visually-hidden.ts
//
// The standard clip-rect technique for text that must reach assistive
// technology but never render visually: offscreen and clipped to a 1x1 box
// rather than `display: none`, which would drop the text from the
// accessibility tree too and fix nothing.
//
// Extracted from src/app/join/[inviteToken]/JoinForm.tsx (task 3 of
// visual-polish-3, fix round 1): that file already had this exact
// technique for its "Your name" label, and page.tsx needed the same
// technique for the event-detail meta rows' restored "When"/"Where"/
// "Activity" text. Two consumers is the extraction threshold this project
// otherwise applies case by case; a second hand-copied definition would
// have let the two drift apart silently, so this is the shared source now
// — import it rather than redefining the technique.

import type { CSSProperties } from "react"

export const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
}
