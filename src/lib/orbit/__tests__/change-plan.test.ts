import { describe, it, expect } from "vitest"
import { planChange, type ChangeTarget } from "../change-plan"
import type { NormalizedChange } from "../spark"
import { NO_PLANS_ALL_CALLED_OFF_REPLY, NO_PLANS_REPLY, PAST_TIME_REPLY } from "../change-copy"

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
  it("clear time request in a solo group moves, announcement included", () => {
    const p = planChange(change(), TARGET, [TARGET], "Sam", 1, ZONE, NOW, false)
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T18:00:00.000Z")
    expect(p.announcement).toContain("Done. Climbing this Sun is moving to 6pm, it was 8am.")
  })

  it("probable intent asks instead of moving", () => {
    const p = planChange(change({ intentClear: false }), TARGET, [TARGET], "Sam", 5, ZONE, NOW, false)
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
      [TARGET],
      "Sam",
      1,
      ZONE,
      NOW,
      false
    )
    if (p.action !== "move") throw new Error(`expected move, got ${p.action}`)
    expect(p.newStartsAt.toISOString()).toBe("2099-06-14T09:00:00.000Z")
    expect(p.announcement).toContain("I took that as 9am")
  })

  it("a clearly asked non-time request gets the honest decline", () => {
    const p = planChange(change({ requestedFields: ["venue"] }), TARGET, [TARGET], "Sam", 5, ZONE, NOW, false)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't change the spot from chat")
  })

  it("a compound day-and-time request declines rather than acting on half", () => {
    const p = planChange(change({ requestedFields: ["day", "time"] }), TARGET, [TARGET], "Sam", 5, ZONE, NOW, false)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toContain("I can't move it to another day from chat")
  })

  it("a resolved instant in the past gets the honest reply when clearly asked", () => {
    const sameDayTarget: ChangeTarget = { ...TARGET, startsAt: new Date("2099-06-10T20:00:00Z") }
    const p = planChange(change({ requestedTime: "08:00" }), sameDayTarget, [sameDayTarget], "Sam", 5, ZONE, NOW, false)
    if (p.action !== "reply") throw new Error(`expected reply, got ${p.action}`)
    expect(p.body).toBe(PAST_TIME_REPLY)
  })
})

describe("the rewritten ladder: never silent on a direct ask", () => {
  // Shared fixtures: two plans, the shape of the owner's two-plan sandbox.
  const climbing = { id: "e1", label: "climbing", startsAt: new Date("2026-07-28T13:00:00Z") }
  const beers = { id: "e2", label: "beers", startsAt: new Date("2026-07-30T01:00:00Z") }
  const both = [climbing, beers]
  const TZ = "America/Chicago"
  const now = new Date("2026-07-26T15:00:00Z")
  const change = (over: Partial<NormalizedChange>): NormalizedChange => ({
    targetEventIndex: 0,
    requestedTime: "09:00",
    requestedTimeAmbiguous: false,
    requestedFields: ["time"],
    intentClear: true,
    ...over,
  })

  it("a clear complete request proposes to the group, not a move", () => {
    const plan = planChange(change({}), climbing, both, "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("propose")
  })

  it("a solo group still moves immediately (part one as the degenerate case)", () => {
    const plan = planChange(change({}), climbing, both, "Sam", 1, TZ, now, false)
    expect(plan.action).toBe("move")
  })

  it("a probable complete request still verifies with the asker first", () => {
    const plan = planChange(change({ intentClear: false }), climbing, both, "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("ask")
  })

  it("a time request with a target but no time asks which time", () => {
    const plan = planChange(change({ requestedTime: null }), climbing, both, "Sam", 5, TZ, now, false)
    expect(plan).toEqual({ action: "reply", body: "Happy to move climbing. What time were you thinking?" })
  })

  it("asks which plan when a change request names nothing at all", () => {
    // The shape normalize now lets through: no target, no time, no field.
    const plan = planChange(
      change({ targetEventIndex: null, requestedTime: null, requestedFields: [] }),
      null,
      both,
      "Sam",
      4,
      TZ,
      now,
      false
    )
    expect(plan.action).toBe("reply")
    if (plan.action !== "reply") throw new Error("unreachable")
    expect(plan.body).toContain("Which plan")
  })

  it("same-time request gets the honest one-liner, not silence", () => {
    const plan = planChange(change({ requestedTime: "08:00" }), climbing, both, "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("reply")
    expect((plan as { body: string }).body).toContain("already at 8am")
  })

  it("a past time replies whether clear or probable", () => {
    const past = { ...climbing, startsAt: new Date("2026-07-20T13:00:00Z") }
    const plan = planChange(change({ intentClear: false }), past, [past], "Sam", 5, TZ, now, false)
    expect(plan).toEqual({ action: "reply", body: PAST_TIME_REPLY })
  })

  it("no plans on the calendar gets the honest no-plans reply", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, [], "Sam", 5, TZ, now, false)
    expect(plan).toEqual({ action: "reply", body: NO_PLANS_REPLY })
  })

  it("one plan and a null target resolves to that plan, not a question", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, [climbing], "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("propose")
  })

  // The three owner-QA failures, replayed as fixtures.
  it("QA 1, wrong-target bare follow-up: an unresolvable target asks which plan", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, both, "Sam", 5, TZ, now, false)
    expect(plan).toEqual({
      action: "reply",
      body: "I can move a time. Which plan do you mean, climbing or beers?",
    })
  })

  it("QA 2, the dead correction: a complete recovered reading proposes, never silence", () => {
    // The window lets the model fill target=beers and time=21:00 from context;
    // by the time the ladder sees it, it is an ordinary complete request.
    const plan = planChange(change({ targetEventIndex: 1, requestedTime: "21:00" }), beers, both, "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("propose")
  })

  it("QA 3, ambiguous 'it': a venue ask declines with or without a target", () => {
    const noTarget = planChange(
      change({ targetEventIndex: null, requestedFields: ["venue"], requestedTime: null, intentClear: false }),
      null, both, "Sam", 5, TZ, now, false
    )
    expect(noTarget.action).toBe("reply")
    expect((noTarget as { body: string }).body).toContain("can't change the spot from chat")
  })
})

describe("QA 2 Sept, the 'Thursday' failure: nothing to move outranks what kind of change", () => {
  const climbing = { id: "e1", label: "climbing", startsAt: new Date("2026-07-28T13:00:00Z") }
  const TZ = "America/Chicago"
  const now = new Date("2026-07-26T15:00:00Z")
  const change = (over: Partial<NormalizedChange>): NormalizedChange => ({
    targetEventIndex: null,
    requestedTime: null,
    requestedTimeAmbiguous: false,
    requestedFields: ["day"],
    intentClear: true,
    ...over,
  })

  it("(a) a day request with no candidates gets the no-plans reply, not the day decline", () => {
    const plan = planChange(change({}), null, [], "Sam", 5, TZ, now, false)
    expect(plan).toEqual({ action: "reply", body: NO_PLANS_REPLY })
  })

  it("(b) a day request with candidates still gets the day decline, exactly as before", () => {
    const plan = planChange(change({}), climbing, [climbing], "Sam", 5, TZ, now, false)
    expect(plan.action).toBe("reply")
    expect((plan as { body: string }).body).toContain("I can't move it to another day from chat")
  })

  it("(c) no candidates and no called-off plans gets NO_PLANS_REPLY", () => {
    const plan = planChange(change({}), null, [], "Sam", 5, TZ, now, false)
    expect(plan).toEqual({ action: "reply", body: NO_PLANS_REPLY })
  })

  it("(d) no candidates with called-off plans gets the all-called-off reply", () => {
    const plan = planChange(change({}), null, [], "Sam", 5, TZ, now, true)
    expect(plan).toEqual({ action: "reply", body: NO_PLANS_ALL_CALLED_OFF_REPLY })
  })
})
