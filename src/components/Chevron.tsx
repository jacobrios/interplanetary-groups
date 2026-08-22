// src/components/Chevron.tsx
//
// The product's chevron, extracted from the two hand-inlined copies that
// previously lived in the group-home and group-info headers and differed
// only in path data. Inherits currentColor, so the caller decides the color
// by setting it on the surrounding element.
//
// Decorative by definition: every chevron in this product sits beside a text
// label that already names the destination, so it is always aria-hidden.

const PATHS = {
  left: "M9 11l-4-4 4-4",
  right: "M5 3l4 4-4 4",
} as const

export default function Chevron({
  direction,
  size = 14,
}: {
  direction: "left" | "right"
  size?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={PATHS[direction]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
