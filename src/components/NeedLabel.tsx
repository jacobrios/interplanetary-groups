// src/components/NeedLabel.tsx
// The eyebrow naming what a card still needs; absent when it needs nothing,
// so a settled card goes bare. Teal text when the need is the viewer's own
// move, quiet grey when it is other people's; the words carry the
// distinction on their own, so the color is reinforcement, never the only
// signal (spec decisions 2 and 6).
//
// A bare, unwrapped span (card-region-height slice, task 4): both callers
// place it inside a flex row they already own (IdeaCard's title row, task
// 3; EventCard's counts row, task 4), and are responsible for that row's
// own wrap and right-alignment. This component only owns the text styling.
import type { NeedLabelValue } from "@/lib/cards/region"

export function NeedLabel({ value }: { value: NeedLabelValue | null }) {
  if (!value) return null
  return (
    <span
      style={{
        fontSize: "var(--type-eyebrow)",
        lineHeight: 1.35,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        fontWeight: 700,
        textAlign: "right",
        color: value.needsViewer ? "var(--action)" : "var(--text-secondary)",
      }}
    >
      {value.text}
    </span>
  )
}
