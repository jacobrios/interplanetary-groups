// src/app/groups/[id]/GroupHomeHeader.tsx
//
// The group home's header row, extracted out of page.tsx (visual-polish
// slice, Task 4) so it can carry the designed heading-weight name.
//
// It carried a "N members · group info & invite link" subline until the
// header-subline micro-PR (17 Aug 2026) deleted it: first-run information
// that showed forever, costing a measured 16.5px of chat on every screen
// (the header goes 73.5px to 57px at 375px wide). The chevron beside the
// name already says the title opens group info.
//
// The subline was also the link's accessible name, and the chevron cannot
// replace it: Chevron is aria-hidden precisely because it is supposed to
// sit beside text that names the destination. So the destination moved to
// an aria-label on the link, which costs no pixels. Without it, the only
// route in the whole app to group info (and therefore to the invite link,
// member management, and leave-group) reads as "[group name], link".
//
// Grammar per §7, unchanged from the inline version this replaces: the Orbit
// logo top-left is the home button; the group title plus chevron opens group
// info. PageHeader stays the wrapper and owns the bar's own rules (padding,
// sticky position, hairline); this component only ever supplies content.

import Link from "next/link"
import Chevron from "@/components/Chevron"
import { OrbitMark } from "@/components/OrbitMark"

export function GroupHomeHeader({
  groupId,
  groupName,
}: {
  groupId: string
  groupName: string
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      {/* Orbit logo — always opens the group list, whatever number of groups
          the viewer is in (second-group-entry-point slice, Task 5). Before
          this it pointed at "/", which guesses for a multi-group member: it
          either bounced them back where they already were or silently
          dropped them into a different group. A tap here is a spent choice
          to see the list, so a list of one is not a tax on a single-group
          member the way it would be on cold arrival at "/". */}
      <Link
        href="/groups"
        aria-label="Your groups"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        <OrbitMark size={28} label={null} />
      </Link>

      {/* Group name + chevron → group info.
          The name does NOT get whiteSpace: nowrap (fix round 1): the design
          board drew this with one short placeholder name, but the standing
          rule wins over the board here ("layout grows with content, never
          clips" / "recorded decisions win over the walkthrough" — CLAUDE.md).
          PageHeader owns no fixed height for exactly this reason, so a
          two-line name simply makes the bar taller. minWidth: 0 on this Link
          is required alongside the wrap: a flex item's content-based min
          width can force overflow even once wrapping is allowed. The
          chevron lives inside the name's own text flow (not a flex sibling)
          so it wraps as part of the last line rather than floating centered
          beside a two-line block or dropping onto its own line. */}
      <Link
        href={`/groups/${groupId}/info`}
        aria-label={`${groupName}, group info and invite link`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textDecoration: "none",
          color: "var(--text-primary)",
          flex: "1 1 auto",
          minWidth: 0,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "var(--type-heading)",
            fontWeight: 800,
            letterSpacing: "-.01em",
            lineHeight: "var(--leading-tight)",
            color: "var(--text-primary)",
          }}
        >
          {groupName}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              verticalAlign: "middle",
              marginLeft: 4,
              color: "var(--text-secondary)",
            }}
          >
            <Chevron direction="right" />
          </span>
        </span>
      </Link>

      {/* Right-side spacer to visually balance the logo */}
      <div style={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
    </div>
  )
}
