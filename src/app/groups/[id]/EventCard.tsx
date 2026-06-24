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
// - Teal "I'm in" is the single persistent primary action on this screen;
//   "Can't make it" is outlined secondary.
// - The card stays pinned at the top; condensed-after-RSVP is deliberately
//   not built (see build-notes §7 open question and §11).
//
// Tech debt: RsvpControls lives under events/[id]/ but is shared here;
// noted for future relocation to a shared dir.

import Link from "next/link"
import RsvpControls from "@/app/events/[id]/RsvpControls"
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
  inCount: number
  outCount: number
  pendingCount: number
  viewerStatus: RsvpStatus | null
  viewerHasSession: boolean
}

export default function EventCard({
  event,
  groupId,
  inCount,
  outCount,
  pendingCount,
  viewerStatus,
  viewerHasSession,
}: Props) {
  const venue = event.venues[0] ?? null
  const venueLabel = venue ? (venue.displayLabel ?? venue.name) : null
  const dateLabel = formatEventDate(event.startsAt, event.endsAt)
  const countsLabel = formatCounts({ inCount, outCount, pendingCount })

  return (
    <div
      style={{
        backgroundColor: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.75rem",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Card body — tappable link to the event detail page */}
      <Link
        href={`/events/${event.id}`}
        style={{
          display: "block",
          padding: "1rem 1rem 0.75rem",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        {/* Event title */}
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "0.375rem",
          }}
        >
          {event.title}
        </p>

        {/* Metadata row: date · venue · counts */}
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
          }}
        >
          {dateLabel}
          {venueLabel && <span> · {venueLabel}</span>}
          <span> · {countsLabel}</span>
        </p>
      </Link>

      {/* RSVP controls — only for authenticated viewers */}
      {viewerHasSession && (
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "0.75rem 1rem",
          }}
        >
          <RsvpControls
            eventId={event.id}
            currentStatus={viewerStatus}
            compact
            groupId={groupId}
          />
        </div>
      )}
    </div>
  )
}
