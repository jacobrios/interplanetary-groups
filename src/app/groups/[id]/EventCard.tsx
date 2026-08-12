// src/app/groups/[id]/EventCard.tsx
//
// The pinned compact event card at the top of the group home.
//
// Design rules (build-notes §7):
// - Shows the gist: title, day/time (3-letter weekday), short venue label,
//   and counts-only status ("4 In · 1 Out · 4 TBD"; In always shown, Out
//   only when nonzero, TBD = pending, no names).
// - The card body is a link to the event detail page.
// - RSVP controls reuse the existing RsvpControls (compact=true) and
//   setRsvp write — identical logic, smaller shell.
// - Teal "I'm in" is this CARD's single primary action; "Can't make it" is
//   outlined secondary. Per card, not per screen: the carousel can show two or
//   three cards at once, each carrying its own teal action, and the rule was
//   amended to match on 27 July 2026 (build-notes §11, spark part two).
// - The card stays pinned at the top; condensed-after-RSVP is deliberately
//   not built (see build-notes §7 open question and §11).

import Link from "next/link"
import RsvpControls from "@/components/RsvpControls"
import { formatEventDate } from "@/lib/events/format"
import { formatCounts } from "@/lib/events/roster"
import { RsvpStatus } from "@prisma/client"

interface Props {
  event: {
    id: string
    title: string
    startsAt: Date
    endsAt: Date | null
    venues: { displayLabel: string | null; name: string }[]
  }
  groupId: string
  /** The group's IANA timezone; the card renders the event instant in it. */
  timeZone: string
  inCount: number
  outCount: number
  pendingCount: number
  viewerStatus: RsvpStatus | null
  viewerHasSession: boolean
}

export default function EventCard({
  event,
  groupId,
  timeZone,
  inCount,
  outCount,
  pendingCount,
  viewerStatus,
  viewerHasSession,
}: Props) {
  const venue = event.venues[0] ?? null
  const venueLabel = venue ? (venue.displayLabel ?? venue.name) : null
  const dateLabel = formatEventDate(event.startsAt, event.endsAt, timeZone)
  const countsLabel = formatCounts({ inCount, outCount, pendingCount })

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1.7px solid var(--hairline)",
        borderRadius: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Card body — single padded region (.gh-evpad) holding the tappable
          title/metadata/status link plus the RSVP row below it. RsvpControls
          renders <button> elements, so it cannot nest inside the <Link> —
          both live in this shared padded wrapper instead, which is also why
          there is no separate footer band or hairline between them. */}
      <div style={{ padding: "14px 15px 13px" }}>
        <Link
          href={`/events/${event.id}`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* Event title */}
          <p
            style={{
              fontSize: "var(--type-heading)",
              lineHeight: "var(--leading-tight)",
              fontWeight: 800,
              letterSpacing: "-.01em",
              color: "var(--text-primary)",
              textWrap: "balance",
            }}
          >
            {event.title}
          </p>

          {/* Metadata row: date · venue */}
          <p
            style={{
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              marginTop: "0.5em",
            }}
          >
            {dateLabel}
            {venueLabel && <span> · {venueLabel}</span>}
          </p>

          {/* Status line: counts, on their own steady row so a tally update
              never reflows the metadata above it. */}
          <p
            style={{
              fontSize: "var(--type-label)",
              lineHeight: "var(--leading-normal)",
              fontWeight: 700,
              color: "var(--text-secondary)",
              marginTop: "0.55em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {countsLabel}
          </p>
        </Link>

        {/* RSVP controls — only for authenticated viewers */}
        {viewerHasSession && (
          <div style={{ marginTop: "0.95em" }}>
            <RsvpControls
              eventId={event.id}
              currentStatus={viewerStatus}
              compact
              groupId={groupId}
            />
          </div>
        )}
      </div>
    </div>
  )
}
