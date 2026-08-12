// src/lib/proposals/__tests__/tally.test.ts
//
// Pure, DB-free tests pinning deriveGroupProposalTally's output: the single
// computation now shared by the group home's live feed (page.tsx) and the
// card region's per-viewer bands (lib/pending/derive.ts). Fixtures mirror
// lib/pending/__tests__/derive.test.ts's proposalFixture, since that is
// exactly the shape the two real callers pass in.

import { describe, expect, it } from "vitest"
import { deriveGroupProposalTally } from "../tally"
import type { LiveProposal } from "../read"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"
const memberIds = new Set([VIEWER, "user-maya", "user-jesse", "user-sam"])

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

describe("deriveGroupProposalTally", () => {
  it("composes chip labels from the proposed and prior times", () => {
    const tally = deriveGroupProposalTally({
      proposal: proposalFixture(), viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(tally.labels).toEqual({ yes: "9am works", keep: "Keep 8am" })
  })

  it("empty tally line until someone votes", () => {
    const tally = deriveGroupProposalTally({
      proposal: proposalFixture(), viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(tally.tallyLine).toBe("")
  })

  it("names yes voters and counts keep voters, member-filtered", () => {
    const p = proposalFixture({
      votes: [
        pvote("user-maya", "YES", "Maya"),
        pvote("user-jesse", "KEEP", "Jesse"),
        pvote("outsider", "YES", "Ghost"),
      ],
    } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(tally.tallyLine).toContain("Maya")
    expect(tally.tallyLine).not.toContain("Ghost")
    expect(tally.tallyLine).toContain("1 would keep it")
  })

  it("adds the one-more-clears-it countdown once a member IN rsvp is in play", () => {
    const p = proposalFixture({
      votes: [pvote("user-maya", "YES", "Maya"), pvote("user-jesse", "YES", "Jesse")],
      event: {
        id: "e1", title: "Monday morning climb",
        startsAt: new Date("2026-08-17T13:00:00.000Z"),
        rsvps: [{ userId: "user-sam", status: "IN" }],
      },
    } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: VIEWER, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(tally.tallyLine).toContain("one more")
  })

  it("reads the viewer's own answer from unfiltered votes, member or not", () => {
    const p = proposalFixture({ votes: [pvote(VIEWER, "KEEP")] } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: VIEWER, memberIds: new Set(["user-maya"]), memberCount: 4, timeZone: TZ,
    })
    expect(tally.viewerAnswer).toBe("KEEP")
  })

  it("a null viewerId (no session) reads no viewer answer", () => {
    const p = proposalFixture({ votes: [pvote("user-maya", "YES", "Maya")] } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: null, memberIds, memberCount: 4, timeZone: TZ,
    })
    expect(tally.viewerAnswer).toBeNull()
  })
})
