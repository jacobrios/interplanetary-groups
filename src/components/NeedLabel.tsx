// src/components/NeedLabel.tsx
// The top-right eyebrow naming what a card still needs; absent when it needs
// nothing, so a settled card goes bare. Teal text when the need is the
// viewer's own move, quiet grey when it is other people's; the words carry
// the distinction on their own, so the color is reinforcement, never the
// only signal (spec decisions 2 and 6). In flow, right-aligned: long strings
// and enlarged text wrap instead of overlapping the title.
import type { NeedLabelValue } from "@/lib/cards/region"

export function NeedLabel({ value }: { value: NeedLabelValue | null }) {
  if (!value) return null
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 7 }}>
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
    </div>
  )
}
