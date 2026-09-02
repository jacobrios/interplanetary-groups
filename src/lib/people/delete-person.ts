// src/lib/people/delete-person.ts
//
// The only place in src/ that writes for the "ready for other people's
// data" deletion feature. deletion-plan.ts decides what deleting a person
// would do and performs no writes; this file takes that decision and
// actually applies it, inside one transaction. Task 3's script is the only
// caller: it shows the plan to the owner, gets a human decision on which
// join-announcement candidates are genuine matches, and only then calls
// deletePerson.
//
// Ordering is load-bearing and pinned by a test: solo-founded groups are
// deleted BEFORE the User row, because Group.founderId has no onDelete
// (RESTRICT, prisma/schema.prisma:68) and the user delete is otherwise
// rejected outright.
//
// The receipt this returns is not the plan echoed back. Every number in it
// is read from the database after the delete actually happened: removals is
// a fresh before/after count taken inside this same transaction (not
// plan.removals, which may have been computed moments or minutes earlier by
// a caller that has since changed its mind about nothing but still deserves
// a receipt describing reality), and groupsDeleted and
// joinAnnouncementMessagesDeleted are likewise what a post-delete query
// confirms is gone, not what was asked for. That is the whole point of a
// receipt: it reports what happened, not what was intended.

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { DeletionPlan, DeletionRemovals, GroupToDelete } from "./deletion-plan"

export interface DeletionReceipt {
  person: { userId: string; name: string }
  /** Re-read after the delete: only groups the database confirms are gone. */
  groupsDeleted: GroupToDelete[]
  /** The count deleteMany actually removed, which is already a DB fact rather than a request. */
  joinAnnouncementMessagesDeleted: number
  /**
   * Fresh before/after counts taken inside this transaction, not
   * plan.removals. Equal to the "before" count whenever the delete fully
   * succeeded (the ordinary case); if some row unexpectedly survived, this
   * reports the true smaller number instead of pretending it was removed.
   */
  removals: DeletionRemovals
  /** Re-read after the delete: true only if the User row is confirmed gone. */
  userDeleted: boolean
}

async function countCascadeRows(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<DeletionRemovals> {
  const [memberships, rsvps, gaugeVotes, proposalVotes, changeProposalsAsked] = await Promise.all([
    tx.membership.count({ where: { userId } }),
    tx.rsvp.count({ where: { userId } }),
    tx.gaugeVote.count({ where: { userId } }),
    tx.proposalVote.count({ where: { userId } }),
    tx.changeProposal.count({ where: { askerUserId: userId } }),
  ])
  return { memberships, rsvps, gaugeVotes, proposalVotes, changeProposalsAsked }
}

function subtractRemovals(before: DeletionRemovals, after: DeletionRemovals): DeletionRemovals {
  return {
    memberships: before.memberships - after.memberships,
    rsvps: before.rsvps - after.rsvps,
    gaugeVotes: before.gaugeVotes - after.gaugeVotes,
    proposalVotes: before.proposalVotes - after.proposalVotes,
    changeProposalsAsked: before.changeProposalsAsked - after.changeProposalsAsked,
  }
}

/**
 * Applies a "ready" DeletionPlan. Refuses a "blocked" plan outright: there is
 * nothing safe to apply, and the caller (the operator's script) should show
 * the blocking reasons and stop rather than call this at all.
 *
 * joinAnnouncementMessageIds is the operator's own confirmed subset of
 * plan.joinAnnouncementCandidates (deletion-plan.ts's doc comment explains
 * why the module that builds the plan cannot choose this itself: a
 * "name-match-only" candidate can be an innocent same-named stranger). Every
 * id passed here must be one of the plan's own candidates; passing anything
 * else is refused before any write happens, so a bug in the caller can never
 * delete an arbitrary message by accident.
 */
export async function deletePerson(
  plan: DeletionPlan,
  joinAnnouncementMessageIds: string[]
): Promise<DeletionReceipt> {
  if (plan.kind !== "ready") {
    throw new Error(
      "deletePerson refuses a blocked plan: buildDeletionPlan must return kind \"ready\" before anything is deleted"
    )
  }

  const candidateIds = new Set(plan.joinAnnouncementCandidates.map((c) => c.messageId))
  for (const id of joinAnnouncementMessageIds) {
    if (!candidateIds.has(id)) {
      throw new Error(
        `deletePerson refuses message id ${id}: it is not one of this plan's own joinAnnouncementCandidates`
      )
    }
  }

  const { userId } = plan.person
  const groupIds = plan.groupsToDelete.map((g) => g.groupId)

  return prisma.$transaction(async (tx) => {
    const before = await countCascadeRows(tx, userId)

    const deletedMessages = await tx.message.deleteMany({
      where: { id: { in: joinAnnouncementMessageIds } },
    })

    // Groups before the user: Group.founderId is RESTRICT, so deleting the
    // user first would be rejected outright by the database while any group
    // they founded still exists. Sequential rather than Promise.all because
    // ordering across groups doesn't matter but ordering relative to the
    // user delete below does, and interactive-transaction queries share one
    // connection anyway.
    for (const groupId of groupIds) {
      await tx.group.delete({ where: { id: groupId } })
    }

    await tx.user.delete({ where: { id: userId } })

    // Everything below is a re-read: what the database says happened, not
    // what was asked for.
    const after = await countCascadeRows(tx, userId)

    const remainingGroups =
      groupIds.length === 0
        ? []
        : await tx.group.findMany({ where: { id: { in: groupIds } }, select: { id: true } })
    const remainingGroupIds = new Set(remainingGroups.map((g) => g.id))
    const groupsDeleted = plan.groupsToDelete.filter((g) => !remainingGroupIds.has(g.groupId))

    const userStillThere = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })

    return {
      person: plan.person,
      groupsDeleted,
      joinAnnouncementMessagesDeleted: deletedMessages.count,
      removals: subtractRemovals(before, after),
      userDeleted: userStillThere === null,
    }
  })
}
