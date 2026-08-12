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

      {/* Group name + members subline + chevron → group info */}
      <Link
        href={`/groups/${groupId}/info`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textDecoration: "none",
          color: "var(--text-primary)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span
            style={{
              fontSize: "var(--type-heading)",
              fontWeight: 800,
              letterSpacing: "-.01em",
              lineHeight: "var(--leading-tight)",
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {groupName}
          </span>
          <span style={{ color: "var(--text-secondary)", display: "flex" }}>
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
