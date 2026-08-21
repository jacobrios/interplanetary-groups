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
