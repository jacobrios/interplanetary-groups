// src/app/actions/proposal-answer.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { moveEventTime } from "@/lib/events/move"
import { buildChangeAnnouncement, STALE_PROPOSAL_ERROR } from "@/lib/orbit/change-copy"
import { ProposalAnswer } from "@prisma/client"

export interface ProposalAnswerState {
  errors?: { general?: string }
}

/**
 * Server action: the asker answers Orbit's change question with one tap.
 *
 * Same auth model as gaugeVoteAction: the session is re-verified server-side
 * and never trusted from the client. Only the asker may answer (the question
 * clarifies THEIR intent; the chips are only rendered for them, and this guard
 * makes that a rule rather than a rendering accident). Anyone else who wants
 * the change can say so in their own words, which is the normal path anyway.
 *
 * Confirm runs the exact same move transaction as a clear request, with the
 * proposal resolved inside it. The proposal's priorStartsAt is passed as the
 * move's expectation, so a plan that changed underneath the question comes
 * back as a stale skip and an honest error, never a surprise move.
 */
export async function proposalAnswerAction(
  _prevState: ProposalAnswerState,
  formData: FormData
): Promise<ProposalAnswerState> {
  const proposalId = (formData.get("proposalId") as string | null)?.trim() ?? ""
  const answerRaw = (formData.get("answer") as string | null)?.trim() ?? ""

  if (!proposalId || (answerRaw !== "CONFIRM" && answerRaw !== "DECLINE")) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

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
    include: { event: true, group: { select: { id: true, timeZone: true } } },
  })
  if (!proposal) {
    return { errors: { general: "That question is gone. Please refresh and try again." } }
  }
  if (proposal.askerUserId !== user.id) {
    return { errors: { general: "Only the person who asked can answer this one." } }
  }
  if (proposal.answer !== null) {
    return { errors: { general: "That one's settled." } }
  }

  const now = new Date()
  let errorMsg: string | null = null

  try {
    if (answerRaw === "DECLINE") {
      await prisma.changeProposal.update({
        where: { id: proposal.id },
        data: { answer: ProposalAnswer.DECLINED, answeredAt: now },
      })
    } else {
      if (proposal.event.startsAt.getTime() <= now.getTime()) {
        return { errors: { general: "That plan has already started." } }
      }
      const label =
        proposal.event.activityLabel ?? proposal.event.title.toLowerCase()
      const announcement = buildChangeAnnouncement(
        label,
        proposal.proposedStartsAt,
        proposal.priorStartsAt,
        proposal.group.timeZone,
        now,
        null // the question already named the time; nothing left to disclose
      )
      const moved = await moveEventTime({
        eventId: proposal.eventId,
        expectedStartsAt: proposal.priorStartsAt,
        newStartsAt: proposal.proposedStartsAt,
        requesterUserId: user.id,
        announcementBody: announcement,
        resolveProposalId: proposal.id,
      })
      if (moved.status === "skipped") {
        errorMsg = moved.reason === "stale" ? STALE_PROPOSAL_ERROR : "Couldn't save that, try again."
      }
    }
  } catch {
    errorMsg = "Couldn't save that, try again."
  }

  if (errorMsg) return { errors: { general: errorMsg } }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${proposal.group.id}`)
  revalidatePath(`/events/${proposal.eventId}`)
  return {}
}
