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

// A sibling, not a variant of NeedLabel above: NeedLabel itself is
// untouched by this export, so IdeaCard's and EventCard's ordinary need
// labels (both routed through the function above) render exactly as they
// did before. A cancellation is a STATUS, not a need (see CANCELLED_LABEL's
// own comment in lib/cards/region.ts), so bending NeedLabel's needsViewer
// color rule for the one caller that isn't really a need risked leaning
// every other caller too. Card-local and detail-local by construction,
// just centralized here once rather than duplicated in both call sites.
//
// Bright rather than merely louder than grey (owner's phone QA, 3 Sept
// 2026: "it's the thing that needs to stand out the most on the card").
// Status is carried by brightness on this product's cards, and a
// called-off card already dims its title to --text-secondary, so putting
// the brightest ink on the label inverts the hierarchy on purpose: on a
// live card the plan shouts and the status is quiet; on a called-off card
// the status shouts and the plan recedes. Same geometry as NeedLabel, not
// one pixel of size, weight, letter-spacing or padding changed, per the
// hard constraint that the pinned card region gains no height from this.
export function CancelledLabel({ value }: { value: NeedLabelValue | null }) {
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
        color: "var(--text-primary)",
      }}
    >
      {value.text}
    </span>
  )
}
