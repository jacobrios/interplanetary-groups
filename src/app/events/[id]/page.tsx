// src/app/events/[id]/page.tsx
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { EventStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { deriveRoster } from "@/lib/events/roster"
import { formatEventDate } from "@/lib/events/format"
import RsvpControls from "@/components/RsvpControls"
import RosterAvatar from "./RosterAvatar"
import AddToCalendarButton from "./AddToCalendarButton"
import ProposalSection from "./ProposalSection"
import CancelControls from "./CancelControls"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
import MembersOnlyWall from "@/components/MembersOnlyWall"
import { NeedLabel } from "@/components/NeedLabel"
import { Clock, MapPin, Check } from "@/components/glyphs"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import { findLiveProposals } from "@/lib/proposals/read"
import { deriveProposalBands, type ProposalBandData } from "@/lib/pending/derive"
import { eventCardLabel } from "@/lib/cards/region"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const { id } = await params

  // Single read: event + venue(s) + group members + RSVPs.
  // All data the page needs arrives before the first render — no client-side
  // loading state, no waterfall.
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      venues: true,
      rsvps: true,
      group: {
        include: {
          memberships: {
            include: { user: true },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
  })

  if (!event) notFound()

  const viewer = await getCurrentUser()

  // Members only (share-readiness slice): an event page carries the roster's
  // real names and the meeting spot, so it is as private as the feed.
  const isMember =
    viewer !== null && event.group.memberships.some((m) => m.userId === viewer.id)
  if (!isMember) return <MembersOnlyWall />

  // ─── Derive roster buckets from membership + RSVP data ────────────────────
  // "HAVEN'T REPLIED" is the absence of an Rsvp row — never stored (§2, §11).
  // Derivation logic lives in src/lib/events/roster.ts, shared with the
  // compact home-screen card.
  const { inMembers, outMembers, pendingMembers, viewerStatus } = deriveRoster(
    event.group.memberships.map((m) => m.user),
    event.rsvps,
    viewer?.id ?? null
  )

  // ─── Event metadata ───────────────────────────────────────────────────────
  // Single-venue UI: show the first venue even though the model supports many.
  // Multi-venue UI is a fast-follow (build-notes §8).
  const venue = event.venues[0] ?? null
  const venueLabel = venue ? (venue.displayLabel ?? venue.name) : null

  const isCancelled = event.status === EventStatus.CANCELLED
  // Brightness carries the state, never hue: the same device the roster
  // below already uses for IN / HAVEN'T REPLIED / OUT. The owner is
  // red/green colourblind and the status ladder is hue-free by rule.
  const detailInk = isCancelled ? "var(--text-secondary)" : "var(--text-primary)"

  const dateLabel = formatEventDate(event.startsAt, event.endsAt, event.group.timeZone)

  // ─── Open time-change vote, if any ─────────────────────────────────────
  // Same group-scoped read the group home uses (src/lib/proposals/read.ts),
  // filtered to this event by the derivation's own keyed map — never a
  // second, event-scoped query path to keep in sync with the home's.
  const liveProposals = await findLiveProposals(event.group.id, new Date())
  // Non-null in practice: the members-only wall above already returned for a
  // null viewer, since isMember requires viewer !== null. TS can't see that
  // narrowing across the boolean, so this narrows on `viewer` itself instead
  // of trusting isMember, the same way the group home guards deriveIdeaItems
  // and deriveProposalBands (src/app/groups/[id]/page.tsx): no empty-string
  // sentinel can flow into the derivation.
  const proposalBands = viewer
    ? deriveProposalBands({
        liveProposals,
        viewerId: viewer.id,
        timeZone: event.group.timeZone,
      })
    : new Map<string, ProposalBandData>()
  const proposalBand = proposalBands.get(event.id) ?? null

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Back to the group this event belongs to (walkthrough screen 09).
          A fixed parent link, never history back: arriving here from a
          shared link and pressing history back leaves the product. The
          group relation is already loaded for the roster, so this costs
          no extra query. */}
      <PageHeader>
        <BackLink href={`/groups/${event.group.id}`} label={event.group.name} />
      </PageHeader>

      {/* Single content column: the page (<main>) owns the full-bleed
          background, this one wrapper owns both the scroll region's own
          padding (walkthrough.css .ed-scroll, task 3) and the slice's
          28rem content-column convention. The page previously nested two
          wrappers for this (a padded flex column, then a maxWidth column
          inside it); collapsed to one, matching the group info page.

          Owner's QA call (21 Aug 2026): the design's zero top padding
          assumed the back link sits inside this scroll region, above the
          card, providing its own separation from the header. This product
          moved the back link into the shared PageHeader instead (a
          recorded decision that beats the design source), which left
          nothing between the header's bottom hairline and the details
          card's own top border, so the two hairlines ran together. 12px
          top padding closes the gap, matching the measured space between
          the header and the first card on the group home
          (/groups/[id]'s 0.75rem card-region padding).

          Amended 26 Aug 2026 (header-rule slice): that 12px goes back to 0.
          The reason it was added is void now that PageHeader no longer
          carries a bottom hairline; there is only one line left to run
          into anything, and the header's own 14px bottom padding already
          holds it clear of the details card's top border. History kept
          rather than deleted, per this project's append-only records. */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          padding: "0 22px 16px",
        }}
      >
        {/* ── Event details card ─────────────────────────────────────── */}
        {/* Card recipe ported from walkthrough.css .ed-card + the 569-573
            override (surface, 1.7px hairline border, 14px radius, the
            product's standard card shadow) — this is EventCard's and
            PlaybackCard's own recipe now, not this screen's alone.
            overflow:hidden is load-bearing: it clips the footer band's
            corners to the card's own radius. */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1.7px solid var(--hairline)",
            borderRadius: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,.35)",
            overflow: "hidden",
            marginBottom: "16px",
          }}
        >
          <div style={{ padding: "15px 16px" }}>
            {/* Called-off status label, above the title. Grey, never teal:
                teal in this slot means "this needs you", and a called-off
                plan needs nothing from anybody (eventCardLabel, shared with
                the home card so the two words can never disagree). */}
            {isCancelled && (
              <p style={{ marginBottom: "8px" }}>
                <NeedLabel value={eventCardLabel(true, null)} />
              </p>
            )}

            {/* Event title — moved inside the card this task. --type-title
                (24px), down from the previous --type-display (28px): the
                role map puts event-detail title at title. */}
            <h1
              style={{
                fontSize: "var(--type-title)",
                fontWeight: 800,
                letterSpacing: "-.01em",
                color: detailInk,
                lineHeight: "var(--leading-tight)",
                // No ported value exists for the title-to-meta gap — the
                // source gives .ed-title's own type rules and .ed-meta's
                // 7px row gap, but no rule for the space between them.
                // Judgment call (task-3 report): 10px, splitting the
                // difference between the meta rows' own 7px rhythm and the
                // title's larger role.
                marginBottom: "10px",
              }}
            >
              {event.title}
            </h1>

            {/* Meta rows (.ed-meta / .ed-mrow): icon-led lines replacing the
                stacked key/value MetaRow. The "When"/"Where"/"Activity" key
                labels are visually deleted, exactly as the design draws it,
                but restored as visually-hidden text ahead of each row's
                value (fix round 1, task 3): the pre-visual MetaRow rendered
                those words and a screen reader read them, and dropping them
                to an aria-hidden icon plus bare text was a real regression
                — a listener heard a bare date, then "The climbing gym",
                then "climbing" echoing the page heading. See
                task-3-report.md's fix-round-1 section for the accessibility
                trace before and after. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              <DetailRow
                icon={<Clock size={16} stroke="var(--text-secondary)" strokeWidth={2} />}
                label="When"
                color={detailInk}
              >
                {dateLabel}
              </DetailRow>

              {/* Venue — shown only when present; multi-venue UI is deferred
                  (build-notes §8). No MAP link, no chevron: the design draws
                  one, but it is queued as a feature rather than built here
                  (controller resolution F). */}
              {venueLabel && (
                <DetailRow
                  icon={<MapPin size={16} stroke="var(--text-secondary)" strokeWidth={2} />}
                  label="Where"
                  color={detailInk}
                >
                  {venueLabel}
                </DetailRow>
              )}

              {/* Activity label — optional free-text tag. The design draws
                  no third row and no glyph for it; this row gets no icon and
                  is indented to the same text column so the rows stay
                  aligned (controller resolution E, a judgment call, not a
                  ported value). */}
              {event.activityLabel && (
                <DetailRow icon={null} label="Activity" color={detailInk}>
                  {event.activityLabel}
                </DetailRow>
              )}
            </div>
          </div>

          {/* RSVP footer band (.ed-band.footer): the screen block draws it
              lime-tinted (line 419), but the refinement pass at 596-597
              strips that to transparent with a hairline top border — the
              last definition wins. RsvpControls itself is unchanged
              (controller resolution D): the pair stays, both borders teal
              while unanswered, the chosen answer filled and checkmarked.
              groupId is passed so rsvpAction revalidates the group home
              too, matching the home-card caller (EventCard.tsx): a member
              who RSVPs here and taps back should see the card's need label
              already settled, not the pre-tap "Needs your RSVP" from a
              stale render. */}
          {viewer && (
            <div
              style={{
                borderTop: "1.6px solid var(--hairline)",
                padding: "13px 16px",
                backgroundColor: "transparent",
              }}
            >
              {isCancelled ? (
                <CancelControls eventId={event.id} groupId={event.group.id} isCancelled />
              ) : (
                <>
                  <RsvpControls
                    eventId={event.id}
                    currentStatus={viewerStatus}
                    groupId={event.group.id}
                  />
                  {/* Below the RSVP pair on purpose: the screen's primary ask
                      is still the RSVP, and calling the plan off is the rarer
                      move. No such control on the home card (decision 5): the
                      card region's height budget was won by a whole slice and
                      a control there spends it. */}
                  <div style={{ marginTop: "13px" }}>
                    <CancelControls
                      eventId={event.id}
                      groupId={event.group.id}
                      isCancelled={false}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Add to calendar ────────────────────────────────────────── */}
        {/* The screen's own primary action, its own region: teal, separate
            from the details card's teal "I'm in" (per-element teal rule).
            Reuses the same 16px gap that already separates the details card
            from the roster card below.

            Above the time-change vote, as of 17 Aug 2026, reversing the
            original order. The old reasoning ("a vote here amends the very
            time that button would save, so the vote comes first") was
            mechanism-true and read wrong: sitting below the vote, the
            button looked like it saved the PROPOSED time, when it always
            builds the file from the current stored plan. Ordering implies
            scope, so the button now sits with the details card whose time
            it actually saves, and the vote reads as its own matter below.
            (Putting the button inside the details card was the stronger
            semantic answer and was deliberately not taken; the owner's
            call, 14 Aug QA.) */}
        {/* Hidden on a called-off plan: there is nothing to save. The honest
            gap this leaves is registered as debt in the spec, and it is real:
            a member who already saved the plan still gets buzzed, and there
            is no path here to re-fetch an .ics carrying STATUS:CANCELLED.
            The subscribable feed (build-notes §6) is the actual fix. */}
        {!isCancelled && (
          <div style={{ marginBottom: "16px" }}>
            <AddToCalendarButton eventId={event.id} />
          </div>
        )}

        {/* ── Open time-change vote ─────────────────────────────────────── */}
        {/* The vote on this plan's time; the chips live here (the group
            home's card stopped pointing at it in the card-region-height
            slice). A tap after a passed change still carries the moved
            time, because the calendar file is built fresh from the stored
            plan at each tap, never cached. */}
        {proposalBand && <ProposalSection band={proposalBand} />}

        {/* ── Roster card ────────────────────────────────────────────── */}
        {/* Unchanged on a called-off plan, on purpose: cancelling touches no
            Rsvp row, so every answer here still exists and is still true.
            The detail screen carries completeness (build-notes), and that
            does not stop being the job just because the plan is off. If
            this card looks untouched next to the rest of this task's diff,
            that is the point, not an oversight. */}
        {/* Per build-notes §7: detail screen shows who, by name, grouped
            IN / OUT / HAVEN'T REPLIED. Distinction is by grouping, the
            heading labels, and (task 4) name brightness — never by color
            alone (§7 a11y rule; the owner is red/green colourblind).

            Card recipe: same as the details card above (walkthrough.css
            .ed-card + the 570-573 override) — surface, 1.7px hairline
            border, 14px radius, overflow:hidden, the product's standard
            shadow. Fix round 1 correction: task 4's dispatched resolution F
            (.superpowers/sdd/2026-08-21-visual-polish-3-design/
            controller-resolutions.md, "Task 4") originally read
            overflow:hidden as needed only by the details card's footer
            band and left it off here on a speculative focus-ring concern.
            The design source (.ed-card, line 402) sets overflow:hidden
            with no later pass removing it, which is the resolution's own
            named escape clause ("unless the design asks for it") — the
            source asks for it, so it's restored, matching the details
            card. Per-group padding replaces the old outer padding+gap; see
            RosterSection. */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1.7px solid var(--hairline)",
            borderRadius: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,.35)",
            overflow: "hidden",
          }}
        >
          {inMembers.length > 0 && (
            <RosterSection label="In" members={inMembers} variant="in" isFirst />
          )}
          {outMembers.length > 0 && (
            <RosterSection
              label="Can't make it"
              members={outMembers}
              variant="out"
              isFirst={inMembers.length === 0}
            />
          )}
          {pendingMembers.length > 0 && (
            <RosterSection
              label="Haven't replied"
              members={pendingMembers}
              variant="pending"
              isFirst={inMembers.length === 0 && outMembers.length === 0}
            />
          )}
          {event.group.memberships.length === 0 && (
            <p
              style={{
                fontSize: "var(--type-meta)",
                color: "var(--text-secondary)",
                padding: "11px 16px 12px",
              }}
            >
              No members yet.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// ─── Sub-components (server-only, no "use client") ────────────────────────────

// One icon-plus-text meta line (.ed-mrow, task 3), replacing the stacked
// key/value MetaRow. `icon` is null for the activity row (no drawn glyph in
// the design); `paddingLeft` on the no-icon branch is the icon's own
// footprint (16px width + 9px gap) so every row's text lands in the same
// column regardless of whether it carries an icon.
//
// `label` (fix round 1, task 3) is the word MetaRow used to render visibly
// ("When" / "Where" / "Activity") — deleted from the visible design per the
// brief, but restored here as visually-hidden text ahead of the value, so a
// screen reader still hears what kind of row this is. The trailing space in
// the rendered text is a separator, not new copy: without it, "When" and
// the date would run together into one word for a speech synthesizer.
//
// `color` (task 7, cancel-one-occurrence) is optional and defaults to the
// live-plan ink: a called-off plan passes the dimmer `detailInk` so every
// row steps down together, brightness carrying the state, never hue.
function DetailRow({
  icon,
  label,
  color = "var(--text-primary)",
  children,
}: {
  icon: ReactNode | null
  label: string
  color?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color,
        fontWeight: 600,
        paddingLeft: icon ? undefined : "25px",
      }}
    >
      {icon}
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>
        <span style={visuallyHiddenStyle}>{label} </span>
        {children}
      </span>
    </div>
  )
}

// One roster group (.ed-rgroup): a heading plus a wrapping row of members.
// `variant` drives the two hue-free status signals this task adds — name
// brightness, and (for "in" only) the drawn check mark — never color alone.
// `isFirst` suppresses the divider: the source rule is "every group AFTER
// the first gets a border-top" (walkthrough.css line 436), computed against
// which groups actually render (a zero-count bucket never mounts, so the
// first VISIBLE group must never carry a top border even when it isn't
// literally the first bucket in the fixed IN/OUT/PENDING order).
function RosterSection({
  label,
  members,
  variant,
  isFirst = false,
}: {
  label: string
  members: { id: string; name: string }[]
  variant: "in" | "out" | "pending"
  isFirst?: boolean
}) {
  // Brightness carries state (walkthrough.css lines 643-644 + the 685-689
  // refinement pass); hue never does. IN reads at full text-primary
  // brightness, HAVEN'T REPLIED steps down to text-secondary, OUT steps
  // down again to placeholder — see task-4-report.md for the measured
  // contrast ratio on that last one.
  const nameColor =
    variant === "in"
      ? "var(--text-primary)"
      : variant === "pending"
        ? "var(--text-secondary)"
        : "var(--placeholder)"

  return (
    <div
      style={{
        padding: "11px 16px 12px",
        borderTop: isFirst ? undefined : "1.4px solid var(--hairline)",
      }}
    >
      {/* Section header (.ed-seclabel): eyebrow style with count. The IN
          heading's checkmark is now the drawn 12px stroked glyph from
          walkthrough.css line 642 (.ed-seclabel .rost-check), replacing the
          literal "✓" character that used to render in whatever the device
          font supplied. The label wording itself is unchanged — still
          "In · 3", "Can't make it · 1", "Haven't replied · 4" — so this is
          a pure glyph swap, not a copy change. */}
      <p
        style={{
          display: "block",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
          fontWeight: 700,
          marginBottom: "8px",
        }}
      >
        {variant === "in" && (
          <span
            style={{
              display: "inline-block",
              verticalAlign: "-1px",
              marginRight: "5px",
            }}
          >
            <Check size={12} stroke="var(--text-primary)" strokeWidth={2.7} />
          </span>
        )}
        {label}&nbsp;·&nbsp;{members.length}
      </p>

      {/* Member rows (.ed-people / .ed-person): flex-wrap replaces the old
          vertical stack, which is what lets a nine-person roster fit a
          phone. minWidth:0 + overflowWrap on the name is the "layout grows
          with content" answer for a single name too long to fit one line —
          it wraps within itself rather than overflowing the card. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              minWidth: 0,
              maxWidth: "100%",
            }}
          >
            <RosterAvatar name={member.name} />
            <span
              style={{
                fontSize: "var(--type-label)",
                fontWeight: 600,
                lineHeight: "var(--leading-normal)",
                color: nameColor,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              {member.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// formatEventDate and formatTime live in src/lib/events/format.ts — shared
// with the compact home-screen card.  This file previously had inline copies;
// the extraction was done in the group-home-chat slice (see §11 build log).
