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
// need-label ladder names the card's own highest outstanding ask above the
// title. The shell also stretches to the region's full height (board 06)
// with the RSVP block bottom-anchored, so slack in a short card reads as
// mid-card air rather than dead space below it.
//
// Card-region-height slice (task 6): the card stopped advertising an open
// group time-change vote. That vote still exists, unchanged, raised and
// chipped in the group chat and answered on the event's own detail screen
// (ProposalSection) — this card just no longer points at it. A confirmed
// card's need label can now only ever ask for the viewer's own RSVP, or say
// nothing.
//
// Cancel-one-occurrence slice: a called-off card drops its counts while the
// detail screen KEEPS its roster. That is on purpose, not an inconsistency
// to fix later: the preview card shows the gist and the gist is that it is
// off, while the detail screen carries completeness and those answers still
// exist, because a cancel touches no RSVP row.

import Link from "next/link"
import RsvpControls from "@/components/RsvpControls"
import { NeedLabel, CancelledLabel } from "@/components/NeedLabel"
import { formatEventDate } from "@/lib/events/format"
import { formatCounts } from "@/lib/events/roster"
import { eventCardLabel } from "@/lib/cards/region"
import { RsvpStatus, EventStatus } from "@prisma/client"

interface Props {
  event: {
    id: string
    title: string
    startsAt: Date
    endsAt: Date | null
    status: EventStatus
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
  const isCancelled = event.status === EventStatus.CANCELLED
  // The status rung sits above the need ladder: a called-off plan needs
  // nothing from anybody, so no need label can outrank it.
  const needLabel = viewerHasSession || isCancelled ? eventCardLabel(isCancelled, viewerStatus) : null

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1.7px solid var(--hairline)",
        borderRadius: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
        overflow: "hidden",
        // The containing block the stretched link's overlay resolves against
        // (double-tap fix, below). No offsets, so it is layout-neutral by
        // definition: the card stays in flow exactly where it was.
        position: "relative",
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
          className="tap-card"
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* The stretched link (double-tap fix, 2 Sept 2026). This <a> used
              to cover only the title, the metadata and the counts, because
              RsvpControls renders <button> elements and a button cannot
              legally nest inside an anchor, so it has to stay a sibling
              below. Cards also stretch to the tallest card in the region, and
              all that slack collected outside the link. Measured at 375x812:
              17% of a live card was inert, 45% of a live card standing beside
              a taller idea card, and 51% of a called-off card, whose entire
              bottom 43% had no link and no button on it at all. People aim at
              the middle of a card, hit nothing, then aim at the title, which
              is one failed tap followed by one that works, reproducibly.

              This overlay is out of normal flow and pinned to all four edges
              of the card root, so the whole card navigates while the RSVP
              buttons below keep their own taps (they are raised past it).
              It is a CHILD of the link on purpose and must stay one: a
              position:static sibling would join the card's flex column and
              add a row, and the card region's height budget was won by a
              whole slice. As written it costs zero height, zero width and no
              layout participation. It doubles as the pressed-state surface
              (see .tap-card in globals.css): the :active half lights this
              span, so on every browser that honours :active the flash covers
              exactly the area that is now tappable. The iOS half does not
              match it, and the comment in globals.css says why. */}
          <span data-tap-overlay aria-hidden="true" className="tap-card-veil" style={{ position: "absolute", inset: 0 }} />
          {/* Called-off status, above the title (QA feedback round, spec
              §13). It used to share the counts row below, right-aligned,
              which the owner found missable on his phone; the cause was
              position, not size, so it moves here to match the detail
              screen. Card-local rather than a change to NeedLabel itself:
              NeedLabel is shared with IdeaCard and the event detail screen,
              and this above-title slot is specific to this card. Renders
              through CancelledLabel (components/NeedLabel.tsx), a sibling
              export that always renders bright --text-primary rather than
              NeedLabel's needsViewer-conditioned grey, since a cancellation
              is a status rather than a need (QA feedback round, spec §14:
              "it's the thing that needs to stand out the most on the
              card"). NeedLabel's own function is untouched. Row-
              neutral by construction: the counts row below drops entirely
              on a called-off card (it held nothing else), so this replaces
              rather than adds a row; the marginBottom here mirrors the
              0.55em the removed row used to carry above it, so the move
              costs nothing.

              MEASURED, not assumed (browser pass, mobile 375x812): a
              filled chip (surface-low fill, 3px/9px padding, 20px radius)
              was built and cost 4.2px in the one case that can grow, all
              cards on a group home called off, where the tallest card is
              itself a cancelled one (127.8px before this slice's reposition,
              132px with the chip). The owner's hard constraint, stated
              twice, is that this slice adds not one pixel to the card
              region's height; his ruling in advance was that if the chip
              costs height there, the chip goes and the reposition stays.
              It does, so the fill, padding and radius below are gone: the
              bare NeedLabel, repositioned only. Same case remeasured at
              127.8px, matching the before number exactly. */}
          {isCancelled && (
            <div style={{ marginBottom: "0.55em" }}>
              <CancelledLabel value={needLabel} />
            </div>
          )}

          {/* Event title. Steps down to --text-secondary when called off:
              status is carried by brightness, never by hue (the owner is
              red/green colourblind), and the label above already names the
              word. */}
          <p
            style={{
              fontSize: "var(--type-heading)",
              lineHeight: "var(--leading-tight)",
              fontWeight: 800,
              letterSpacing: "-.01em",
              color: isCancelled ? "var(--text-secondary)" : "var(--text-primary)",
              textWrap: "balance",
            }}
          >
            {event.title}
          </p>

          {/* Metadata row: date · venue. Already renders at --text-secondary
              on a live card too, so a called-off plan needs no separate
              step-down here; the title above is the one that changes. */}
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
              row (the worst case now is a large group's counts string alone,
              since a confirmed card's need label can only ever be "Needs
              your RSVP" or nothing, per lib/cards/region.ts), the label
              (flexShrink:0, no room left) drops to its own line below,
              pinned right by its wrapper's auto left margin, and the counts
              text reclaims the full row width. Never clips: nothing here
              fixes a height or hides overflow, staying inside the card's own
              overflow:hidden only because the row is free to grow. Both
              inside the Link, same as before this task, so the label joins
              the tap target rather than shrinking it.

              Called off (QA feedback round, spec §13): this whole row is
              dropped on a cancelled card rather than left rendering with
              nothing but the label in it. The label used to live here,
              right-aligned; it moved above the title (see above), and the
              row it left behind holds nothing else on a called-off plan
              (no counts), so removing the row is what keeps the move
              row-neutral rather than adding an empty one. */}
          {!isCancelled && (
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
                  <NeedLabel value={needLabel} />
                </div>
              )}
            </div>
          )}
        </Link>

        {/* RSVP controls — only for authenticated viewers. Bottom-anchored
            (board 06 stretch): a short card's leftover space collects here
            as mid-card air instead of dead space below the card.
            No answer row on a called-off plan, and no cancel control here
            either (decision 5): the card region's height budget was won by a
            whole slice, 47.7% of the screen down to 34%, and a control here
            spends it. Calling a plan off lives on its own page. */}
        {viewerHasSession && !isCancelled && (
          <div
            data-ask
            className="tap-card-ask"
            style={{
              marginTop: "auto",
              paddingTop: "0.95em",
              // Raised past the stretched link's overlay above, so the two
              // RSVP buttons keep receiving their own taps. Without this pair
              // the link swallows its own card's controls, which is a worse
              // bug than the one the overlay fixes. Layout-neutral: a
              // position:relative with no offsets does not move, and z-index
              // has no layout effect at all.
              //
              // The class is the other half, and it was added after measuring
              // rather than in advance: raising this block also raised its
              // 0.95em top padding and the gap between the two pills, which
              // left a roughly 22px inert strip across the card plus an inert
              // column down the middle of the answer row. (Both were just as
              // dead before this fix, so it is an incomplete fix rather than
              // a regression.) .tap-card-ask makes this wrapper transparent
              // to pointers and hands them back to the buttons alone, so
              // everything around them falls through to the overlay and
              // navigates. It also closes the pill gap, which the diagnosis
              // had written off as needing a design change; pointer-events
              // costs no pixels, so it does not.
              position: "relative",
              zIndex: 1,
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
    </div>
  )
}
