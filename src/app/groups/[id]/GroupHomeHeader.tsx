// src/app/groups/[id]/GroupHomeHeader.tsx
//
// The group home's header row, extracted out of page.tsx (visual-polish
// slice, Task 4) so it can carry the designed heading-weight name and the
// members subline that were drawn in the walkthrough but never built.
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
  memberCount,
}: {
  groupId: string
  groupName: string
  memberCount: number
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
      {/* Orbit logo — the home button (multi-group home is a fast-follow) */}
      <Link
        href="/"
        aria-label="Home"
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

      {/* Group name + members subline + chevron → group info.
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
        <span
          style={{
            fontSize: "var(--type-eyebrow)",
            color: "var(--text-secondary)",
            fontWeight: 500,
            marginTop: 2,
            letterSpacing: ".02em",
          }}
        >
          {`${memberCount} ${memberCount === 1 ? "member" : "members"} · group info & invite link`}
        </span>
      </Link>

      {/* Right-side spacer to visually balance the logo */}
      <div style={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
    </div>
  )
}
