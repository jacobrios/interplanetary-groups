import { describe, it, expect } from "vitest"
import { planChange, type ChangeTarget } from "../change-plan"
import type { NormalizedChange } from "../spark"
import { PAST_TIME_REPLY } from "../change-copy"

const ZONE = "UTC"
const NOW = new Date("2099-06-10T12:00:00Z") // Wed noon
const TARGET: ChangeTarget = {
  id: "evt1",
  label: "climbing",
  startsAt: new Date("2099-06-14T08:00:00Z"), // Sun 8am
}

function change(overrides: Partial<NormalizedChange> = {}): NormalizedChange {
  return {
    targetEventIndex: 0,
    requestedTime: "18:00",
    requestedTimeAmbiguous: false,
    requestedFields: ["time"],
    intentClear: true,
    ...overrides,
  }
}

describe("planChange", () => {
  it("clear time request moves, announcement included", () => {
    const p = planChange(change(), TARGET, ZONE, NOW)
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T18:00:00.000Z")
    expect(p.announcement).toContain("Done. Climbing this Sun is moving to 6pm, it was 8am.")
  })

  it("probable intent asks instead of moving", () => {
    const p = planChange(change({ intentClear: false }), TARGET, ZONE, NOW)
    if (p.action !== "ask") throw new Error(`expected ask, got ${p.action}`)
    expect(p.proposedStartsAt.toISOString()).toBe("2099-06-14T18:00:00.000Z")
    expect(p.question).toBe(
      "Sounds like you want climbing this Sun moved to 6pm. Want me to make the change?"
    )
  })

  it("a bare hour inherits the plan's part of day before planning", () => {
    const p = planChange(
      change({ requestedTime: "21:00", requestedTimeAmbiguous: true }),
      TARGET,
      ZONE,
      NOW
    )
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T09:00:00.000Z")
    expect(p.announcement).toContain("I took that as 9am")
  })

  it("no target means silence, not a guess", () => {
    expect(planChange(change(), null, ZONE, NOW)).toEqual({ action: "quiet" })
  })

  it("a clearly asked non-time request gets the honest decline", () => {
    const p = planChange(change({ requestedFields: ["venue"] }), TARGET, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't change the spot yet")
  })

  it("a probable non-time request stays quiet rather than interjecting", () => {
    expect(
      planChange(change({ requestedFields: ["venue"], intentClear: false }), TARGET, ZONE, NOW)
    ).toEqual({ action: "quiet" })
  })

  it("a compound day-and-time request declines rather than acting on half", () => {
    const p = planChange(change({ requestedFields: ["day", "time"] }), TARGET, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't move it to another day yet")
  })

  it("a time request with no concrete time is nothing to propose", () => {
    expect(planChange(change({ requestedTime: null }), TARGET, ZONE, NOW)).toEqual({
      action: "quiet",
    })
  })

  it("a resolved instant in the past gets the honest reply when clearly asked", () => {
    const sameDayTarget: ChangeTarget = { ...TARGET, startsAt: new Date("2099-06-10T20:00:00Z") }
    const p = planChange(change({ requestedTime: "08:00" }), sameDayTarget, ZONE, NOW)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toBe(PAST_TIME_REPLY)
  })

  it("moving to the time it already has is a quiet no-op", () => {
    expect(planChange(change({ requestedTime: "08:00" }), TARGET, ZONE, NOW)).toEqual({
      action: "quiet",
    })
  })
})
