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
  /**
   * Group-local "HH:mm" the event will start at if this gauge reaches the bar.
   * Resolved at detection (stated time, or the part-of-day default) so
   * creation reads a stored value instead of re-deriving one from the original
   * message days later.
   */
  proposedTime: string
  /** Orbit's composed message body. Copy lives in orbit/spark-copy.ts, not here. */
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
  proposedTime,
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
          proposedTime,
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

export interface CreateRetryGuessInput {
  groupId: string
  /** The original gauge whose failed day this guess re-proposes. Also the idempotency key. */
  originGaugeId: string
  activity: string
  /** Group-local midnight, from chooseRetryGuessDate. */
  proposedDate: Date
  /** Copied verbatim from the original gauge (stored state is carried, not re-derived). */
  proposedTime: string
  /** Orbit's composed guess message body. Copy lives in orbit/spark-copy.ts, not here. */
  body: string
}

export type CreateRetryGuessResult =
  | { status: "created"; gauge: Gauge }
  | { status: "skipped"; reason: "already_guessed" }

/**
 * Creates Orbit's own retry guess gauge: no source message (Orbit named the
 * day, nobody else did), no seeded vote (Orbit is never a vote), and a link
 * back to the original gauge whose day did not work.
 *
 * The unique constraint on retryGuessOfGaugeId is the whole idempotency
 * story, the same P2002 pattern createGauge uses for sourceMessageId: a
 * double-fired retry sweep hits it and comes back as a skip, keeping the
 * one-guess-per-original rule true by construction rather than by caller
 * discipline.
 */
export async function createRetryGuessGauge({
  groupId,
  originGaugeId,
  activity,
  proposedDate,
  proposedTime,
  body,
}: CreateRetryGuessInput): Promise<CreateRetryGuessResult> {
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
          sourceMessageId: null,
          retryGuessOfGaugeId: originGaugeId,
          orbitMessageId: orbitMessage.id,
          activity,
          proposedDate,
          proposedTime,
        },
      })

      // No vote seeding here, unlike createGauge's initiatorUserId branch:
      // Orbit named the day, and Orbit is never a vote.

      return created
    })

    return { status: "created", gauge }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_guessed" }
    }
    throw err
  }
}
