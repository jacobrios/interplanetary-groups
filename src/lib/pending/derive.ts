// src/lib/pending/derive.ts
// The pending surface's single derivation: rows in, viewer-personal DTO out.
// Pure on purpose: page.tsx already fetched these rows for the feed, and the
// strip must be a second window onto the same rows, never a second query.
import type { GaugeAnswer, ProposalVoteAnswer } from "@prisma/client"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"
import type { FeedGauge } from "@/app/groups/[id]/GaugeChips"
import type { FeedGroupProposal } from "@/app/groups/[id]/GroupProposalChips"
import { buildTallyLine, chipLabels, formatTimeLocalLabel, sparkStartInstant } from "@/lib/orbit/spark-copy"
import { buildProposalTallyLine, proposalChipLabels } from "@/lib/orbit/change-copy"
import { oneMoreClearsIt } from "@/lib/proposals/consensus"
import { formatWeekdayShort, formatTime } from "@/lib/events/format"

export interface PendingGaugeItem {
  kind: "gauge"
  key: string // gauge id
  kindLine: string // "New idea · from Maya", or "New idea" when no source author
  title: string // gauge.activity, the member's own words, never rewritten
  whenLine: string // "Sat 10am"; "Sat" when proposedTime is null
  sortMs: number // sparkStartInstant(...).getTime()
  chips: FeedGauge
}

export interface PendingProposalItem {
  kind: "proposal"
  key: string // proposal id
  kindLine: string // "Time change · from Sam"
  title: string // proposal.event.title
  nowLabel: string // "Mon 8am" (weekday short + formatTime of priorStartsAt)
  newLabel: string // "Mon 9am" (weekday short + formatTime of proposedStartsAt)
  sortMs: number // proposal.event.startsAt.getTime()
  chips: FeedGroupProposal
}

export type PendingItem = PendingGaugeItem | PendingProposalItem

export interface PendingData {
  waiting: PendingItem[] // viewerAnswer null, soonest first
  standingYes: PendingItem[] // gauge IN / proposal YES, soonest first
}

/**
 * Whether a visible strip band belongs on screen for this data: the single
 * source of truth PendingStrip's own render gate and page.tsx's layout
 * spacing both call, so the two can never independently drift out of
 * agreement (fix-wave 1, visual-polish task 6). `derivePending` returns a
 * non-null `PendingData` with empty arrays for any signed-in viewer, even
 * when nothing is waiting on them and they hold no standing yes; that is
 * the ordinary quiet state of a group whenever nothing is being gauged, not
 * a rare edge case. Testing `PendingData !== null` (the page's original,
 * wrong check) is therefore true in that ordinary state too, which is what
 * let the strip's air-above padding and the feed's reduced top padding
 * render with no band between them. This predicate names the real
 * condition instead: does this data have anything to show.
 *
 * PendingStrip additionally tracks session-local state (declined items,
 * the one-time "caught up" goodbye) that this predicate cannot see and
 * does not need to: that state always starts empty/false on every fresh
 * mount, so on first paint PendingStrip.tsx's own render gate reduces to
 * exactly this predicate applied to its live `{ waiting, standingYes }`
 * pair (raw on mount, session-filtered thereafter) -- see the call site
 * there for how it stays true through a session, not just at load.
 */
export function pendingStripWillRender(pending: Pick<PendingData, "waiting" | "standingYes">): boolean {
  return pending.waiting.length > 0 || pending.standingYes.length > 0
}

export interface PendingInputs {
  liveGauges: LiveGauge[]
  liveProposals: LiveProposal[] // caller passes ALL; derive filters kind === "GROUP"
  viewerId: string
  memberIds: Set<string>
  memberCount: number
  timeZone: string
}

export function derivePending(input: PendingInputs): PendingData {
  const waiting: PendingItem[] = []
  const standingYes: PendingItem[] = []

  for (const g of input.liveGauges) {
    const viewerAnswer: GaugeAnswer | null =
      g.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    if (viewerAnswer === "OUT" || viewerAnswer === "NOT_THAT_DAY") continue
    const memberVotes = g.votes.filter((v) => input.memberIds.has(v.userId))
    const names = new Map(memberVotes.map((v) => [v.userId, v.user.name]))
    const from = g.sourceMessage?.author?.name
    const item: PendingGaugeItem = {
      kind: "gauge",
      key: g.id,
      kindLine: from ? `New idea · from ${from}` : "New idea",
      title: g.activity,
      whenLine: g.proposedTime
        ? `${formatWeekdayShort(g.proposedDate, input.timeZone)} ${formatTimeLocalLabel(g.proposedTime)}`
        : formatWeekdayShort(g.proposedDate, input.timeZone),
      sortMs: sparkStartInstant(g.proposedDate, g.proposedTime, input.timeZone).getTime(),
      chips: {
        id: g.id,
        orbitMessageId: g.orbitMessageId,
        tallyLine: buildTallyLine(memberVotes, names),
        labels: chipLabels(g.proposedDate, input.timeZone),
        viewerAnswer,
      },
    }
    ;(viewerAnswer === "IN" ? standingYes : waiting).push(item)
  }

  for (const p of input.liveProposals) {
    if (p.kind !== "GROUP") continue
    const viewerAnswer: ProposalVoteAnswer | null =
      p.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    if (viewerAnswer === "KEEP") continue
    const memberVotes = p.votes.filter((v) => input.memberIds.has(v.userId))
    const yesVoters = memberVotes.filter((v) => v.answer === "YES")
    const consensus = {
      yesVoterIds: yesVoters.map((v) => v.userId),
      keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
      currentInUserIds: p.event.rsvps
        .filter((r) => r.status === "IN" && input.memberIds.has(r.userId))
        .map((r) => r.userId),
      memberCount: input.memberCount,
    }
    const item: PendingProposalItem = {
      kind: "proposal",
      key: p.id,
      kindLine: `Time change · from ${p.asker.name}`,
      title: p.event.title,
      nowLabel: `${formatWeekdayShort(p.priorStartsAt, input.timeZone)} ${formatTime(p.priorStartsAt, input.timeZone)}`,
      newLabel: `${formatWeekdayShort(p.proposedStartsAt, input.timeZone)} ${formatTime(p.proposedStartsAt, input.timeZone)}`,
      sortMs: p.event.startsAt.getTime(),
      chips: {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, input.timeZone),
        tallyLine: buildProposalTallyLine(
          yesVoters.map((v) => v.user.name),
          consensus.keepVoterIds.length,
          oneMoreClearsIt(consensus)
        ),
        viewerAnswer,
      },
    }
    ;(viewerAnswer === "YES" ? standingYes : waiting).push(item)
  }

  waiting.sort((a, b) => a.sortMs - b.sortMs)
  standingYes.sort((a, b) => a.sortMs - b.sortMs)
  return { waiting, standingYes }
}
