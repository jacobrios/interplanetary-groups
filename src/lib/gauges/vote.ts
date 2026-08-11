// src/lib/gauges/vote.ts

import { prisma } from "@/lib/prisma"
import type { GaugeVote } from "@prisma/client"
import { GaugeAnswer } from "@prisma/client"

interface CastVoteInput {
  supabaseAuthId: string
  gaugeId: string
  answer: GaugeAnswer
}

interface CastVoteResult {
  vote: GaugeVote
}

/**
 * Records one person's answer on one gauge, in one transaction.
 *
 * Data-layer guards, mirroring setRsvp for the same reasons:
 * 1. Re-resolves the user from supabaseAuthId inside the tx — never trusts a
 *    client-passed userId.
 * 2. Upserts on the @@unique([gaugeId, userId]) compound key, so changing your
 *    mind updates the single row rather than adding a second one. The compound
 *    unique is also the DB-level safety net against races.
 * 3. Throws "NO_USER" when no User row exists for the given auth id.
 * 4. Throws "NO_GAUGE" when no Gauge row exists for the given gauge id.
 * 5. Throws "NOT_A_MEMBER" when the resolved user is not a member of the
 *    gauge's group.
 *
 * Whether the gauge's day has passed is checked by the caller, which holds the
 * group's timezone; this layer records the answer it is given.
 */
export async function castVote({
  supabaseAuthId,
  gaugeId,
  answer,
}: CastVoteInput): Promise<CastVoteResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!user) throw new Error("NO_USER")

    // Membership gate (share-readiness slice): before this guard a
    // non-member's IN genuinely counted toward the three-yes bar and could be
    // the tap that created a real event for a group they were not in.
    const gauge = await tx.gauge.findUnique({
      where: { id: gaugeId },
      select: { groupId: true },
    })
    if (!gauge) throw new Error("NO_GAUGE")
    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: gauge.groupId } },
      select: { id: true },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")

    const vote = await tx.gaugeVote.upsert({
      where: { gaugeId_userId: { gaugeId, userId: user.id } },
      create: { gaugeId, userId: user.id, answer },
      update: { answer },
    })

    return { vote }
  })
}
