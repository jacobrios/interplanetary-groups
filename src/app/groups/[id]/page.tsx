// src/app/groups/[id]/page.tsx
//
// The real group home (walkthrough frame 06).
//
// Layout:
//   Header: Orbit logo (home button) · group title + chevron (→ group info)
//   Pinned card region, soonest first, mingling confirmed events and ideas
//   still being gauged, in a peek-and-dots carousel (up to CARD_REGION_CAP)
//   Chat feed (own scroll region, --type-body 17px, never shrunk)
//   Pinned message input
//
// Data: single server render before any JS runs.  The events, roster counts,
// and message feed all arrive together from one query pass.
//
// Deliberately deferred per §11:
// - Condensed card after RSVP (build-notes §7 open question — ship full card)
// - Email-capture ask after first RSVP (rides with Orbit's live posting)
//
// The carousel's peek geometry and active dot are finished chrome per the
// visual-polish Claude Design handoff (round4-base.css); see CarouselRail.tsx.

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/current-user"
import MembersOnlyWall from "@/components/MembersOnlyWall"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { deriveRoster } from "@/lib/events/roster"
import { findLiveGauges } from "@/lib/gauges/read"
import { buildTallyLine, chipLabels } from "@/lib/orbit/spark-copy"
import { findLiveProposals } from "@/lib/proposals/read"
import { changeChipLabels } from "@/lib/orbit/change-copy"
import { deriveGroupProposalTally } from "@/lib/proposals/tally"
import EventCarousel from "./EventCarousel"
import type { EventCardData } from "./EventCarousel"
import GroupHome from "./GroupHome"
import type { FeedMessage } from "./MessageFeed"
import type { FeedGauge } from "./GaugeChips"
import type { FeedProposal } from "./ProposalChips"
import type { FeedGroupProposal } from "./GroupProposalChips"
import PageHeader from "@/components/PageHeader"
import { deriveIdeaItems } from "@/lib/pending/derive"
import { composeCardRegion, CARD_REGION_CAP } from "@/lib/cards/region"
import { GroupHomeHeader } from "./GroupHomeHeader"
import FeedSeam from "./FeedSeam"
import CardRegionEmpty from "./CardRegionEmpty"

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
  // Up to CARD_REGION_CAP upcoming cards. The carousel comes live here
  // because a sparked event beside the standing one is exactly the
  // two-or-more condition the group-home slice deferred it for. Five is a
  // display cap combined with ideas (card-state-grammar spec decision 5),
  // not a rule: a sixth item simply waits its turn in chat.
  const upcomingEvents = await findUpcomingEvents(group.id, new Date(), CARD_REGION_CAP)

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
      // Shared with the event detail screen's own proposal vote via
      // deriveGroupProposalTally, so the chat feed and that screen can
      // never disagree about the same proposal's tally. (The card region
      // itself no longer renders this vote at all, since the card-region-
      // height slice removed its pointer to it.)
      const tally = deriveGroupProposalTally({
        proposal: p,
        viewerId: viewer?.id ?? null,
        memberIds,
        // Current members only, same source as the info page's tally: a
        // removed membership row is hard-deleted (remove-member.ts,
        // leave.ts), so this already-fetched include stays accurate with
        // no second query.
        memberCount: group.memberships.length,
        timeZone: group.timeZone,
      })
      return {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: tally.labels,
        tallyLine: tally.tallyLine,
        viewerAnswer: tally.viewerAnswer,
      }
    })

  // ── Card region: ideas ────────────────────────────────────────────────────
  // A second window onto liveGauges, not a second query: pure derivation of
  // this viewer's own idea cards (card-state-grammar slice). The confirmed
  // card no longer advertises an open group time-change vote (card-region-
  // height slice, task 6); that vote still lives in chat and on the event's
  // own detail screen via deriveProposalBands there.
  const ideas = viewer
    ? deriveIdeaItems({ liveGauges, viewerId: viewer.id, memberIds, timeZone: group.timeZone })
    : []
  const entries = composeCardRegion(
    cards.map((c) => ({ sortMs: c.event.startsAt.getTime(), data: c })),
    ideas.map((i) => ({ sortMs: i.sortMs, item: i }))
  )

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

          The content is its own component (GroupHomeHeader, visual-polish
          Task 4) rather than PageHeader arranging it: PageHeader owns the
          bar's rules and nothing about content, which is what keeps it from
          ever growing an opinion about this title chevron. GroupHomeHeader
          carries the heading-weight name and Orbit's real avatar; its
          members subline was deleted 17 Aug 2026 to give the chat its
          height back. */}
      <PageHeader>
        <GroupHomeHeader groupId={group.id} groupName={group.name} />
      </PageHeader>

      {/* ── Pinned card region ─────────────────────────────────────────── */}
      {/* Multi-card: side padding moves onto CarouselRail so the rail can
          bleed past the screen edge for the peek. Single-card: padding stays
          here, there is no rail to carry it. The strip's "air above" is gone
          along with the strip itself. */}
      <div
        style={{
          padding: `0.75rem ${entries.length > 1 ? 0 : "1rem"} 0.75rem`,
          flexShrink: 0,
        }}>
        {entries.length > 0 ? (
          <EventCarousel
            entries={entries}
            groupId={group.id}
            timeZone={group.timeZone}
            viewerHasSession={viewer !== null}
          />
        ) : (
          /* No upcoming event or idea. The quiet bottom rung of the card
             ladder; the feed still renders below it. */
          <CardRegionEmpty />
        )}
      </div>

      {/* ── Chat feed + pinned input (client island) ───────────────────── */}
      {/* The chat section fills remaining viewport height.  The feed is its
          own scroll region; the input is pinned at the bottom.
          Body stays at --type-body (17px), never shrunk (§7 firm rule).

          FeedSeam owns the boundary against the card region above: the
          hairline and the scrim over the feed's top edge. The 12px gap that
          used to live on a wrapper div here now lives on the card region's
          own bottom padding instead, since FeedSeam already carries the flex
          layout (flex, display, flexDirection, minHeight) that wrapper only
          duplicated. */}
      <FeedSeam>
        <GroupHome
          groupId={group.id}
          initialMessages={messages}
          viewerId={viewer?.id ?? null}
          viewerName={viewer?.name ?? null}
          timeZone={group.timeZone}
          gauges={gauges}
          proposals={proposals}
          groupProposals={groupProposals}
          viewerIsMember={viewerIsMember}
        />
      </FeedSeam>
    </div>
  )
}
