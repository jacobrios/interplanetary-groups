// src/app/groups/[id]/page.tsx
//
// The real group home (walkthrough frame 06).
//
// Layout:
//   Header: Orbit logo (home button) · group title + chevron (→ group info)
//   Pinned event cards, soonest first, in a peek-and-dots carousel (up to 3)
//   Chat feed (own scroll region, --type-body 17px, never shrunk)
//   Pinned message input
//
// Data: single server render before any JS runs.  The events, roster counts,
// and message feed all arrive together from one query pass.
//
// Deliberately deferred per §11:
// - Condensed card after RSVP (build-notes §7 open question — ship full card)
// - Carousel active-dot state (interim chrome; no design handoff yet)
// - Email-capture ask after first RSVP (rides with Orbit's live posting)

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import MembersOnlyWall from "@/components/MembersOnlyWall"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { deriveRoster } from "@/lib/events/roster"
import { findLiveGauges } from "@/lib/gauges/read"
import { buildTallyLine, chipLabels } from "@/lib/orbit/spark-copy"
import { findLiveProposals } from "@/lib/proposals/read"
import { changeChipLabels, proposalChipLabels, buildProposalTallyLine } from "@/lib/orbit/change-copy"
import { oneMoreClearsIt } from "@/lib/proposals/consensus"
import EventCarousel from "./EventCarousel"
import type { EventCardData } from "./EventCarousel"
import GroupHome from "./GroupHome"
import type { FeedMessage } from "./MessageFeed"
import type { FeedGauge } from "./GaugeChips"
import type { FeedProposal } from "./ProposalChips"
import type { FeedGroupProposal } from "./GroupProposalChips"
import Link from "next/link"
import PageHeader from "@/components/PageHeader"
import Chevron from "@/components/Chevron"
import { OrbitMark } from "@/components/OrbitMark"
import { derivePending } from "@/lib/pending/derive"
import { PendingStrip } from "./PendingStrip"

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

  // Members only (share-readiness slice): the wall replaces every non-member
  // view of this screen. An unknown id stays notFound() above; a real group
  // and a stranger meet the wall, which names nothing about the group.
  const viewerIsMember =
    viewer !== null && group.memberships.some((m) => m.userId === viewer.id)
  if (!viewerIsMember) return <MembersOnlyWall />

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
  // from the vote rows: nothing about a tally is stored. A gauge past its close
  // (two hours before the proposed start) is simply absent, so its message
  // renders as plain history.
  const liveGauges = await findLiveGauges(group.id, new Date())

  // Names are shown only for members, the same way deriveRoster only ever
  // displays members' RSVPs. This filter is about who appears in the tally,
  // not about who may vote: castVote already refuses a non-member's write
  // server-side (share-readiness slice), and promotion filters to members
  // too. Removing this filter would not open a hole, it would just let a
  // stale or removed member's name show up in a feed they no longer belong
  // to.
  const memberIds = new Set(group.memberships.map((m) => m.userId))

  // A bumped gauge gets a second FeedGauge entry sharing its id but pointing
  // at the bump message, so the same chips and tally render under both: one
  // vote, two places to answer it from. A gauge with no bump produces one
  // entry, same as before.
  const gauges: FeedGauge[] = liveGauges.flatMap((g) => {
    const memberVotes = g.votes.filter((v) => memberIds.has(v.userId))

    const base = {
      id: g.id,
      tallyLine: buildTallyLine(
        memberVotes,
        new Map(memberVotes.map((v) => [v.userId, v.user.name]))
      ),
      labels: chipLabels(g.proposedDate, group.timeZone),
      // Read from the unfiltered rows: the viewer's own chip must reflect what
      // they actually chose, member or not.
      viewerAnswer: g.votes.find((v) => v.userId === viewer?.id)?.answer ?? null,
    }

    return [
      { ...base, orbitMessageId: g.orbitMessageId },
      ...(g.bumpMessageId ? [{ ...base, orbitMessageId: g.bumpMessageId }] : []),
    ]
  })

  // ── Live change questions ────────────────────────────────────────────────
  // One fetch feeds both compositions below. VERIFY rows are composed for the
  // asker alone (part one's rule: the question clarifies one person's intent,
  // so only they get chips). GROUP rows render for everyone, so this read no
  // longer needs a viewer to run.
  const liveProposals = await findLiveProposals(group.id, new Date())
  const proposals: FeedProposal[] = liveProposals
    .filter((p) => p.kind === "VERIFY" && p.askerUserId === viewer?.id)
    .map((p) => ({
      id: p.id,
      orbitMessageId: p.orbitMessageId,
      labels: changeChipLabels(),
    }))

  const groupProposals: FeedGroupProposal[] = liveProposals
    .filter((p) => p.kind === "GROUP")
    .map((p) => {
      const memberVotes = p.votes.filter((v) => memberIds.has(v.userId))
      const yesVoters = memberVotes.filter((v) => v.answer === "YES")
      const consensusInput = {
        yesVoterIds: yesVoters.map((v) => v.userId),
        keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
        currentInUserIds: p.event.rsvps
          .filter((r) => r.status === "IN" && memberIds.has(r.userId))
          .map((r) => r.userId),
        memberCount: group.memberships.length,
      }
      return {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, group.timeZone),
        tallyLine: buildProposalTallyLine(
          yesVoters.map((v) => v.user.name),
          consensusInput.keepVoterIds.length,
          oneMoreClearsIt(consensusInput)
        ),
        // Unfiltered, the gauge precedent: the viewer's own chip must reflect
        // what they chose, member or not.
        viewerAnswer: p.votes.find((v) => v.userId === viewer?.id)?.answer ?? null,
      }
    })

  // ── Pending surface ──────────────────────────────────────────────────────
  // A second window onto liveGauges/liveProposals, not a second query: pure
  // derivation of this viewer's own waiting-on-you and standing-yes sets.
  const pending = viewer
    ? derivePending({
        liveGauges,
        liveProposals,
        viewerId: viewer.id,
        memberIds,
        memberCount: group.memberships.length,
        timeZone: group.timeZone,
      })
    : null

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
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* Grammar per §7: Orbit logo top-left is the home button; the group
          title plus chevron opens group info (which carries the invite
          link). The logo is a real link as of the navigation slice, now
          that "/" exists to send it to.

          The three children sit in their own space-between row rather than
          PageHeader arranging them: PageHeader owns the bar's rules and
          nothing about content, which is what keeps it from ever growing an
          opinion about this title chevron.

          Still unbuilt and owned by the visual-polish pass: Orbit's real
          avatar (a letter-O circle stands in) and the subline reading
          "N members · group info & invite link" drawn on screens 06 to 08. */}
      <PageHeader>
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

          {/* Group title + chevron → group info */}
          <Link
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
            <span style={{ color: "var(--text-secondary)", display: "flex" }}>
              <Chevron direction="right" />
            </span>
          </Link>

          {/* Right-side spacer to visually balance the logo */}
          <div style={{ width: 28, flexShrink: 0 }} aria-hidden="true" />
        </div>
      </PageHeader>

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
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--hairline)",
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

      {pending ? <PendingStrip pending={pending} /> : null}

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
          proposals={proposals}
          groupProposals={groupProposals}
          viewerIsMember={viewerIsMember}
        />
      </div>
    </div>
  )
}
