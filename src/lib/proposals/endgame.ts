// src/lib/proposals/endgame.ts
//
// The other end of a group time-change vote's life. The chips already stop
// rendering the moment a proposal stops being answerable (liveness is derived
// in read.ts, never stored), but until this sweep existed the row stayed
// unanswered forever and nobody heard an ending. This is the sweep that
// closes the vote and, when the group simply ran out of time, says so once:
// one soft Orbit line, no tally, no names, no blame. A vote made moot by the
// plan moving some other way closes silently, keeping the read layer's
// no-residue rule; the sweep only adds the bookkeeping row.
//
// Called unscoped by the hourly cron sweep in production, exactly like
// runGaugeEndgame — every group, every open proposal — and that is correct
// there. In a TEST, unscoped means posting a real Orbit closure message, and
// writing a real answer + answeredAt, onto every open group proposal in every
// group in the shared dev-test database, permanently. Every test call in
// __tests__/endgame.test.ts MUST pass { groupId }; see
// src/lib/orbit/__tests__/reconcile.test.ts for the story of what an
// unscoped test sweep actually costs.
//
// The liveness boundary here MIRRORS read.ts (findLiveProposals), which is
// the single source of truth, not a second derivation: a proposal is dead
// once min(proposedStartsAt, event.startsAt) <= now, moot once priorStartsAt
// no longer equals the event's startsAt, and (since the cancel slice, 2
// September 2026) moot once the event itself is CANCELLED. If the boundary
// ever changes, it changes there first and this file follows.

import { prisma } from "@/lib/prisma"
import {
  EventStatus,
  MessageAuthor,
  Prisma,
  ProposalAnswer,
  ProposalKind,
} from "@prisma/client"
import { buildProposalClosureMessage } from "@/lib/orbit/change-copy"

export type ProposalEndgameResult =
  | { proposalId: string; action: "lapsed" }
  | { proposalId: string; action: "superseded" }
  | {
      proposalId: string
      action: "skipped"
      reason:
        | "still_live"
        // Lost a close race: another sweep answered this row between our read
        // and our write. The answer write's WHERE clause is the guard, exactly
        // like the gauge sweep's marker columns.
        | "already_answered"
    }

const proposalInclude = {
  event: { select: { startsAt: true, title: true, activityLabel: true, status: true } },
  group: { select: { timeZone: true } },
} satisfies Prisma.ChangeProposalInclude

type CandidateProposal = Prisma.ChangeProposalGetPayload<{ include: typeof proposalInclude }>

/**
 * Sweep every open group proposal for its endgame: supersede the moot ones
 * silently, lapse the timed-out ones with one closing message.
 *
 * No coarse date window here, unlike the gauge sweep: the answer write itself
 * removes a swept row from the `answer: null` candidate set, so the set can
 * only shrink. Proposals are processed sequentially (not Promise.all),
 * matching runGaugeEndgame's structure; a per-proposal failure is caught,
 * logged, and the sweep continues.
 *
 * @param now  The reference instant. Passed explicitly so callers (cron
 *             handler, tests) control the clock without mocking Date.now().
 * @param opts.groupId  Optional scope: sweep only this group. Tests MUST
 *             always pass this — see the file-header warning above.
 */
export async function runProposalEndgame(
  now: Date,
  opts?: { groupId?: string }
): Promise<ProposalEndgameResult[]> {
  const proposals = await prisma.changeProposal.findMany({
    where: {
      ...(opts?.groupId ? { groupId: opts.groupId } : {}),
      kind: ProposalKind.GROUP,
      answer: null,
    },
    include: proposalInclude,
    orderBy: { createdAt: "asc" },
  })

  const results: ProposalEndgameResult[] = []
  for (const proposal of proposals) {
    try {
      results.push(await handleOne(proposal, now))
    } catch (err) {
      console.error("[proposal-endgame] proposal failed:", proposal.id, err)
    }
  }
  return results
}

async function handleOne(
  proposal: CandidateProposal,
  now: Date
): Promise<ProposalEndgameResult> {
  // Moot first, ahead of the clock: a proposal whose prior time no longer
  // matches the event was retired by the read layer the instant the plan
  // moved, whatever the calendar says, so the bookkeeping write should not
  // wait for the boundary either. SUPERSEDED already means "overtaken before
  // the group answered"; this is its second shape (see the schema comment).
  if (proposal.priorStartsAt.getTime() !== proposal.event.startsAt.getTime()) {
    return supersede(proposal, now)
  }

  // The same shape, for the plan being called off rather than moved: read.ts
  // retired this question the instant the status flipped, so nobody can
  // answer it, and lapsing would post "tennis is staying at 7pm" into a feed
  // whose line above says tennis is off. Reachable only in the narrow race
  // against cancelEvent's own supersede, which is exactly why it is here.
  if (proposal.event.status === EventStatus.CANCELLED) {
    return supersede(proposal, now)
  }

  // The read layer's boundary, mirrored: live means the event has not started
  // AND the proposed time is still ahead. Past either one, confirming would
  // move a plan into the past (or move a plan already underway), so the vote
  // is no longer answerable.
  const boundary = Math.min(
    proposal.proposedStartsAt.getTime(),
    proposal.event.startsAt.getTime()
  )
  if (boundary > now.getTime()) {
    return { proposalId: proposal.id, action: "skipped", reason: "still_live" }
  }

  return lapse(proposal, now)
}

/** Signals a lost close race; rolls the transaction back, never escapes this module. */
class AlreadyAnsweredInTx extends Error {}

/**
 * The moot close: SUPERSEDED, no message. The conditional WHERE on
 * `answer: null` is the idempotence guard — a row another sweep already
 * answered matches zero rows, and nothing was created that needs rolling back.
 */
async function supersede(
  proposal: CandidateProposal,
  now: Date
): Promise<ProposalEndgameResult> {
  const updated = await prisma.changeProposal.updateMany({
    where: { id: proposal.id, answer: null },
    data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
  })
  if (updated.count === 0) {
    return { proposalId: proposal.id, action: "skipped", reason: "already_answered" }
  }
  return { proposalId: proposal.id, action: "superseded" }
}

/**
 * The lapsed close: LAPSED plus one Orbit message, in one transaction so a
 * close can never half-exist (the join-line rule's shape). Create the message
 * first, then conditionally attach the answer: the UPDATE's WHERE clause
 * (`answer: null`) is evaluated at update time against the row's committed
 * state, so a lost race matches zero rows and throws to roll the orphaned
 * message back out — see runGaugeEndgame's bump path for why a
 * read-then-branch-then-write re-read would NOT close this race.
 *
 * A close after the event already started still posts: the cron is hourly, so
 * it lands at most about an hour stale, and the asker was owed an answer.
 * Never-leave-a-direct-ask-hanging outranks anti-clutter here (recorded in
 * the slice document).
 */
async function lapse(
  proposal: CandidateProposal,
  now: Date
): Promise<ProposalEndgameResult> {
  const label = proposal.event.activityLabel ?? proposal.event.title.toLowerCase()
  const body = buildProposalClosureMessage(
    label,
    proposal.priorStartsAt,
    proposal.group.timeZone
  )

  try {
    await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          groupId: proposal.groupId,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body,
        },
      })
      const updated = await tx.changeProposal.updateMany({
        where: { id: proposal.id, answer: null },
        data: { answer: ProposalAnswer.LAPSED, answeredAt: now },
      })
      if (updated.count === 0) throw new AlreadyAnsweredInTx()
    })
  } catch (err) {
    if (err instanceof AlreadyAnsweredInTx) {
      return { proposalId: proposal.id, action: "skipped", reason: "already_answered" }
    }
    throw err
  }

  return { proposalId: proposal.id, action: "lapsed" }
}
