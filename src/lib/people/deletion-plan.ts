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
 *
 * ContactMethod is deliberately absent. It also cascades away (schema:49),
 * but this module never reads it: the owner's ruling is that a fourth
 * ContactMethod read site anywhere in src/ is not worth adding just to turn
 * that fact into a number (src/app/__tests__/no-email-address-on-screen.test.tsx
 * pins the count of read sites at three). `contactMethodNote` below carries
 * the same fact as a stated constant instead of a count.
 */
export interface DeletionRemovals {
  memberships: number
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
 * candidate anywhere in the product is listed for the operator to judge,
 * rather than the code guessing.
 *
 * Owner's ruling, 1 September 2026, which overrides the brief's "their
 * groups" wording: the search is NOT scoped to groups the person currently
 * belongs to. A group they already left still has people reading its feed,
 * and the announcement line exists for no purpose except to name them, so
 * scoping to current membership would quietly narrow what the privacy
 * notice promises. The search is product-wide by body text match, which
 * necessarily also turns up a same-named stranger's join line in a group
 * this person was never in; `currentlyMember` is how the operator tells the
 * two apart before confirming either one.
 */
export interface JoinAnnouncementCandidate {
  messageId: string
  groupId: string
  groupName: string
  createdAt: Date
  /** True when this person currently has a Membership row in that group. */
  currentlyMember: boolean
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
       * A stated fact, not a count: whether this person has a ContactMethod
       * row is never checked here, on purpose (see DeletionRemovals above),
       * so this is always the same fixed phrase rather than something
       * derived from a read. It cascades away with them regardless; the
       * operator is told that much and no more.
       */
      contactMethodNote: string
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
    membershipRows,
    rsvpCount,
    gaugeVoteCount,
    proposalVoteCount,
    changeProposalsAsked,
    messageCount,
    gaugesSuggestedCount,
    openProposals,
    joinMessages,
  ] = await Promise.all([
    // Fetched as rows, not a count: the group ids double as the
    // "currently a member here" set that joinAnnouncementCandidates below
    // needs, so membershipCount is derived from this list's length instead
    // of a second query.
    prisma.membership.findMany({ where: { userId }, select: { groupId: true } }),
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
    // Product-wide, NOT scoped to this person's current memberships (owner's
    // ruling, 1 September 2026: see the JoinAnnouncementCandidate doc comment
    // above). A group they left still turns up here.
    prisma.message.findMany({
      where: { authorType: MessageAuthor.SYSTEM, body: `${person.name} joined` },
      select: { id: true, groupId: true, createdAt: true, group: { select: { name: true } } },
    }),
  ])

  const membershipCount = membershipRows.length
  const currentGroupIds = new Set(membershipRows.map((m) => m.groupId))

  const warnings: OpenProposalWarning[] = openProposals.map((p) => ({
    proposalId: p.id,
    groupId: p.groupId,
    groupName: p.group.name,
    otherVoterCount: p.votes.filter((v) => v.userId !== userId).length,
  }))

  const joinAnnouncementCandidates: JoinAnnouncementCandidate[] = joinMessages.map((msg) => ({
    messageId: msg.id,
    groupId: msg.groupId,
    groupName: msg.group.name,
    createdAt: msg.createdAt,
    currentlyMember: currentGroupIds.has(msg.groupId),
  }))

  return {
    kind: "ready",
    person: { userId: person.id, name: person.name },
    groupsToDelete: soloFoundedGroups,
    removals: {
      memberships: membershipCount,
      rsvps: rsvpCount,
      gaugeVotes: gaugeVoteCount,
      proposalVotes: proposalVoteCount,
      changeProposalsAsked,
    },
    survivals: { messages: messageCount, gaugesSuggested: gaugesSuggestedCount },
    warnings,
    joinAnnouncementCandidates,
    contactMethodNote: "any email address on file",
    supabaseAuthId: person.supabaseAuthId,
  }
}
