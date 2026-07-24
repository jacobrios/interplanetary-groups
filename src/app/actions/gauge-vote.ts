// src/app/actions/gauge-vote.ts
"use server"

import { revalidatePath } from "next/cache"
import { GaugeAnswer } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { castVote } from "@/lib/gauges/vote"
import { isGaugeLive } from "@/lib/orbit/spark-copy"

export interface GaugeVoteState {
  errors?: {
    general?: string
  }
}

const ANSWERS: string[] = [GaugeAnswer.IN, GaugeAnswer.OUT, GaugeAnswer.NOT_THAT_DAY]

/**
 * Server action: record the viewer's answer on one gauge.
 *
 * Same auth model as rsvpAction, for the same reason: the session is
 * re-verified server-side and the user is re-resolved from it inside the
 * write, so a client-passed id is never trusted. No anonymous session is
 * minted; the chips are not rendered for a viewer without one.
 *
 * Voting is not membership-gated, consistent with every other surface in the
 * product. That is the standing access-control gap, not a new one.
 */
export async function gaugeVoteAction(
  _prevState: GaugeVoteState,
  formData: FormData
): Promise<GaugeVoteState> {
  const gaugeId = (formData.get("gaugeId") as string | null)?.trim() ?? ""
  const answerRaw = (formData.get("answer") as string | null)?.trim() ?? ""

  if (!gaugeId) {
    return { errors: { general: "That question is gone. Please refresh and try again." } }
  }

  if (!ANSWERS.includes(answerRaw)) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const answer = answerRaw as GaugeAnswer

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errors: { general: "You need to be signed in to answer." } }
  }

  const gauge = await prisma.gauge.findUnique({
    where: { id: gaugeId },
    include: { group: { select: { id: true, timeZone: true } } },
  })

  if (!gauge) {
    return { errors: { general: "That question is gone. Please refresh and try again." } }
  }

  // Once the proposed day has passed the message is history, not a question.
  if (!isGaugeLive(gauge.proposedDate, gauge.group.timeZone, new Date())) {
    return { errors: { general: "That day has passed." } }
  }

  try {
    await castVote({ supabaseAuthId: user.id, gaugeId, answer })
  } catch {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // In Next.js it uses a similar internal throw mechanism to redirect() and
  // would be swallowed if placed inside the catch block.
  revalidatePath(`/groups/${gauge.group.id}`)
  return {}
}
