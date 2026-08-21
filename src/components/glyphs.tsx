// Shared decorative glyph icons: small inline SVGs with no logic and no
// accessible content of their own (always aria-hidden; the adjacent label
// carries the meaning). One file so later additions (Clock, MapPin,
// Calendar, Check) share the same prop shape and viewBox.
//
// No tests here by design: a test asserting an <svg> renders could not
// meaningfully fail. See task-1-report.md for the fuller reasoning.

interface GlyphProps {
  size: number | string
  stroke?: string
  strokeWidth?: number
}

// The front door CTA's trailing arrow. Path and geometry ported verbatim
// from round4-base.css .fd-cta svg (viewBox, stroke-width 2.4, round caps
// and joins) and round4-design-reference.html's fd-cta markup (the path
// itself: M5 12h14M13 6l6 6-6 6).
export function ArrowRight({ size, stroke = "currentColor", strokeWidth = 2.4 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

// The clock face used to lead the event-detail when-row and (stroked lime)
// Orbit's onboarding gap marker. Path ported verbatim from the inline glyph
// that PlaybackCard.tsx carried before this task (task-3 resolution B): a
// circle plus a short hand at 7-o'clock-to-center-to-2-o'clock. Extracted
// here so the product has one clock rather than two; PlaybackCard now
// imports this instead of drawing its own copy.
export function Clock({ size, stroke = "currentColor", strokeWidth = 2.4 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

// The event-detail where-row's pin. No path data was available from the
// handoff for this glyph (walkthrough.css defines only the row's size and
// stroke color, never a path, and docs/walkthrough.html's markup could not
// be read — see task-3-report.md); this is an original render of the
// standard teardrop-plus-dot pin pictogram, drawn to match ArrowRight's
// shape conventions (viewBox, round caps and joins) rather than ported from
// a specific source.
export function MapPin({ size, stroke = "currentColor", strokeWidth = 2.4 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}

// The "Add to calendar" button's glyph. Same provenance note as MapPin: no
// path data was available from the handoff, so this is an original render
// of a standard calendar pictogram (a ruled box with two hanger ticks),
// matching ArrowRight's shape conventions.
export function Calendar({ size, stroke = "currentColor", strokeWidth = 2.4 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

// The roster's IN-group heading mark. walkthrough.css line 642
// (`.ed-seclabel .rost-check`) is a CSS rule, so it carries no path data —
// only geometry: 12x12 size, round caps and joins, and its own
// stroke-width (2.7). Those are what's ported; the path itself
// (`M5 12.5l4.5 4.5L19 7.5`) is an original render of a standard
// checkmark, same provenance as MapPin and Calendar below (no source path
// existed to port, so this draws one to match their shape conventions).
// The stroke-width and vertical-align/margin values are layout concerns
// the caller applies inline, not this component's job — same division as
// every other glyph here (shape only, placement at the call site).
// Replaces the literal "✓" character the IN heading rendered before this
// task, which depended on whatever glyph the device font supplied for
// U+2713.
export function Check({ size, stroke = "currentColor", strokeWidth = 2.4 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
