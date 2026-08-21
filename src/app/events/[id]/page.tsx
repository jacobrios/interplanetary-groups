// src/app/events/[id]/page.tsx
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { deriveRoster } from "@/lib/events/roster"
import { formatEventDate } from "@/lib/events/format"
import RsvpControls from "@/components/RsvpControls"
import RosterAvatar from "./RosterAvatar"
import AddToCalendarButton from "./AddToCalendarButton"
import ProposalSection from "./ProposalSection"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"
import MembersOnlyWall from "@/components/MembersOnlyWall"
import { Clock, MapPin } from "@/components/glyphs"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import { findLiveProposals } from "@/lib/proposals/read"
import { deriveProposalBands, type ProposalBandData } from "@/lib/pending/derive"

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
          inside it); collapsed to one, matching the group info page. */}
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
            {/* Event title — moved inside the card this task. --type-title
                (24px), down from the previous --type-display (28px): the
                role map puts event-detail title at title. */}
            <h1
              style={{
                fontSize: "var(--type-title)",
                fontWeight: 800,
                letterSpacing: "-.01em",
                color: "var(--text-primary)",
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
                <DetailRow icon={null} label="Activity">
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
              <RsvpControls eventId={event.id} currentStatus={viewerStatus} groupId={event.group.id} />
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
        <div style={{ marginBottom: "16px" }}>
          <AddToCalendarButton eventId={event.id} />
        </div>

        {/* ── Open time-change vote ─────────────────────────────────────── */}
        {/* The vote on this plan's time; the chips live here (the group
            home's card stopped pointing at it in the card-region-height
            slice). A tap after a passed change still carries the moved
            time, because the calendar file is built fresh from the stored
            plan at each tap, never cached. */}
        {proposalBand && <ProposalSection band={proposalBand} />}

        {/* ── Roster card ────────────────────────────────────────────── */}
        {/* Per build-notes §7: detail screen shows who, by name, grouped
            IN / OUT / HAVEN'T REPLIED.  Distinction is by grouping + text labels
            + checkmark on the IN header — never by color alone (§7 a11y rule).
            Task 4 owns this card's own restyling; untouched here except for
            riding inside the collapsed single wrapper above. */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {inMembers.length > 0 && (
            <RosterSection label="✓ In" members={inMembers} />
          )}
          {outMembers.length > 0 && (
            <RosterSection label="Can't make it" members={outMembers} />
          )}
          {pendingMembers.length > 0 && (
            <RosterSection label="Haven't replied" members={pendingMembers} />
          )}
          {event.group.memberships.length === 0 && (
            <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
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
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode | null
  label: string
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
        color: "var(--text-primary)",
        fontWeight: 600,
        paddingLeft: icon ? undefined : "25px",
      }}
    >
      {icon && <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>}
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>
        <span style={visuallyHiddenStyle}>{label} </span>
        {children}
      </span>
    </div>
  )
}

function RosterSection({
  label,
  members,
}: {
  label: string
  members: { id: string; name: string }[]
}) {
  return (
    <div>
      {/* Section header: eyebrow style with count */}
      <p
        style={{
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "0.625rem",
        }}
      >
        {label}&nbsp;·&nbsp;{members.length}
      </p>

      {/* Member rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
          >
            <RosterAvatar name={member.name} size={28} />
            <span
              style={{
                fontSize: "var(--type-body)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-primary)",
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
