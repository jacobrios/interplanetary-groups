// src/lib/events/__tests__/roster.test.ts
//
// Pure unit tests — no database.  deriveRoster and formatCounts are
// extracted from the inline logic in events/[id]/page.tsx so both the
// detail page and the compact home-screen card share one source of truth.
import { describe, it, expect } from "vitest"
import { deriveRoster, formatCounts } from "../roster"
import { RsvpStatus } from "@prisma/client"

// ── Minimal types matching what the queries return ────────────────────────────

type Member = { id: string; name: string }

function makeRsvp(userId: string, status: RsvpStatus) {
  return { userId, status }
}

// ── deriveRoster ──────────────────────────────────────────────────────────────

describe("deriveRoster", () => {
  const alice: Member = { id: "alice", name: "Alice" }
  const bob: Member = { id: "bob", name: "Bob" }
  const carol: Member = { id: "carol", name: "Carol" }

  it("places members with IN rsvps in the in bucket", () => {
    const result = deriveRoster(
      [alice, bob, carol],
      [makeRsvp("alice", RsvpStatus.IN)],
      null
    )
    expect(result.inMembers).toEqual([alice])
  })

  it("places members with OUT rsvps in the out bucket", () => {
    const result = deriveRoster(
      [alice, bob, carol],
      [makeRsvp("bob", RsvpStatus.OUT)],
      null
    )
    expect(result.outMembers).toEqual([bob])
  })

  it("places members with no rsvp row in the pending bucket (absent = haven't replied)", () => {
    const result = deriveRoster(
      [alice, bob, carol],
      [makeRsvp("alice", RsvpStatus.IN)],
      null
    )
    // bob and carol have no rsvp row
    expect(result.pendingMembers).toEqual([bob, carol])
  })

  it("returns viewerStatus null when viewer is null", () => {
    const result = deriveRoster([alice], [], null)
    expect(result.viewerStatus).toBeNull()
  })

  it("returns viewerStatus IN when viewer has an IN rsvp", () => {
    const result = deriveRoster(
      [alice],
      [makeRsvp("alice", RsvpStatus.IN)],
      "alice"
    )
    expect(result.viewerStatus).toBe(RsvpStatus.IN)
  })

  it("returns viewerStatus null when viewer has no rsvp row", () => {
    const result = deriveRoster([alice, bob], [], "alice")
    expect(result.viewerStatus).toBeNull()
  })

  it("handles an empty member list", () => {
    const result = deriveRoster([], [], null)
    expect(result.inMembers).toEqual([])
    expect(result.outMembers).toEqual([])
    expect(result.pendingMembers).toEqual([])
  })
})

// ── formatCounts ──────────────────────────────────────────────────────────────

describe("formatCounts", () => {
  it("shows In count always, even when zero", () => {
    const result = formatCounts({ inCount: 0, outCount: 0, pendingCount: 0 })
    expect(result).toContain("0 In")
  })

  it("includes In and TBD when there are no Out responses", () => {
    const result = formatCounts({ inCount: 4, outCount: 0, pendingCount: 4 })
    expect(result).toBe("4 In · 4 TBD")
  })

  it("omits Out when the out count is zero", () => {
    const result = formatCounts({ inCount: 4, outCount: 0, pendingCount: 4 })
    expect(result).not.toContain("Out")
  })

  it("includes Out only when there is at least one out response", () => {
    const result = formatCounts({ inCount: 4, outCount: 1, pendingCount: 4 })
    expect(result).toBe("4 In · 1 Out · 4 TBD")
  })

  it("uses separator dots between items — per CLAUDE.md separator-dot rule", () => {
    const result = formatCounts({ inCount: 4, outCount: 1, pendingCount: 4 })
    // Each segment is joined with ' · '
    const parts = result.split(" · ")
    expect(parts.length).toBeGreaterThan(1)
  })

  it("omits TBD when pending count is zero", () => {
    const result = formatCounts({ inCount: 4, outCount: 1, pendingCount: 0 })
    expect(result).not.toContain("TBD")
  })
})
