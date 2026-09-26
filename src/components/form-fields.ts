// src/components/form-fields.ts
//
// Lifted 24 Sept 2026 so the group-details editor and the event editor
// cannot drift. These seven constants were EditEventDetails.tsx's own local
// styles, moved out verbatim (values and comments unchanged) so a second
// editor built on the same field grammar reuses them by import rather than
// by copy-paste. Behaviour-preserving: no value below has changed.

// Field styling reproduced by VALUE from the venue input in
// src/app/create/Step2Playback.tsx (lines ~260-320), per CLAUDE.md's
// "map tokens by value, never by name" rule. fontSize is 1rem here per the
// task brief rather than that input's literal "16px" string; both compute
// to the same 16px iOS needs to avoid the force-zoom trap, so the browser
// outcome is identical.
export const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.25rem 0.5rem",
  backgroundColor: "var(--surface-base)",
  border: "1px solid var(--hairline)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "1rem",
  lineHeight: "var(--leading-normal)",
  outline: "none",
  boxSizing: "border-box",
}

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--type-meta)",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.25rem",
}

// The editing band's two buttons: the RSVP pair's own geometry (RsvpOption
// at its non-compact size: 0.625rem 1rem padding, 0.5rem radius, 1.5px
// border, label size, 0.625rem gap), so the band keeps its shape while its
// question changes from "are you in?" to "keep these changes?". Never mind
// first and outlined; Save teal-filled, because saving is the one action
// that matters here and this is not an open question between equals.
// Longhand flex for the same jsdom reason as pills.ts.
const bandButton: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
  padding: "0.625rem 1rem",
  borderRadius: "0.5rem",
  fontSize: "var(--type-label)",
  fontFamily: "inherit",
  fontWeight: 600,
  lineHeight: "var(--leading-normal)",
}

export const neverMindButton: React.CSSProperties = {
  ...bandButton,
  backgroundColor: "transparent",
  border: "1.5px solid var(--hairline)",
  color: "var(--text-primary)",
}

export const saveButton: React.CSSProperties = {
  ...bandButton,
  backgroundColor: "var(--action)",
  border: "1.5px solid var(--action)",
  color: "var(--action-ink)",
}

// Day and Time share a row. Native date and time inputs carry an intrinsic
// minimum width on iOS that pushed the Time field past the card's right edge
// (owner's phone QA, 24 Sept 2026): each column is allowed to shrink below
// its content (flex-basis 0, min-width 0) and each input fills its column
// rather than asking for its own width.
export const shrinkColumn: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,
}

// iOS WebKit (mobile Chrome and Safari alike, both on Apple's engine there)
// renders a native date/time input at an intrinsic minimum width and ignores
// width/min-width entirely, which is what pushed Time past the card's right
// edge (owner's phone QA, 24 Sept 2026, seen in mobile Chrome). Stripping the
// native appearance is what makes width/min-width apply on iOS; desktop
// Chromium already honored them, which is why this never showed up there.
// The pseudo-element that left-aligns the value on iOS can't live inline, so
// it's `.edit-picker::-webkit-date-and-time-value` in globals.css, beside
// `.scrollbar-hidden`.
export const pickerStyle: React.CSSProperties = {
  display: "block",
  minWidth: 0,
  WebkitAppearance: "none",
  appearance: "none",
}
