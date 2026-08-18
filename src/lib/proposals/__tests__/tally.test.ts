// src/lib/proposals/__tests__/tally.test.ts
//
// Pure, DB-free tests pinning deriveGroupProposalTally's output: the single
// composition shared by the group home's live feed (page.tsx) and the event
// screen's band (lib/pending/derive.ts). Fixtures mirror
// lib/pending/__tests__/derive.test.ts's proposalFixture, since that is
// exactly the shape the two real callers pass in. Member filtering left this
// module with the tally line it served (event-copy pass, 17 Aug 2026), so
// there is no memberIds set here any more.

import { describe, expect, it } from "vitest"
import { deriveGroupProposalTally } from "../tally"
import type { LiveProposal } from "../read"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"

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
      proposal: proposalFixture(), viewerId: VIEWER, timeZone: TZ,
    })
    expect(tally.labels).toEqual({ yes: "Move to 9am", keep: "Keep 8am" })
  })

  // The tally line is gone entirely (event-copy pass, 17 Aug 2026): the rule
  // behind it cannot be stated briefly, and naming who wants to move someone
  // else's plan turns a scheduling question into an argument with a
  // scoreboard. Nothing replaces it, so this shape carries labels and the
  // viewer's own answer and nothing else.
  it("carries no tally line at all", () => {
    const p = proposalFixture({
      votes: [
        pvote("user-maya", "YES", "Maya"),
        pvote("user-jesse", "KEEP", "Jesse"),
      ],
    } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: VIEWER, timeZone: TZ,
    })
    expect("tallyLine" in tally).toBe(false)
  })

  it("reads the viewer's own answer from unfiltered votes, member or not", () => {
    const p = proposalFixture({ votes: [pvote(VIEWER, "KEEP")] } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: VIEWER, timeZone: TZ,
    })
    expect(tally.viewerAnswer).toBe("KEEP")
  })

  it("a null viewerId (no session) reads no viewer answer", () => {
    const p = proposalFixture({ votes: [pvote("user-maya", "YES", "Maya")] } as never)
    const tally = deriveGroupProposalTally({
      proposal: p, viewerId: null, timeZone: TZ,
    })
    expect(tally.viewerAnswer).toBeNull()
  })
})
