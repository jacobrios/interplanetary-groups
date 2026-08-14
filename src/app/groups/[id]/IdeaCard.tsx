// src/app/groups/[id]/IdeaCard.tsx
// An idea being gauged, living in the carousel beside confirmed cards.
// Subordinate by brightness and structure, never hue (spec decision 7): flat
// --surface-low, a single hairline, no shadow, body-size title, no chevron
// (there is no detail screen behind an idea). The title carries a question
// mark, a maybe and not a plan; "Place TBD" is fixed copy, kept by the owner
// because an empty spot where a place should be reads as a bug. The shell
// stretches to the region's height and the ask block anchors to the bottom
// baseline (board 06, spec decision 8), so slack reads as mid-card air.
// The fill moved off --surface-base in the chat-feed-boundary slice (round 7,
// direction A): sharing the page's own value meant the card had, in effect, no
// fill at all. It is still the quietest filled thing in the region, one step
// under a confirmed card, which is what keeps a maybe from reading as a plan.
import GaugeChips from "./GaugeChips"
import { NeedLabel } from "@/components/NeedLabel"
import { TallyLine } from "@/components/choice"
import { ideaNeedLabel } from "@/lib/cards/region"
import type { IdeaItem } from "@/lib/pending/derive"

export default function IdeaCard({ item }: { item: IdeaItem }) {
  const title = item.title.endsWith("?") ? item.title : `${item.title}?`
  const needLabel = ideaNeedLabel(item.chips.viewerAnswer)
  return (
    <div
      style={{
        backgroundColor: "var(--surface-low)",
        border: "1px solid var(--hairline)",
        borderRadius: "14px",
        overflow: "hidden",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 15px 13px",
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title row: the label rides beside the title instead of its own
            row (task 3, buys back ~25px). `flexWrap: wrap` plus the title's
            `flex: 1 1 auto` is the whole mechanism: a short title's box
            grows to fill the line and pushes the label flush right; a long
            title's natural width alone already fills the line, so the label
            (flexShrink: 0, no room left) drops to a line of its own below
            it, and the title reclaims the full row width, same as before
            this change. Never clips: nothing here fixes a height or hides
            overflow. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "10px", rowGap: "3px" }}>
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-tight)",
              fontWeight: 700,
              color: "var(--text-primary)",
              textWrap: "balance",
              flex: "1 1 auto",
            }}
          >
            {title}
          </p>
          {needLabel && (
            <div style={{ flexShrink: 0, marginLeft: "auto" }}>
              <NeedLabel value={needLabel} inline />
            </div>
          )}
        </div>
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginTop: "0.5em",
          }}
        >
          {item.whenLine} · Place TBD
        </p>
        <div data-ask style={{ marginTop: "auto", paddingTop: "0.55em" }}>
          <GaugeChips gauge={item.chips} indentPastAvatar={false} rowMargin="11px 0 0" />
          <TallyLine line={item.chips.tallyLine} marginTop={10} />
        </div>
      </div>
    </div>
  )
}
