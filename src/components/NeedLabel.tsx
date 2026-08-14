// src/components/NeedLabel.tsx
// The eyebrow naming what a card still needs; absent when it needs nothing,
// so a settled card goes bare. Teal text when the need is the viewer's own
// move, quiet grey when it is other people's; the words carry the
// distinction on their own, so the color is reinforcement, never the only
// signal (spec decisions 2 and 6).
//
// Two layouts share one styled label (card-region-height slice, task 3):
// - default (`inline` unset or false): the original full-width row that
//   right-aligns itself, unchanged since the card-state-grammar slice. This
//   is EventCard's layout until task 4 moves it onto the counts row.
// - `inline`: a bare, unwrapped span for a caller that already owns a flex
//   row (IdeaCard's title row here; EventCard's counts row in task 4). The
//   caller is responsible for the row's own wrap and right-alignment; this
//   component only owns the text styling in either case.
import type { NeedLabelValue } from "@/lib/cards/region"

function NeedLabelText({ value }: { value: NeedLabelValue }) {
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

export function NeedLabel({
  value,
  inline = false,
}: {
  value: NeedLabelValue | null
  inline?: boolean
}) {
  if (!value) return null
  if (inline) return <NeedLabelText value={value} />
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 7 }}>
      <NeedLabelText value={value} />
    </div>
  )
}
