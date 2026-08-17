// src/lib/pending/__tests__/derive.test.ts
//
// Pure, DB-free tests for the card-region derivations. Fixtures are plain
// objects cast to the row types the real reads (findLiveGauges,
// findLiveProposals) would produce; nothing here touches Prisma or the
// network.

import { describe, expect, it } from "vitest"
import { deriveIdeaItems, deriveProposalBands } from "@/lib/pending/derive"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"
const memberIds = new Set([VIEWER, "user-maya", "user-jesse", "user-sam"])

function gauge(over: Partial<LiveGauge> = {}): LiveGauge {
  return {
    id: "g1", groupId: "grp", sourceMessageId: "m1", orbitMessageId: "om1",
    activity: "bouldering at the new east side gym",
    proposedDate: new Date("2026-08-15T05:00:00.000Z"), // Sat local midnight-ish
    proposedTime: "10:00", bumpMessageId: null, closureMessageId: null,
    retryAskMessageId: null, retryGuessOfGaugeId: null,
    createdAt: new Date("2026-08-10T15:00:00.000Z"),
    votes: [],
    sourceMessage: { author: { name: "Maya" } },
    ...over,
  } as unknown as LiveGauge
}

function vote(userId: string, answer: string, name = userId) {
  return { userId, answer, user: { id: userId, name } } as LiveGauge["votes"][number]
}

function proposalFixture(over: Partial<LiveProposal> = {}): LiveProposal {
  return {
    id: "p1", groupId: "grp", eventId: "e1", askerUserId: "user-sam",
    sourceMessageId: "sm1", orbitMessageId: "opm1",
    kind: "GROUP",
    priorStartsAt: new Date("2026-08-17T13:00:00.000Z"), // Mon 8am America/Chicago
    proposedStartsAt: new Date("2026-08-17T14:00:00.000Z"), // Mon 9am America/Chicago
    createdAt: new Date("2026-08-10T15:00:00.000Z"),
    answer: null, answeredAt: null,
    votes: [],
    asker: { name: "Sam" },
    event: {
      id: "e1", title: "Monday morning climb",
      startsAt: new Date("2026-08-17T13:00:00.000Z"),
      rsvps: [],
    },
    ...over,
  } as unknown as LiveProposal
}

function pvote(userId: string, answer: string, name = userId) {
  return { userId, answer, user: { id: userId, name } } as LiveProposal["votes"][number]
}

describe("deriveIdeaItems", () => {
  it("puts an unanswered gauge in the list with title and when line", () => {
    const out = deriveIdeaItems({ liveGauges: [gauge()], viewerId: VIEWER, memberIds, timeZone: TZ })
    expect(out).toHaveLength(1)
    const item = out[0]
    expect(item.title).toBe("bouldering at the new east side gym")
    expect(item.whenLine).toBe("Sat 10am")
    expect(item.chips.viewerAnswer).toBeNull()
  })

  it("a viewer IN vote stays present with viewerAnswer IN; OUT and NOT_THAT_DAY drop the item", () => {
    const inG = gauge({ id: "g-in", votes: [vote(VIEWER, "IN")] } as never)
    const outG = gauge({ id: "g-out", votes: [vote(VIEWER, "OUT")] } as never)
    const dayG = gauge({ id: "g-day", votes: [vote(VIEWER, "NOT_THAT_DAY")] } as never)
    const out = deriveIdeaItems({ liveGauges: [inG, outG, dayG], viewerId: VIEWER, memberIds, timeZone: TZ })
    expect(out.map((i) => i.key)).toEqual(["g-in"])
    expect(out[0].chips.viewerAnswer).toBe("IN")
  })

  it("tally line uses the card's counts form, member-filtered via buildCardTallyLine", () => {
    const g = gauge({ votes: [vote("user-maya", "IN", "Maya"), vote("outsider", "IN", "Ghost")] } as never)
    const out = deriveIdeaItems({ liveGauges: [g], viewerId: VIEWER, memberIds, timeZone: TZ })
    // A non-member vote is filtered out before the tally is built, so the
    // count reflects Maya alone, not both IN votes.
    expect(out[0].chips.tallyLine).toBe("1 in")
  })

  it("viewer answer is read from unfiltered votes, mirroring the feed", () => {
    const g = gauge({ votes: [vote(VIEWER, "IN")] } as never)
    const out = deriveIdeaItems({
      liveGauges: [g], viewerId: VIEWER, memberIds: new Set(["user-maya"]), timeZone: TZ,
    })
    // The viewer's own vote still surfaces even though the viewer is not in
    // memberIds: viewerAnswer is read from unfiltered rows.
    expect(out).toHaveLength(1)
    expect(out[0].chips.viewerAnswer).toBe("IN")
  })

  it("sorts soonest first", () => {
    const early = gauge({ id: "g-early", proposedDate: new Date("2026-08-12T05:00:00.000Z") } as never)
    const late = gauge({ id: "g-late", proposedDate: new Date("2026-08-20T05:00:00.000Z") } as never)
    const mid = gauge({ id: "g-mid", proposedDate: new Date("2026-08-15T05:00:00.000Z") } as never)
    const out = deriveIdeaItems({ liveGauges: [mid, late, early], viewerId: VIEWER, memberIds, timeZone: TZ })
    expect(out.map((i) => i.key)).toEqual(["g-early", "g-mid", "g-late"])
  })

  it("whenLine falls back to the weekday alone when proposedTime is null", () => {
    const g = gauge({ proposedTime: null } as never)
    const out = deriveIdeaItems({ liveGauges: [g], viewerId: VIEWER, memberIds, timeZone: TZ })
    expect(out[0].whenLine).toBe("Sat")
  })
})

describe("deriveProposalBands", () => {
  it("keys the band by event id and keeps KEEP voters' bands visible", () => {
    const bands = deriveProposalBands({
      liveProposals: [proposalFixture({ votes: [pvote(VIEWER, "KEEP")] } as never)],
      viewerId: VIEWER,
      memberIds,
      memberCount: 4,
      timeZone: TZ,
    })
    const band = bands.get(proposalFixture().event.id)
    expect(band).toBeDefined()
    expect(band!.chips.viewerAnswer).toBe("KEEP")
  })

  it("composes the objective question from stored facts alone", () => {
    const band = deriveProposalBands({
      liveProposals: [proposalFixture()], viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    }).get(proposalFixture().event.id)
    expect(band!.question).toBe("Move Monday morning climb to 9am?")
  })

  it("ignores non-GROUP proposals", () => {
    const bands = deriveProposalBands({
      liveProposals: [proposalFixture({ kind: "VERIFY" } as never)],
      viewerId: VIEWER,
      memberIds,
      memberCount: 4,
      timeZone: TZ,
    })
    expect(bands.size).toBe(0)
  })

  it("a member IN rsvp feeds oneMoreClearsIt through to the proposal tally", () => {
    const p = proposalFixture({
      votes: [pvote("user-maya", "YES", "Maya"), pvote("user-jesse", "YES", "Jesse")],
      event: {
        id: "e1", title: "Monday morning climb",
        startsAt: new Date("2026-08-17T13:00:00.000Z"),
        rsvps: [{ userId: "user-sam", status: "IN" }],
      },
    } as never)
    const bands = deriveProposalBands({
      liveProposals: [p], viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(bands.get("e1")!.chips.tallyLine).toContain("one more")
  })
})
