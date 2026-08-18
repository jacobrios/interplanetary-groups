// src/app/events/[id]/ProposalSection.tsx
// The open time-change vote, on the plan it is about (spec decision 8,
// round-6 variant A): placed by the caller below the Add to calendar button
// as of 17 Aug 2026 (calendar-placement micro-PR; it originally sat between
// the details card and the button, an order that made the button read as
// saving the proposed time). The question is deterministic and deliberately
// impersonal: the group answers the time, never the asker's circumstances.
// The shell matches
// the detail screen's own card idiom (rem-based radius/padding, 0.75rem gap)
// rather than the carousel's px-based one, so it reads as a shipped
// detail-screen card, not a transplanted carousel piece.
import GroupProposalChips from "@/app/groups/[id]/GroupProposalChips"
import type { ProposalBandData } from "@/lib/pending/derive"

export default function ProposalSection({ band }: { band: ProposalBandData }) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--hairline)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-eyebrow)",
          lineHeight: 1.35,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--text-faint)",
        }}
      >
        Time change
      </p>
      <p
        style={{
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: 7,
          textWrap: "pretty",
        }}
      >
        {band.question}
      </p>
      <GroupProposalChips proposal={band.chips} rowMargin="10px 0 0" />
      {band.chips.viewerAnswer !== null && (
        // The vote-counted acknowledgement (time-change-ending slice): one
        // quiet rendered line, never a feed message (chip responses never
        // post a message per response). Per-viewer state, not a tally: it
        // names nobody, counts nothing, and states no bar; the deleted tally
        // stays deleted. Quiet by rule: meta size, secondary color, never
        // teal (this is not an action) and never lime (that is Orbit's own).
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginTop: 10,
            textWrap: "pretty",
          }}
        >
          Vote counted. If enough of the group agrees, I&apos;ll move it and let everyone know.
        </p>
      )}
    </div>
  )
}
