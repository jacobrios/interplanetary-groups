// src/lib/people/deletion-plan.ts
//
// Reads a person and the state of their groups and decides what deleting
// them would do. Performs NO writes. This is the whole safety argument of
// the "ready for other people's data" slice: the dangerous decision (what to
// delete) is made here, somewhere testable, away from the code that applies
// it (a later task) and the script that prints and confirms it (a later
// task still). Never call a mutating Prisma method from this file.
//
// Mirrors, and explains, the database's own constraints instead of letting
// them surface as a raw error:
// - Group.founderId has no onDelete (RESTRICT, prisma/schema.prisma:68), so a
//   founder whose group still has other members cannot be deleted; this
//   module reports that as "blocked" with a reason, rather than the caller
//   discovering it from a foreign-key exception.
// - Every other relation to User is either Cascade (the row disappears with
//   the person) or SetNull (the row survives, its pointer nulled). removals
//   and survivals name each relation explicitly, so a future schema change
//   that stops (or starts) cascading one of them fails a test here instead
//   of silently changing what "delete this person" means.

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"

export interface BlockedGroupOtherMember {
  userId: string
  name: string
}

export interface BlockedGroup {
  groupId: string
  groupName: string
  otherMembers: BlockedGroupOtherMember[]
}

export interface GroupToDelete {
  groupId: string
  groupName: string
}

/**
 * Counts of rows that cascade away with the person: Group.founderId aside
 * (that is the blocked/ready split above them), every field here is a
 * `onDelete: Cascade` relation to User in prisma/schema.prisma.
 */
export interface DeletionRemovals {
  memberships: number
  contactMethods: number
  rsvps: number
  gaugeVotes: number
  proposalVotes: number
  changeProposalsAsked: number
}

/**
 * Counts of rows that survive the person's deletion, pointer nulled
 * (`onDelete: SetNull`): their chat messages and any gauges they suggested.
 */
export interface DeletionSurvivals {
  messages: number
  gaugesSuggested: number
}

/** One still-open ChangeProposal the person asked, for the operator to weigh before deleting them. */
export interface OpenProposalWarning {
  proposalId: string
  groupId: string
  groupName: string
  /** Votes from people other than the person being deleted. */
  otherVoterCount: number
}

/**
 * A candidate SYSTEM "<name> joined" message that may belong to this person.
 * authorId is always null on these rows (src/lib/groups/join.ts:69), so there
 * is no reliable way to match one to a specific person; every same-body
 * candidate in a group they belong to is listed for the operator to judge,
 * rather than the code guessing.
 */
export interface JoinAnnouncementCandidate {
  messageId: string
  groupId: string
  groupName: string
  createdAt: Date
}

export type DeletionPlan =
  | { kind: "blocked"; reason: "founder-with-members"; groups: BlockedGroup[] }
  | {
      kind: "ready"
      person: { userId: string; name: string }
      groupsToDelete: GroupToDelete[]
      removals: DeletionRemovals
      survivals: DeletionSurvivals
      warnings: OpenProposalWarning[]
      joinAnnouncementCandidates: JoinAnnouncementCandidate[]
      /**
       * The person's Supabase login pointer, reported so the operator's
       * script can print it. Never acted on here: the app holds no key that
       * can delete a Supabase user (src/lib/supabase/env.ts carries only the
       * project URL and publishable key).
       */
      supabaseAuthId: string | null
    }

/**
 * Builds the deletion plan for one person. Read-only: every query below is a
 * find/count, never a write.
 */
export async function buildDeletionPlan(userId: string): Promise<DeletionPlan> {
  const person = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, supabaseAuthId: true },
  })

  const foundedGroups = await prisma.group.findMany({
    where: { founderId: userId },
    select: {
      id: true,
      name: true,
      memberships: { select: { userId: true, user: { select: { name: true } } } },
    },
  })

  const blockedGroups: BlockedGroup[] = []
  const soloFoundedGroups: GroupToDelete[] = []
  for (const group of foundedGroups) {
    const others = group.memberships.filter((m) => m.userId !== userId)
    if (others.length > 0) {
      blockedGroups.push({
        groupId: group.id,
        groupName: group.name,
        otherMembers: others.map((m) => ({ userId: m.userId, name: m.user.name })),
      })
    } else {
      soloFoundedGroups.push({ groupId: group.id, groupName: group.name })
    }
  }

  // Any group they founded that still has other members blocks the whole
  // deletion (it mirrors Group.founderId's RESTRICT), naming every such
  // group rather than only the first one hit.
  if (blockedGroups.length > 0) {
    return { kind: "blocked", reason: "founder-with-members", groups: blockedGroups }
  }

  const [
    membershipCount,
    contactMethodCount,
    rsvpCount,
    gaugeVoteCount,
    proposalVoteCount,
    changeProposalsAsked,
    messageCount,
    gaugesSuggestedCount,
    openProposals,
    membershipGroups,
  ] = await Promise.all([
    prisma.membership.count({ where: { userId } }),
    prisma.contactMethod.count({ where: { userId } }),
    prisma.rsvp.count({ where: { userId } }),
    prisma.gaugeVote.count({ where: { userId } }),
    prisma.proposalVote.count({ where: { userId } }),
    prisma.changeProposal.count({ where: { askerUserId: userId } }),
    // authorId is only ever set for MEMBER messages (ORBIT and SYSTEM are
    // always null), so this counts exactly their own chat messages.
    prisma.message.count({ where: { authorId: userId } }),
    prisma.gauge.count({ where: { suggestedByUserId: userId } }),
    prisma.changeProposal.findMany({
      where: { askerUserId: userId, answer: null },
      select: {
        id: true,
        groupId: true,
        group: { select: { name: true } },
        votes: { select: { userId: true } },
      },
    }),
    prisma.membership.findMany({
      where: { userId },
      select: {
        groupId: true,
        group: {
          select: {
            name: true,
            messages: {
              where: { authorType: MessageAuthor.SYSTEM, body: `${person.name} joined` },
              select: { id: true, createdAt: true },
            },
          },
        },
      },
    }),
  ])

  const warnings: OpenProposalWarning[] = openProposals.map((p) => ({
    proposalId: p.id,
    groupId: p.groupId,
    groupName: p.group.name,
    otherVoterCount: p.votes.filter((v) => v.userId !== userId).length,
  }))

  const joinAnnouncementCandidates: JoinAnnouncementCandidate[] = membershipGroups.flatMap((m) =>
    m.group.messages.map((msg) => ({
      messageId: msg.id,
      groupId: m.groupId,
      groupName: m.group.name,
      createdAt: msg.createdAt,
    }))
  )

  return {
    kind: "ready",
    person: { userId: person.id, name: person.name },
    groupsToDelete: soloFoundedGroups,
    removals: {
      memberships: membershipCount,
      contactMethods: contactMethodCount,
      rsvps: rsvpCount,
      gaugeVotes: gaugeVoteCount,
      proposalVotes: proposalVoteCount,
      changeProposalsAsked,
    },
    survivals: { messages: messageCount, gaugesSuggested: gaugesSuggestedCount },
    warnings,
    joinAnnouncementCandidates,
    supabaseAuthId: person.supabaseAuthId,
  }
}
