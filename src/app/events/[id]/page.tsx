// src/app/events/[id]/page.tsx
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

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "28rem" }}>
        {/* Event title */}
        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "1.5rem",
          }}
        >
          {event.title}
        </h1>

        {/* ── Event details card ─────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {/* Date / time */}
          <MetaRow label="When" value={dateLabel} />

          {/* Venue — shown only when present; multi-venue UI is deferred (build-notes §8) */}
          {venueLabel && <MetaRow label="Where" value={venueLabel} />}

          {/* Activity label — optional free-text tag */}
          {event.activityLabel && <MetaRow label="Activity" value={event.activityLabel} />}

          {/* RSVP controls — only when the viewer has a session. groupId is
              passed so rsvpAction revalidates the group home too, matching
              the home-card caller (EventCard.tsx): a member who RSVPs here
              and taps back should see the card's need label already settled,
              not the pre-tap "Needs your RSVP" from a stale render. */}
          {viewer && (
            <>
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--hairline)",
                  margin: "0.125rem 0",
                }}
              />
              <RsvpControls eventId={event.id} currentStatus={viewerStatus} groupId={event.group.id} />
            </>
          )}
        </div>

        {/* ── Open time-change vote ─────────────────────────────────────── */}
        {/* Placed here, ahead of "Add to calendar", because a vote here
            amends the very time that button would save: the calendar file
            should never be built from a plan the group might be about to
            move. The compact card's footer notice (EventCard.tsx) links
            here; this is where the actual chips live. */}
        {proposalBand && <ProposalSection band={proposalBand} />}

        {/* ── Add to calendar ────────────────────────────────────────── */}
        {/* The screen's own primary action, its own region: teal, separate
            from the details card's teal "I'm in" (per-element teal rule).
            Reuses the same 1rem gap that already separates the details card
            from the roster card below. */}
        <div style={{ marginBottom: "1rem" }}>
          <AddToCalendarButton eventId={event.id} />
        </div>

        {/* ── Roster card ────────────────────────────────────────────── */}
        {/* Per build-notes §7: detail screen shows who, by name, grouped
            IN / OUT / HAVEN'T REPLIED.  Distinction is by grouping + text labels
            + checkmark on the IN header — never by color alone (§7 a11y rule). */}
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
      </div>
    </main>
  )
}

// ─── Sub-components (server-only, no "use client") ────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: "var(--type-label)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "var(--type-body)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </p>
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
