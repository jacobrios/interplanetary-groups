// src/app/actions/proposal-vote.ts
"use server"

import { revalidatePath } from "next/cache"
import { ProposalKind, ProposalVoteAnswer } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { isGroupMember } from "@/lib/auth/membership"
import { promoteProposalMove } from "@/lib/proposals/promote"
import { STALE_PROPOSAL_ERROR } from "@/lib/orbit/change-copy"

export interface ProposalVoteState {
  errors?: {
    general?: string
  }
}

const ANSWERS: string[] = [ProposalVoteAnswer.YES, ProposalVoteAnswer.KEEP]

/**
 * Server action: record one member's vote on a group time proposal.
 *
 * Same auth model as gaugeVoteAction and proposalAnswerAction: the session is
 * re-verified server-side and the user is re-resolved from it, never trusted
 * from the client. Every write path in the product is membership-gated as of
 * the share-readiness slice; this one was historically the only one, because
 * a proposal vote can move an already-scheduled plan for the whole group, not
 * just answer an open interest gauge.
 *
 * The promote is best-effort exactly like gauge-vote's promotion: a vote that
 * saved is a real answer, and failing the whole action because the promote
 * transaction errored (or lost a race) would throw away something the member
 * actually said. Logged, never re-thrown.
 */
export async function proposalVoteAction(
  _prevState: ProposalVoteState,
  formData: FormData
): Promise<ProposalVoteState> {
  const proposalId = (formData.get("proposalId") as string | null)?.trim() ?? ""
  const answerRaw = (formData.get("answer") as string | null)?.trim() ?? ""

  if (!proposalId) {
    return { errors: { general: "That question is gone." } }
  }

  if (!ANSWERS.includes(answerRaw)) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const answer = answerRaw as ProposalVoteAnswer

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in to answer." } }
  }

  const user = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } })
  if (!user) {
    return { errors: { general: "You need to be signed in to answer." } }
  }

  const proposal = await prisma.changeProposal.findUnique({
    where: { id: proposalId },
    include: { event: true },
  })

  if (!proposal || proposal.kind !== ProposalKind.GROUP) {
    return { errors: { general: "That question is gone." } }
  }

  if (proposal.answer !== null) {
    return { errors: { general: "That one's settled." } }
  }

  const now = new Date()
  if (
    proposal.event.startsAt.getTime() <= now.getTime() ||
    proposal.proposedStartsAt.getTime() <= now.getTime() ||
    proposal.priorStartsAt.getTime() !== proposal.event.startsAt.getTime()
  ) {
    return { errors: { general: STALE_PROPOSAL_ERROR } }
  }

  // Membership, via the shared check every gate now uses. (Historically this
  // was the product's only membership-gated write; the share-readiness slice
  // made it the rule rather than the exception.)
  if (!(await isGroupMember(user.id, proposal.groupId))) {
    return { errors: { general: "Only members can vote on this." } }
  }

  try {
    await prisma.proposalVote.upsert({
      where: { proposalId_userId: { proposalId: proposal.id, userId: user.id } },
      create: { proposalId: proposal.id, userId: user.id, answer },
      update: { answer },
    })
  } catch (err) {
    console.error("[proposal-vote] vote save failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // Only a YES can clear the bar (a KEEP only raises the incumbent's side), so
  // there's nothing to promote on a KEEP. Best-effort on purpose, the same
  // gauge-vote precedent: the vote already saved, and a failed or lost-race
  // promote must never eat it.
  if (answer === ProposalVoteAnswer.YES) {
    try {
      await promoteProposalMove(proposal.id, new Date())
    } catch (err) {
      console.error("[proposal-vote] promote failed", err)
    }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // In Next.js it uses a similar internal throw mechanism to redirect() and
  // would be swallowed if placed inside the catch block.
  revalidatePath(`/groups/${proposal.groupId}`)
  revalidatePath(`/events/${proposal.eventId}`)
  return {}
}
