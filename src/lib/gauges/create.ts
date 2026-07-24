// src/lib/gauges/create.ts
//
// Writes one round of Orbit gauging interest: Orbit's message and the gauge
// that hangs off it.
//
// Both in ONE transaction, deliberately. A gauge with no message would render
// chips under nothing; a message with no gauge would be Orbit asking a
// question the product cannot answer. This closes by construction the
// non-transactional gap reconcile.ts logged as debt for its event-plus-
// announcement pair (noted there, not retrofitted here).

import { prisma } from "@/lib/prisma"
import { GaugeAnswer, MessageAuthor } from "@prisma/client"
import type { Gauge } from "@prisma/client"

export interface CreateGaugeInput {
  groupId: string
  /** The MEMBER message that sparked it. Also the idempotency key. */
  sourceMessageId: string
  activity: string
  /** Group-local midnight of the proposed day. */
  proposedDate: Date
  /** Orbit's composed message body. Copy lives in orbit/spark.ts, not here. */
  body: string
  /**
   * Set ONLY when the member named the proposed day themselves. Their message
   * already is a yes to that day, and asking them to tap a chip confirming the
   * day they just proposed is asking twice.
   *
   * Left unset when Orbit picked the day: floating an idea is not a yes to a
   * day chosen afterward, so they vote like anyone else.
   */
  initiatorUserId?: string | null
}

export type CreateGaugeResult =
  | { status: "created"; gauge: Gauge }
  | { status: "skipped"; reason: "already_gauged" }

/**
 * Creates the gauge, or reports that this message was already gauged.
 *
 * The unique constraint on sourceMessageId is the whole idempotency story: a
 * double-fired detection hits it and comes back as a skip, the same P2002
 * pattern reconcile.ts uses. The harm that matters is two Orbit messages for
 * one idea, and the constraint prevents exactly that.
 */
export async function createGauge({
  groupId,
  sourceMessageId,
  activity,
  proposedDate,
  body,
  initiatorUserId,
}: CreateGaugeInput): Promise<CreateGaugeResult> {
  try {
    const gauge = await prisma.$transaction(async (tx) => {
      const orbitMessage = await tx.message.create({
        data: {
          groupId,
          authorType: MessageAuthor.ORBIT,
          authorId: null,
          body,
        },
      })

      const created = await tx.gauge.create({
        data: {
          groupId,
          sourceMessageId,
          orbitMessageId: orbitMessage.id,
          activity,
          proposedDate,
        },
      })

      // Seeded inside the same transaction, so the gauge is never briefly
      // visible showing nobody in when somebody already is.
      if (initiatorUserId) {
        await tx.gaugeVote.create({
          data: { gaugeId: created.id, userId: initiatorUserId, answer: GaugeAnswer.IN },
        })
      }

      return created
    })

    return { status: "created", gauge }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_gauged" }
    }
    throw err
  }
}
