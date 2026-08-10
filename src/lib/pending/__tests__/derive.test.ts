// src/lib/pending/__tests__/derive.test.ts
//
// Pure, DB-free tests for the pending-set derivation. Fixtures are plain
// objects cast to the row types the real reads (findLiveGauges,
// findLiveProposals) would produce; nothing here touches Prisma or the
// network.

import { describe, expect, it } from "vitest"
import { derivePending } from "@/lib/pending/derive"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"
const MEMBERS = new Set([VIEWER, "user-maya", "user-jesse", "user-sam"])

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

function proposal(over: Partial<LiveProposal> = {}): LiveProposal {
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

describe("derivePending", () => {
  it("puts an unanswered gauge in waiting with kind line, title, when line", () => {
    const out = derivePending({ liveGauges: [gauge()], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting).toHaveLength(1)
    const item = out.waiting[0]
    expect(item.kind).toBe("gauge")
    expect(item.kindLine).toBe("New idea · from Maya")
    expect(item.title).toBe("bouldering at the new east side gym")
    if (item.kind === "gauge") {
      expect(item.whenLine).toBe("Sat 10am")
    }
  })

  it("drops the from-segment for an Orbit guess gauge", () => {
    const out = derivePending({ liveGauges: [gauge({ sourceMessageId: null, sourceMessage: null } as never)],
      liveProposals: [], viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].kindLine).toBe("New idea")
  })

  it("a viewer IN vote moves the gauge to standingYes; OUT and NOT_THAT_DAY exclude it", () => {
    const inG = gauge({ id: "g-in", votes: [vote(VIEWER, "IN")] } as never)
    const outG = gauge({ id: "g-out", votes: [vote(VIEWER, "OUT")] } as never)
    const dayG = gauge({ id: "g-day", votes: [vote(VIEWER, "NOT_THAT_DAY")] } as never)
    const out = derivePending({ liveGauges: [inG, outG, dayG], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting).toHaveLength(0)
    expect(out.standingYes.map((i) => i.key)).toEqual(["g-in"])
  })

  it("tally line matches the feed's grammar: member-filtered names via buildTallyLine", () => {
    const g = gauge({ votes: [vote("user-maya", "IN", "Maya"), vote("outsider", "IN", "Ghost")] } as never)
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].chips.tallyLine).toContain("Maya")
    expect(out.waiting[0].chips.tallyLine).not.toContain("Ghost")
  })

  it("viewer answer is read from unfiltered votes, mirroring the feed", () => {
    const g = gauge({ votes: [vote(VIEWER, "IN")] } as never)
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: new Set(["user-maya"]), memberCount: 1, timeZone: TZ })
    // The viewer's own vote splits the item into standingYes even though the
    // viewer is not in memberIds: viewerAnswer is read from unfiltered rows.
    expect(out.standingYes).toHaveLength(1)
  })

  it("GROUP proposals split by YES/KEEP/none; VERIFY proposals never appear", () => {
    const waiting = proposal({ id: "p-open" })
    const yes = proposal({ id: "p-yes", votes: [pvote(VIEWER, "YES")] } as never)
    const keep = proposal({ id: "p-keep", votes: [pvote(VIEWER, "KEEP")] } as never)
    const verify = proposal({ id: "p-verify", kind: "VERIFY" } as never)
    const out = derivePending({ liveGauges: [], liveProposals: [waiting, yes, keep, verify],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting.map((i) => i.key)).toEqual(["p-open"])
    expect(out.standingYes.map((i) => i.key)).toEqual(["p-yes"])
  })

  it("proposal rows carry now/new labels and the feed's proposal tally", () => {
    const p = proposal({}) // priorStartsAt Mon 8am local, proposedStartsAt Mon 9am local
    const out = derivePending({ liveGauges: [], liveProposals: [p],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    const item = out.waiting[0]
    expect(item.kind).toBe("proposal")
    expect(item.kindLine).toBe("Time change · from Sam")
    if (item.kind === "proposal") {
      expect(item.nowLabel).toBe("Mon 8am")
      expect(item.newLabel).toBe("Mon 9am")
    }
  })

  it("a member IN rsvp feeds oneMoreClearsIt through to the proposal tally", () => {
    const p = proposal({
      votes: [pvote("user-maya", "YES", "Maya"), pvote("user-jesse", "YES", "Jesse")],
      event: {
        id: "e1", title: "Monday morning climb",
        startsAt: new Date("2026-08-17T13:00:00.000Z"),
        rsvps: [{ userId: "user-sam", status: "IN" }],
      },
    } as never)
    const out = derivePending({ liveGauges: [], liveProposals: [p],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].chips.tallyLine).toContain("one more")
  })

  it("both groups sort soonest first across kinds", () => {
    const early = gauge({ id: "g-early", proposedDate: new Date("2026-08-12T05:00:00.000Z") } as never)
    const late = proposal({ id: "p-late", event: {
      id: "e2", title: "Late plan",
      startsAt: new Date("2026-08-20T13:00:00.000Z"),
      rsvps: [],
    } } as never)
    const mid = gauge({ id: "g-mid", proposedDate: new Date("2026-08-15T05:00:00.000Z") } as never)
    const out = derivePending({ liveGauges: [mid, early], liveProposals: [late],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting.map((i) => i.key)).toEqual(["g-early", "g-mid", "p-late"])
  })

  it("whenLine falls back to the weekday alone when proposedTime is null", () => {
    const g = gauge({ proposedTime: null } as never)
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    const item = out.waiting[0]
    if (item.kind === "gauge") {
      expect(item.whenLine).toBe("Sat")
    }
  })
})
