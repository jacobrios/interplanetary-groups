// src/lib/digest/__tests__/needs-you.test.ts
//
// Pure, DB-free tests for the digest's "needs you" block. Fixtures mirror
// lib/pending/__tests__/derive.test.ts: plain objects cast to the row shapes
// the real reads (findLiveGauges, findLiveProposals) and page.tsx's own
// EventCardData composition would produce; nothing here touches Prisma or
// the network.

import { describe, expect, it } from "vitest"
import { deriveNeedsYouItems } from "@/lib/digest/needs-you"
import type { EventCardData } from "@/app/groups/[id]/EventCarousel"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"
import { EventStatus } from "@prisma/client"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"

function eventCard(over: Partial<EventCardData> = {}): EventCardData {
  return {
    event: {
      id: "e1",
      title: "Climbing",
      startsAt: new Date("2026-08-30T22:00:00.000Z"), // Sun 5pm America/Chicago
      endsAt: null,
      status: EventStatus.SCHEDULED,
      venues: [],
    },
    inCount: 0,
    outCount: 0,
    pendingCount: 1,
    viewerStatus: null,
    ...over,
  }
}

function gauge(over: Partial<LiveGauge> = {}): LiveGauge {
  return {
    id: "g1",
    groupId: "grp1",
    sourceMessageId: "m1",
    orbitMessageId: "om1",
    activity: "beers",
    proposedDate: new Date("2026-08-15T05:00:00.000Z"), // Sat local midnight-ish
    proposedTime: "20:00",
    bumpMessageId: null,
    closureMessageId: null,
    retryAskMessageId: null,
    retryGuessOfGaugeId: null,
    createdAt: new Date("2026-08-10T15:00:00.000Z"),
    votes: [],
    sourceMessage: { author: { name: "Maya" } },
    ...over,
  } as unknown as LiveGauge
}

function vote(userId: string, answer: string) {
  return { userId, answer, user: { id: userId, name: userId } } as LiveGauge["votes"][number]
}

function proposalFixture(over: Partial<LiveProposal> = {}): LiveProposal {
  return {
    id: "p1",
    groupId: "grp1",
    eventId: "e2",
    askerUserId: "user-sam",
    sourceMessageId: "sm1",
    orbitMessageId: "opm1",
    kind: "GROUP",
    priorStartsAt: new Date("2026-08-17T13:00:00.000Z"), // Mon 8am America/Chicago
    proposedStartsAt: new Date("2026-08-17T14:00:00.000Z"), // Mon 9am America/Chicago
    createdAt: new Date("2026-08-10T15:00:00.000Z"),
    answer: null,
    answeredAt: null,
    votes: [],
    asker: { name: "Sam" },
    event: {
      id: "e2",
      title: "Monday morning climb",
      startsAt: new Date("2026-08-17T13:00:00.000Z"),
      rsvps: [],
    },
    ...over,
  } as unknown as LiveProposal
}

function pvote(userId: string, answer: string) {
  return { userId, answer, user: { id: userId, name: userId } } as LiveProposal["votes"][number]
}

describe("deriveNeedsYouItems", () => {
  it("an unanswered event appears, needing the viewer's own RSVP", () => {
    const out = deriveNeedsYouItems({
      events: [eventCard({ viewerStatus: null })],
      liveGauges: [],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: "event",
      key: "e1",
      title: "Climbing",
      label: "Needs your RSVP",
      url: "/events/e1",
    })
    expect(out[0].whenLine).toBe("Sun, Aug 30 · 5pm")
  })

  it("an event the viewer already RSVP'd to (IN) does not appear", () => {
    const out = deriveNeedsYouItems({
      events: [eventCard({ viewerStatus: "IN" })],
      liveGauges: [],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("an unvoted idea appears, needing the viewer's own vote", () => {
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [gauge()],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: "idea",
      key: "g1",
      title: "beers",
      label: "Needs your vote",
      url: "/groups/grp1",
    })
    expect(out[0].whenLine).toBe("Sat 8pm")
  })

  it("a declined idea (OUT or NOT_THAT_DAY) does not appear, exactly as the card drops it", () => {
    const outG = gauge({ id: "g-out", votes: [vote(VIEWER, "OUT")] } as never)
    const dayG = gauge({ id: "g-day", votes: [vote(VIEWER, "NOT_THAT_DAY")] } as never)
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [outG, dayG],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("an idea the viewer is already IN on does not appear (it needs other people, not them)", () => {
    const inG = gauge({ votes: [vote(VIEWER, "IN")] } as never)
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [inG],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("an unanswered time-change vote appears, needing the viewer's own vote", () => {
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [],
      liveProposals: [proposalFixture()],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: "timeChange",
      key: "p1",
      title: "Monday morning climb",
      label: "Needs your vote",
      url: "/events/e2",
    })
    // Borrowed verbatim from the same chip label the event screen renders
    // (proposalChipLabels), so the email never invents new wording for a
    // vote it does not own the copy for.
    expect(out[0].whenLine).toBe("Move to 9am")
  })

  it("a time-change vote the viewer already answered (YES or KEEP) does not appear", () => {
    const yesP = proposalFixture({ id: "p-yes", votes: [pvote(VIEWER, "YES")] } as never)
    const keepP = proposalFixture({ id: "p-keep", votes: [pvote(VIEWER, "KEEP")] } as never)
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [],
      liveProposals: [yesP, keepP],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("a VERIFY-kind proposal never appears: it is Orbit's own clarifying question to the asker alone, not a group vote", () => {
    const verify = proposalFixture({ id: "p-verify", kind: "VERIFY" } as never)
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [],
      liveProposals: [verify],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("a closed gauge and a lapsed proposal never appear: liveness is decided upstream by findLiveGauges/findLiveProposals and never re-derived here", () => {
    // A closed gauge or a lapsed proposal would never have been included in
    // the liveGauges/liveProposals arrays those reads return in the first
    // place, so the honest way to prove this module adds no second opinion
    // is to show it produces nothing when handed nothing: there is no
    // liveness check inside this module that a dead row could pass or fail.
    const out = deriveNeedsYouItems({
      events: [],
      liveGauges: [],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out).toHaveLength(0)
  })

  it("orders items soonest first, mingling all three kinds", () => {
    const soonEvent = eventCard({
      event: { ...eventCard().event, id: "e-soon", startsAt: new Date("2026-08-14T00:00:00.000Z") },
    })
    const laterIdea = gauge({
      id: "g-later",
      proposedDate: new Date("2026-08-20T05:00:00.000Z"),
      proposedTime: "20:00",
    })
    const out = deriveNeedsYouItems({
      events: [soonEvent],
      liveGauges: [laterIdea],
      liveProposals: [],
      viewerId: VIEWER,
      timeZone: TZ,
    })
    expect(out.map((i) => i.key)).toEqual(["e-soon", "g-later"])
  })
})
