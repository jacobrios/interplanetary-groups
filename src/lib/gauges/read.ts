// src/lib/gauges/read.ts
//
// Reads the gauges a group is currently being asked about, with everything the
// tally line needs. Counts and names are never stored, so they are always read
// back off the vote rows here.

import { prisma } from "@/lib/prisma"
import type { Gauge, GaugeVote, User } from "@prisma/client"
import { isGaugeLive } from "@/lib/orbit/spark"

export type LiveGauge = Gauge & {
  votes: (GaugeVote & { user: User })[]
}

/**
 * Two days of slack on either side of `now`, so the coarse database filter can
 * never exclude a gauge that the precise check would have called live. Every
 * IANA offset sits well inside 24 hours.
 */
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Every gauge in the group whose proposed day has not yet ended in the group's
 * own timezone.
 *
 * The database narrows by date; the exact boundary is decided by isGaugeLive,
 * because "has that day passed" is a question about the group's local calendar
 * and Postgres holds only the instant.
 */
export async function findLiveGauges(groupId: string, now: Date): Promise<LiveGauge[]> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { timeZone: true },
  })
  if (!group) return []

  const candidates = await prisma.gauge.findMany({
    where: {
      groupId,
      proposedDate: { gte: new Date(now.getTime() - WINDOW_MS) },
    },
    include: {
      votes: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  })

  return candidates.filter((g) => isGaugeLive(g.proposedDate, group.timeZone, now))
}
