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
//
// Superseded by the card-state-grammar slice (spec decisions 1-3, 8): the
// need-label ladder now names the card's own highest outstanding ask (RSVP,
// then an open time-change vote) above the title, and an open proposal earns
// a recessed footer notice linking to the vote on the detail screen — the
// card itself never renders the proposal's chips, so the carousel doesn't
// grow a second, taller shape. The shell also stretches to the region's full
// height (board 06) with the RSVP block bottom-anchored, so slack in a short
// card reads as mid-card air rather than dead space below it.

import Link from "next/link"
import RsvpControls from "@/components/RsvpControls"
import { NeedLabel } from "@/components/NeedLabel"
import { formatEventDate } from "@/lib/events/format"
import { formatCounts } from "@/lib/events/roster"
import { eventNeedLabel } from "@/lib/cards/region"
import type { ProposalBandData } from "@/lib/pending/derive"
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
  /** The event's open group time-change vote, if any. The card never
   *  renders its chips; the footer notice links to the vote on the detail
   *  screen instead (spec decision 8). */
  proposal?: ProposalBandData | null
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
  proposal = null,
}: Props) {
  const venue = event.venues[0] ?? null
  const venueLabel = venue ? (venue.displayLabel ?? venue.name) : null
  const dateLabel = formatEventDate(event.startsAt, event.endsAt, timeZone)
  const countsLabel = formatCounts({ inCount, outCount, pendingCount })
  const needLabel = viewerHasSession
    ? eventNeedLabel(viewerStatus, proposal ? { viewerAnswer: proposal.chips.viewerAnswer } : null)
    : null

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1.7px solid var(--hairline)",
        borderRadius: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
        overflow: "hidden",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Card body — single padded region (.gh-evpad) holding the tappable
          title/metadata/status link plus the RSVP row below it. RsvpControls
          renders <button> elements, so it cannot nest inside the <Link> —
          both live in this shared padded wrapper instead, which is also why
          there is no separate footer band or hairline between them. */}
      <div style={{ padding: "14px 15px 13px", flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
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

          {/* Status row: counts, on their own steady row so a tally update
              never reflows the metadata above it, sharing that row with the
              need label (task 4, mirrors IdeaCard's title row from task 3).
              flexWrap:wrap plus the counts text's flex:1 1 auto is the whole
              mechanism: a short counts string grows to fill the line and
              pushes the label flush right; once the two together outgrow the
              row (a big group's counts plus "Needs other votes" — measured
              in the brief at 298-315px against 310px available), the label
              (flexShrink:0, no room left) drops to its own line below,
              pinned right by its wrapper's auto left margin, and the counts
              text reclaims the full row width. Never clips: nothing here
              fixes a height or hides overflow, staying inside the card's own
              overflow:hidden only because the row is free to grow. Both
              inside the Link, same as before this task, so the label joins
              the tap target rather than shrinking it. */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              columnGap: "10px",
              rowGap: "3px",
              marginTop: "0.55em",
            }}
          >
            <p
              style={{
                fontSize: "var(--type-label)",
                lineHeight: "var(--leading-normal)",
                fontWeight: 700,
                color: "var(--text-secondary)",
                fontVariantNumeric: "tabular-nums",
                flex: "1 1 auto",
              }}
            >
              {countsLabel}
            </p>
            {needLabel && (
              <div style={{ flexShrink: 0, marginLeft: "auto" }}>
                <NeedLabel value={needLabel} inline />
              </div>
            )}
          </div>
        </Link>

        {/* RSVP controls — only for authenticated viewers. Bottom-anchored
            (board 06 stretch): a short card's leftover space collects here
            as mid-card air instead of dead space below the card. */}
        {viewerHasSession && (
          <div data-ask style={{ marginTop: "auto", paddingTop: "0.95em" }}>
            <RsvpControls
              eventId={event.id}
              currentStatus={viewerStatus}
              compact
              groupId={groupId}
            />
          </div>
        )}
      </div>

      {/* Footer notice: an open group time-change vote gets one recessed
          line here, never the proposal's own chips (spec decision 8) — the
          carousel renders at its tallest card's height, and a full vote
          panel on this card would grow that height for every card beside
          it. Tapping through is the vote surface; ProposalSection carries
          the actual chips on the detail screen. overflow:hidden on the card
          root squares this line's corners against the card radius. */}
      {viewerHasSession && proposal && (
        <Link
          href={`/events/${event.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            borderTop: "1px solid var(--hairline)",
            backgroundColor: "var(--surface-base)",
            padding: "10px 15px",
            textDecoration: "none",
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14" /></svg>
          <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: "var(--type-label)", lineHeight: "var(--leading-normal)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Time change proposed · <b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{proposal.notice}</b>
          </span>
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" stroke="var(--text-faint)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      )}
    </div>
  )
}
