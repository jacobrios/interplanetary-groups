// src/lib/gauges/read.ts
//
// Reads the gauges a group is currently being asked about, with everything the
// tally line needs. Counts and names are never stored, so they are always read
// back off the vote rows here.

import { prisma } from "@/lib/prisma"
import type { Gauge, GaugeVote, User } from "@prisma/client"
import { isGaugeLive } from "@/lib/orbit/spark-copy"

export type LiveGauge = Gauge & {
  votes: (GaugeVote & { user: User })[]
}

/**
 * How far back of `now` the coarse database filter reaches. Two days, so it
 * can never exclude a gauge the precise check would have called live: the
 * widest a local day can still be open is under 24 hours behind. There is no
 * upper bound because a proposed day is never more than eight days out.
 */
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Every gauge in the group that is still asking: its proposed day has not ended
 * in the group's own timezone, and it has not already produced its event.
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
      // A gauge that produced its event is finished asking. Its message stays
      // in the feed as history, exactly like an expired one: no chips, no
      // tally, no residue. Whether a gauge is closed is derived from the
      // event's existence and never stored.
      event: null,
    },
    include: {
      votes: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  })

  return candidates.filter((g) => isGaugeLive(g, group.timeZone, now))
}
