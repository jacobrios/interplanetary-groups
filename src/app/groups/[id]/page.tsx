// src/app/groups/[id]/page.tsx
//
// The real group home (walkthrough frame 06).
//
// Layout:
//   Header: Orbit logo (home button) · group title + chevron (→ group info)
//   Pinned compact event card (soonest upcoming event)
//   Chat feed (own scroll region, --type-body 17px, never shrunk)
//   Pinned message input
//
// Data: single server render before any JS runs.  The event, roster counts,
// and message feed all arrive together from one query pass.
//
// Deliberately deferred per §11:
// - Condensed card after RSVP (build-notes §7 open question — ship full card)
// - Membership gating (consistent with prior ungated surfaces)
// - Multi-card carousel (single fixture event; carousel chrome waits for ≥2)
// - Email-capture ask after first RSVP (rides with Orbit's live posting)

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { deriveRoster } from "@/lib/events/roster"
import { findLiveGauges } from "@/lib/gauges/read"
import { buildTallyLine, chipLabels } from "@/lib/orbit/spark-copy"
import EventCarousel from "./EventCarousel"
import type { EventCardData } from "./EventCarousel"
import GroupHome from "./GroupHome"
import type { FeedMessage } from "./MessageFeed"
import type { FeedGauge } from "./GaugeChips"

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  })

  if (!group) notFound()

  const viewer = await getCurrentUser()

  // ── Upcoming events + rosters ─────────────────────────────────────────────
  // Up to three upcoming cards. The carousel comes live here because a sparked
  // event beside the standing one is exactly the two-or-more condition the
  // group-home slice deferred it for. Three is a display cap, not a rule: a
  // fourth upcoming event is possible and simply waits its turn.
  const upcomingEvents = await findUpcomingEvents(group.id, new Date(), 3)

  const allMembers = group.memberships.map((m) => m.user)
  const cards: EventCardData[] = await Promise.all(
    upcomingEvents.map(async (event) => {
      const rsvps = await prisma.rsvp.findMany({ where: { eventId: event.id } })
      const { inMembers, outMembers, pendingMembers, viewerStatus } = deriveRoster(
        allMembers,
        rsvps,
        viewer?.id ?? null
      )
      return {
        event,
        inCount: inMembers.length,
        outCount: outMembers.length,
        pendingCount: pendingMembers.length,
        viewerStatus,
      }
    })
  )

  // ── Message feed ──────────────────────────────────────────────────────────
  const rawMessages = await prisma.message.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
  })

  // ── Live gauges ───────────────────────────────────────────────────────────
  // Everything the group reads about a gauge is composed here, deterministically,
  // from the vote rows: nothing about a tally is stored. A gauge whose day has
  // passed is simply absent, so its message renders as plain history.
  const liveGauges = await findLiveGauges(group.id, new Date())

  // Names are shown only for members, the same way deriveRoster only ever
  // displays members' RSVPs.  Voting itself is not membership-gated (that is
  // the standing access-control gap), but a name rendered inside a group's
  // feed should belong to that group.
  const memberIds = new Set(group.memberships.map((m) => m.userId))

  const gauges: FeedGauge[] = liveGauges.map((g) => {
    const memberVotes = g.votes.filter((v) => memberIds.has(v.userId))

    return {
      id: g.id,
      orbitMessageId: g.orbitMessageId,
      tallyLine: buildTallyLine(
        memberVotes,
        new Map(memberVotes.map((v) => [v.userId, v.user.name]))
      ),
      labels: chipLabels(g.proposedDate, group.timeZone),
      // Read from the unfiltered rows: the viewer's own chip must reflect what
      // they actually chose, member or not.
      viewerAnswer: g.votes.find((v) => v.userId === viewer?.id)?.answer ?? null,
    }
  })

  const messages: FeedMessage[] = rawMessages.map((msg) => ({
    id: msg.id,
    authorType: msg.authorType,
    authorId: msg.authorId,
    authorName: msg.author?.name ?? null,
    body: msg.body,
    createdAt: msg.createdAt,
  }))

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* Grammar per §7: Orbit logo top-left (home button); group title +
          chevron opens group info (which carries the invite link).
          Multi-group navigation is a fast-follow (§8); the logo is
          presentational this slice. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.875rem 1rem",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* Orbit logo — home button (multi-group fast-follow; presentational now) */}
        <div
          aria-label="Orbit"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "var(--color-lime)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "#0a0a0a",
            letterSpacing: "-0.01em",
          }}
        >
          O
        </div>

        {/* Group title + chevron → group info */}
        <a
          href={`/groups/${group.id}/info`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            textDecoration: "none",
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{
              fontSize: "var(--type-body)",
              fontWeight: 600,
              lineHeight: "var(--leading-tight)",
            }}
          >
            {group.name}
          </span>
          {/* Chevron — design token per §7 header grammar */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            style={{ color: "var(--text-secondary)" }}
          >
            <path
              d="M5 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>

        {/* Right-side spacer to visually balance the logo */}
        <div style={{ width: 28 }} aria-hidden="true" />
      </header>

      {/* ── Pinned event cards ─────────────────────────────────────────── */}
      <div style={{ padding: "0.75rem 1rem 0", flexShrink: 0 }}>
        {cards.length > 0 ? (
          <EventCarousel
            events={cards}
            groupId={group.id}
            timeZone={group.timeZone}
            viewerHasSession={viewer !== null}
          />
        ) : (
          /* No upcoming event — quiet empty state; the feed still renders */
          <div
            style={{
              backgroundColor: "var(--surface-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.75rem",
              padding: "1rem",
            }}
          >
            <p
              style={{
                fontSize: "var(--type-meta)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
              }}
            >
              No upcoming events yet. Orbit will propose one soon.
            </p>
          </div>
        )}
      </div>

      {/* ── Chat feed + pinned input (client island) ───────────────────── */}
      {/* The chat section fills remaining viewport height.  The feed is its
          own scroll region; the input is pinned at the bottom.
          Body stays at --type-body (17px), never shrunk (§7 firm rule). */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          marginTop: "0.75rem",
        }}
      >
        <GroupHome
          groupId={group.id}
          initialMessages={messages}
          viewerId={viewer?.id ?? null}
          viewerName={viewer?.name ?? null}
          gauges={gauges}
        />
      </div>
    </div>
  )
}
