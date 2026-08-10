// src/lib/gauges/day-comment.ts
//
// Records one member's day comment on a live gauge: their vote, the gauge's
// remembered suggestion (latest wins, all four fields overwritten together),
// and Orbit's one reply, in ONE transaction. Deliberately atomic: the reply
// announces the recorded inference, so it must never post without the record
// (or the record land without the reply).

import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"

export interface RecordDayCommentInput {
  groupId: string
  gaugeId: string
  /** The commenting member. Server-resolved by the caller, never client-passed. */
  userId: string
  /** Their comment message; stored as the suggestion anchor (spec decision 7). */
  messageId: string
  dayOfWeek: number
  /** Resolved "HH:mm" from the comment, or null when it named only a day. */
  suggestedTime: string | null
  /** True: their explicit IN stands and no vote row is touched (spec decision 2). */
  keepIn: boolean
  replyBody: string
}

export async function recordDayComment({
  groupId,
  gaugeId,
  userId,
  messageId,
  dayOfWeek,
  suggestedTime,
  keepIn,
  replyBody,
}: RecordDayCommentInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (!keepIn) {
      // No vote, a next-time, or a prior can't-that-day all land here:
      // naming a day is re-engaging with the idea (spec decision 2).
      await tx.gaugeVote.upsert({
        where: { gaugeId_userId: { gaugeId, userId } },
        create: { gaugeId, userId, answer: GaugeAnswer.NOT_THAT_DAY },
        update: { answer: GaugeAnswer.NOT_THAT_DAY },
      })
    }
    await tx.gauge.update({
      where: { id: gaugeId },
      data: {
        suggestedDayOfWeek: dayOfWeek,
        suggestedTime,
        suggestedByUserId: userId,
        suggestedMessageId: messageId,
      },
    })
    await tx.message.create({
      data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body: replyBody },
    })
  })
}
