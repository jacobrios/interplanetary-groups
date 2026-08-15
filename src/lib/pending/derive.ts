// src/lib/pending/derive.ts
// The card region's derivations: rows in, viewer-personal DTOs out. Pure on
// purpose: page.tsx already fetched these rows for the feed, and the card
// region must be a second window onto the same rows, never a second query.
import type { GaugeAnswer } from "@prisma/client"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"
import type { FeedGauge } from "@/app/groups/[id]/GaugeChips"
import type { FeedGroupProposal } from "@/app/groups/[id]/GroupProposalChips"
import { buildCardTallyLine, chipLabels, formatTimeLocalLabel, sparkStartInstant } from "@/lib/orbit/spark-copy"
import { proposalBandQuestion } from "@/lib/orbit/change-copy"
import { deriveGroupProposalTally } from "@/lib/proposals/tally"
import { formatWeekdayShort } from "@/lib/events/format"

export interface IdeaItem {
  key: string // gauge id
  title: string // gauge.activity, the member's own words, never rewritten
  whenLine: string // "Sat 10am"; "Sat" when proposedTime is null
  sortMs: number
  chips: FeedGauge
}

/**
 * Ideas the group is voting on, tailored to the viewer: a decline (OUT or
 * NOT_THAT_DAY) removes the card for that viewer (the vote itself stays
 * recorded and arrives as OUT if the idea promotes), everyone else sees it
 * with their own answer riding along in `chips.viewerAnswer`. Sorted soonest
 * first, mirroring the carousel's own ordering.
 */
export function deriveIdeaItems(input: {
  liveGauges: LiveGauge[]
  viewerId: string
  memberIds: Set<string>
  timeZone: string
}): IdeaItem[] {
  const items: IdeaItem[] = []
  for (const g of input.liveGauges) {
    const viewerAnswer: GaugeAnswer | null =
      g.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    // A decline removes the card for that viewer (spec decision 9); the vote
    // stays recorded and arrives as OUT if the idea promotes.
    if (viewerAnswer === "OUT" || viewerAnswer === "NOT_THAT_DAY") continue
    const memberVotes = g.votes.filter((v) => input.memberIds.has(v.userId))
    const names = new Map(memberVotes.map((v) => [v.userId, v.user.name]))
    items.push({
      key: g.id,
      title: g.activity,
      whenLine: g.proposedTime
        ? `${formatWeekdayShort(g.proposedDate, input.timeZone)} ${formatTimeLocalLabel(g.proposedTime)}`
        : formatWeekdayShort(g.proposedDate, input.timeZone),
      sortMs: sparkStartInstant(g.proposedDate, g.proposedTime, input.timeZone).getTime(),
      chips: {
        id: g.id,
        orbitMessageId: g.orbitMessageId,
        tallyLine: buildCardTallyLine(memberVotes, names),
        labels: chipLabels(g.proposedDate, input.timeZone),
        viewerAnswer,
      },
    })
  }
  items.sort((a, b) => a.sortMs - b.sortMs)
  return items
}

export interface ProposalBandData {
  eventId: string
  question: string // detail-screen sentence: "Move Friday beers to 8pm?"
  chips: FeedGroupProposal
}

/**
 * Open group time-change proposals, keyed by the event they'd move.
 * Deliberately NOT viewer-filtered: a KEEP voter still sees the band on the
 * plan's card with their own chip selected, because the band is the vote
 * surface itself, not a to-do list that clears on answering. Only the label
 * logic elsewhere cares who has and hasn't answered.
 */
export function deriveProposalBands(input: {
  liveProposals: LiveProposal[]
  viewerId: string
  memberIds: Set<string>
  memberCount: number
  timeZone: string
}): Map<string, ProposalBandData> {
  const bands = new Map<string, ProposalBandData>()
  for (const p of input.liveProposals) {
    if (p.kind !== "GROUP") continue
    const tally = deriveGroupProposalTally({
      proposal: p,
      viewerId: input.viewerId,
      memberIds: input.memberIds,
      memberCount: input.memberCount,
      timeZone: input.timeZone,
    })
    bands.set(p.event.id, {
      eventId: p.event.id,
      question: proposalBandQuestion(p.event.title, p.proposedStartsAt, input.timeZone),
      chips: {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: tally.labels,
        tallyLine: tally.tallyLine,
        viewerAnswer: tally.viewerAnswer,
      },
    })
  }
  return bands
}
