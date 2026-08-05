// src/lib/gauges/open-ask.ts
//
// Derives "Orbit has an unanswered day-ask open in this group" from stored
// state alone (spec decision 2: no new fields). The window opens when the
// retry ask posts and closes the moment ANY new same-activity gauge exists,
// a member's answer or Orbit's own guess alike. That is deliberately wider
// than endgame.ts's answered-test, which excludes guess gauges for its own
// concurrency reasons: once the guess is up, a day reply is a comment on a
// live gauge (a queued seam), not an answer to the ask.

import { prisma } from "@/lib/prisma"

/**
 * Safety cap only. In a healthy sweep the guess posts the next evening and
 * closes the window itself within about a day; the cap keeps an ask from
 * lingering open forever if the sweep is down long enough for the gauge to
 * age out of the candidate window without ever guessing.
 */
export const RETRY_ASK_OPEN_HOURS = 48

export interface OpenRetryAsk {
  gaugeId: string
  activity: string
  proposedDate: Date
  proposedTime: string | null
  askCreatedAt: Date
}

export async function findOpenRetryAsk(groupId: string, now: Date): Promise<OpenRetryAsk | null> {
  const cutoff = new Date(now.getTime() - RETRY_ASK_OPEN_HOURS * 60 * 60 * 1000)

  const candidates = await prisma.gauge.findMany({
    where: {
      groupId,
      retryAskMessageId: { not: null },
      retryAskMessage: { createdAt: { gt: cutoff } },
    },
    include: { retryAskMessage: { select: { createdAt: true } } },
    orderBy: { retryAskMessage: { createdAt: "desc" } },
  })

  for (const gauge of candidates) {
    const askCreatedAt = gauge.retryAskMessage?.createdAt
    if (!askCreatedAt) continue
    const answered = await prisma.gauge.findFirst({
      where: {
        groupId,
        id: { not: gauge.id },
        activity: { equals: gauge.activity, mode: "insensitive" },
        createdAt: { gt: askCreatedAt },
      },
      select: { id: true },
    })
    if (!answered) {
      return {
        gaugeId: gauge.id,
        activity: gauge.activity,
        proposedDate: gauge.proposedDate,
        proposedTime: gauge.proposedTime,
        askCreatedAt,
      }
    }
  }
  return null
}
