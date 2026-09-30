// src/lib/usage/collect.ts
//
// The read-only counting behind the weekly usage report. It answers "is
// anybody actually using this" from our own database: nothing new is
// collected, no vendor is involved, and only counts and group names come out,
// never a member's name or address. It NEVER writes, and it deliberately does
// not read ContactMethod: the owner is recognised by user id, resolved by the
// caller, so this file has no reason to see an address.
//
// The data is tiny (a handful of groups), so this fetches ids and timestamps
// with plain findMany and counts in memory. Clarity over query cleverness.
//
// "This week" is the seven days ending at `now`, inclusive at both ends.
// "All time" is every row up to `now`.

import { EventStatus, MessageAuthor, ProposalAnswer, ProposalKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export interface Count {
  week: number
  allTime: number
}

export interface UsageMetrics {
  /** allTime: distinct current members. week: distinct users who joined in the window. */
  people: Count
  /** Distinct users who opened a group in the window. Week only: no history exists. */
  openedActive: number
  /** Distinct users who sent a member message, RSVP'd or voted in the window. */
  didSomethingActive: number
  memberMessages: Count
  /** Gauges a member started. Orbit's own retry guesses have no source message and are not counted. */
  ideasFloated: Count
  /** Those gauges that became an event; the week side is by the event's createdAt. */
  ideasBecamePlans: Count
  /** By respondedAt, the latest answer time, so a changed old answer counts this week. */
  rsvps: Count
  timeChangesProposed: Count
  /** Group time changes that passed; the week side is by answeredAt. */
  timeChangesPassed: Count
  /** Events called off; the week side is by cancelledAt. */
  callsOff: Count
}

export interface GroupUsage {
  id: string
  name: string
  createdAt: Date
  metrics: UsageMetrics
}

export interface UsageReport {
  generatedAt: Date
  windowStart: Date
  /** Included groups; the week side is by Group.createdAt. */
  groups: Count
  /** Across all included groups. Distinct-user counts are distinct across groups, not summed. */
  overall: UsageMetrics
  /** Ordered by didSomethingActive desc, then memberMessages.allTime desc, then name. */
  perGroup: GroupUsage[]
  excludedGroupCount: number
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function collectUsage(
  now: Date,
  opts: { excludeUserIds: string[]; groupIds?: string[] }
): Promise<UsageReport> {
  const windowStart = new Date(now.getTime() - WEEK_MS)
  const inWindow = (d: Date | null): boolean => d !== null && d >= windowStart && d <= now
  const upToNow = (d: Date): boolean => d <= now

  const allGroups = await prisma.group.findMany({
    where: opts.groupIds ? { id: { in: opts.groupIds } } : undefined,
    select: {
      id: true,
      name: true,
      createdAt: true,
      founderId: true,
      memberships: { select: { userId: true, joinedAt: true, lastSeenAt: true } },
    },
  })

  const excludedUsers = new Set(opts.excludeUserIds)
  const included = allGroups.filter(
    (g) => !excludedUsers.has(g.founderId) && !g.memberships.some((m) => excludedUsers.has(m.userId))
  )
  const excludedGroupCount = allGroups.length - included.length
  const ids = included.map((g) => g.id)

  const [messages, rsvps, gauges, gaugeVotes, proposals, proposalVotes, cancelled] = await Promise.all([
    prisma.message.findMany({
      where: { groupId: { in: ids }, authorType: MessageAuthor.MEMBER, authorId: { not: null } },
      select: { groupId: true, authorId: true, createdAt: true },
    }),
    prisma.rsvp.findMany({
      where: { event: { groupId: { in: ids } } },
      select: { userId: true, respondedAt: true, event: { select: { groupId: true } } },
    }),
    prisma.gauge.findMany({
      where: { groupId: { in: ids }, sourceMessageId: { not: null } },
      select: { groupId: true, createdAt: true, event: { select: { createdAt: true } } },
    }),
    prisma.gaugeVote.findMany({
      where: { gauge: { groupId: { in: ids } } },
      select: { userId: true, updatedAt: true, gauge: { select: { groupId: true } } },
    }),
    prisma.changeProposal.findMany({
      where: { groupId: { in: ids }, kind: ProposalKind.GROUP },
      select: { groupId: true, answer: true, answeredAt: true, createdAt: true },
    }),
    prisma.proposalVote.findMany({
      where: { proposal: { groupId: { in: ids } } },
      select: { userId: true, updatedAt: true, proposal: { select: { groupId: true } } },
    }),
    prisma.event.findMany({
      where: { groupId: { in: ids }, status: EventStatus.CANCELLED },
      select: { groupId: true, cancelledAt: true },
    }),
  ])

  function metricsFor(groupIds: Set<string>): UsageMetrics {
    const memberships = included
      .filter((g) => groupIds.has(g.id))
      .flatMap((g) => g.memberships)
      .filter((m) => upToNow(m.joinedAt))
    const msgs = messages.filter((m) => groupIds.has(m.groupId) && upToNow(m.createdAt))
    const rs = rsvps.filter((r) => groupIds.has(r.event.groupId) && upToNow(r.respondedAt))
    const gs = gauges.filter((g) => groupIds.has(g.groupId) && upToNow(g.createdAt))
    const gvs = gaugeVotes.filter((v) => groupIds.has(v.gauge.groupId) && upToNow(v.updatedAt))
    const cps = proposals.filter((p) => groupIds.has(p.groupId) && upToNow(p.createdAt))
    const pvs = proposalVotes.filter((v) => groupIds.has(v.proposal.groupId) && upToNow(v.updatedAt))
    const off = cancelled.filter((e) => groupIds.has(e.groupId))
    const gaugesWithEvent = gs.filter((g) => g.event !== null && upToNow(g.event.createdAt))
    const passed = cps.filter((p) => p.answer === ProposalAnswer.CONFIRMED)

    const active = new Set<string>()
    for (const m of msgs) if (inWindow(m.createdAt)) active.add(m.authorId as string)
    for (const r of rs) if (inWindow(r.respondedAt)) active.add(r.userId)
    for (const v of gvs) if (inWindow(v.updatedAt)) active.add(v.userId)
    for (const v of pvs) if (inWindow(v.updatedAt)) active.add(v.userId)

    // New means the person's earliest join across these groups is in the
    // window, so someone already in one included group who joins another is
    // not new overall. For a single group this is just "joined it this week".
    const earliestJoin = new Map<string, Date>()
    for (const m of memberships) {
      const seen = earliestJoin.get(m.userId)
      if (!seen || m.joinedAt < seen) earliestJoin.set(m.userId, m.joinedAt)
    }

    return {
      people: {
        week: Array.from(earliestJoin.values()).filter((d) => inWindow(d)).length,
        allTime: new Set(memberships.map((m) => m.userId)).size,
      },
      openedActive: new Set(memberships.filter((m) => inWindow(m.lastSeenAt)).map((m) => m.userId)).size,
      didSomethingActive: active.size,
      memberMessages: {
        week: msgs.filter((m) => inWindow(m.createdAt)).length,
        allTime: msgs.length,
      },
      ideasFloated: {
        week: gs.filter((g) => inWindow(g.createdAt)).length,
        allTime: gs.length,
      },
      ideasBecamePlans: {
        week: gaugesWithEvent.filter((g) => inWindow(g.event!.createdAt)).length,
        allTime: gaugesWithEvent.length,
      },
      rsvps: {
        week: rs.filter((r) => inWindow(r.respondedAt)).length,
        allTime: rs.length,
      },
      timeChangesProposed: {
        week: cps.filter((p) => inWindow(p.createdAt)).length,
        allTime: cps.length,
      },
      timeChangesPassed: {
        week: passed.filter((p) => inWindow(p.answeredAt)).length,
        allTime: passed.length,
      },
      callsOff: {
        week: off.filter((e) => inWindow(e.cancelledAt)).length,
        allTime: off.length,
      },
    }
  }

  const perGroup: GroupUsage[] = included
    .filter((g) => upToNow(g.createdAt))
    .map((g) => ({ id: g.id, name: g.name, createdAt: g.createdAt, metrics: metricsFor(new Set([g.id])) }))
    .sort(
      (a, b) =>
        b.metrics.didSomethingActive - a.metrics.didSomethingActive ||
        b.metrics.memberMessages.allTime - a.metrics.memberMessages.allTime ||
        a.name.localeCompare(b.name)
    )

  const counted = included.filter((g) => upToNow(g.createdAt))
  return {
    generatedAt: now,
    windowStart,
    groups: { week: counted.filter((g) => inWindow(g.createdAt)).length, allTime: counted.length },
    overall: metricsFor(new Set(counted.map((g) => g.id))),
    perGroup,
    excludedGroupCount,
  }
}
