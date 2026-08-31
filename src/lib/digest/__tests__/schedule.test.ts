// src/lib/digest/__tests__/schedule.test.ts
//
// Pure, DB-free tests for "who gets one today": whether the digest's
// "needs you" block is allowed to carry anything at all today (the two send
// rules), and whether a given member may be sent anything today (the
// once-a-day guard plus the opt-out). Fixtures are plain objects, mirroring
// lib/digest/__tests__/needs-you.test.ts and you-missed.test.ts; nothing
// here touches Prisma or the network.
//
// Every date fixture is built with zonedWallTimeToUtc, the same fixture tool
// endgame.test.ts uses for its own non-UTC coverage, rather than hand-written
// ISO strings: a hand-picked UTC instant does not land on the intended
// group-local calendar day unless the zone's offset is subtracted correctly,
// and getting that arithmetic wrong in a fixture would silently test the
// wrong thing. Building every fixture through the same conversion the
// production code uses removes that whole class of test bug.

import { describe, expect, it } from "vitest"
import {
  isNeedsYouGateOpen,
  isDigestEligibleToday,
  type NeedsYouGateInput,
} from "@/lib/digest/schedule"
import { zonedWallTimeToUtc } from "@/lib/orbit/occurrence"

const TZ = "America/Chicago"

// A fixed "today", Chicago-local, used across most cases below. Noon so
// there is no risk of straddling the local day boundary by accident.
const NOW = zonedWallTimeToUtc(2026, 8, 20, 12, 0, TZ)

function gate(over: Partial<NeedsYouGateInput> = {}): NeedsYouGateInput {
  return {
    now: NOW,
    timeZone: TZ,
    ideas: [],
    timeChangeAsks: [],
    events: [],
    ...over,
  }
}

/** A Chicago-local instant `days` away from NOW's calendar day, at noon. */
function chicagoDay(days: number, hour = 12): Date {
  return zonedWallTimeToUtc(2026, 8, 20 + days, hour, 0, TZ)
}

describe("isNeedsYouGateOpen", () => {
  describe("rule one: the day a person created it", () => {
    it("fires when an idea was created today, group-local", () => {
      const out = isNeedsYouGateOpen(
        gate({ ideas: [{ createdAt: chicagoDay(0), proposedDate: chicagoDay(60) }] })
      )
      expect(out).toBe(true)
    })

    it("does not fire when an idea was created yesterday (adjacent day)", () => {
      const out = isNeedsYouGateOpen(
        gate({ ideas: [{ createdAt: chicagoDay(-1), proposedDate: chicagoDay(60) }] })
      )
      expect(out).toBe(false)
    })

    it("does not fire when an idea was created tomorrow (adjacent day, clock skew guard)", () => {
      const out = isNeedsYouGateOpen(
        gate({ ideas: [{ createdAt: chicagoDay(1), proposedDate: chicagoDay(60) }] })
      )
      expect(out).toBe(false)
    })

    it("fires when a time-change ask was created today", () => {
      const out = isNeedsYouGateOpen(gate({ timeChangeAsks: [{ createdAt: chicagoDay(0, 23) }] }))
      expect(out).toBe(true)
    })

    it("does not fire when a time-change ask was created yesterday", () => {
      const out = isNeedsYouGateOpen(gate({ timeChangeAsks: [{ createdAt: chicagoDay(-1, 23) }] }))
      expect(out).toBe(false)
    })

    it("the sparked inclusion: fires when a sparked event (gaugeId set) was created today", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(0, 13), startsAt: chicagoDay(21), gaugeId: "g1" }] })
      )
      expect(out).toBe(true)
    })

    it("the recurring exclusion: does NOT fire when a recurring event (gaugeId null) was created today", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(0, 13), startsAt: chicagoDay(21), gaugeId: null }] })
      )
      expect(out).toBe(false)
    })
  })

  describe("rule two: three days before it happens", () => {
    it("fires when an event starts exactly three days out, group-local (recurring event: both kinds count for rule two)", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(-19), startsAt: chicagoDay(3, 19), gaugeId: null }] })
      )
      expect(out).toBe(true)
    })

    it("also fires for a sparked event exactly three days out (both kinds count)", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(-19), startsAt: chicagoDay(3, 19), gaugeId: "g1" }] })
      )
      expect(out).toBe(true)
    })

    it("does not fire two days out (adjacent day)", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(-19), startsAt: chicagoDay(2, 19), gaugeId: null }] })
      )
      expect(out).toBe(false)
    })

    it("does not fire four days out (adjacent day)", () => {
      const out = isNeedsYouGateOpen(
        gate({ events: [{ createdAt: chicagoDay(-19), startsAt: chicagoDay(4, 19), gaugeId: null }] })
      )
      expect(out).toBe(false)
    })

    it("fires when an idea's proposed day is exactly three days out", () => {
      const out = isNeedsYouGateOpen(
        gate({ ideas: [{ createdAt: chicagoDay(-19), proposedDate: chicagoDay(3) }] })
      )
      expect(out).toBe(true)
    })

    it("does not fire when an idea's proposed day is two days out", () => {
      const out = isNeedsYouGateOpen(
        gate({ ideas: [{ createdAt: chicagoDay(-19), proposedDate: chicagoDay(2) }] })
      )
      expect(out).toBe(false)
    })
  })

  it("stays closed when nothing in the group matches either rule", () => {
    const out = isNeedsYouGateOpen(
      gate({
        ideas: [{ createdAt: chicagoDay(-19), proposedDate: chicagoDay(60) }],
        timeChangeAsks: [{ createdAt: chicagoDay(-19) }],
        events: [{ createdAt: chicagoDay(-19), startsAt: chicagoDay(60), gaugeId: null }],
      })
    )
    expect(out).toBe(false)
  })

  // ── Non-UTC: the group-local day and the UTC calendar day disagree ──────
  //
  // America/Los_Angeles in January is PST, UTC-8. `now` is chosen at 9pm
  // LA-local, which is already past midnight UTC (the next UTC calendar
  // day); the idea is created at 3pm LA-local that same LA day, which is
  // still the prior UTC calendar day. So the two instants share one
  // LA-local day (Jan 15) while sitting on two different UTC calendar days
  // (Jan 15 and Jan 16).
  //
  // This is deliberately the discriminating case: a naive same-day check
  // built on raw UTC dates (e.g. comparing `date.toISOString().slice(0,10)`,
  // or Math.floor(ms / 86_400_000)) sees "2026-01-16" vs "2026-01-15" and
  // returns false — rule one would silently not fire for something created
  // today. The correct, group-local answer is true. See the task report for
  // the node-verified arithmetic behind this fixture; the two toISOString
  // assertions below pin the disagreement itself, so this test cannot pass
  // by accident if the fixture ever stops actually straddling a UTC day.
  it("rule one fires on a group-local same day even though the UTC calendar days disagree (America/Los_Angeles)", () => {
    const nonUtcTz = "America/Los_Angeles"
    const now = zonedWallTimeToUtc(2026, 1, 15, 21, 0, nonUtcTz) // 9pm Jan 15 LA-local = 05:00 Jan 16 UTC
    const createdAt = zonedWallTimeToUtc(2026, 1, 15, 15, 0, nonUtcTz) // 3pm Jan 15 LA-local = 23:00 Jan 15 UTC
    expect(now.toISOString().slice(0, 10)).toBe("2026-01-16")
    expect(createdAt.toISOString().slice(0, 10)).toBe("2026-01-15")

    const out = isNeedsYouGateOpen(
      gate({
        now,
        timeZone: nonUtcTz,
        ideas: [{ createdAt, proposedDate: chicagoDay(60) }],
      })
    )
    expect(out).toBe(true)
  })
})

describe("isDigestEligibleToday", () => {
  it("is eligible when lastDigestSentAt is null and not opted out", () => {
    const out = isDigestEligibleToday({
      now: NOW,
      timeZone: TZ,
      lastDigestSentAt: null,
      digestOptOutAt: null,
    })
    expect(out).toBe(true)
  })

  it("refuses a second send inside the same group-local day", () => {
    const out = isDigestEligibleToday({
      now: chicagoDay(0, 21),
      timeZone: TZ,
      lastDigestSentAt: chicagoDay(0, 8),
      digestOptOutAt: null,
    })
    expect(out).toBe(false)
  })

  it("permits a send the next group-local day", () => {
    const out = isDigestEligibleToday({
      now: chicagoDay(1, 21),
      timeZone: TZ,
      lastDigestSentAt: chicagoDay(0, 8),
      digestOptOutAt: null,
    })
    expect(out).toBe(true)
  })

  // This is the guard's own discriminating case, distinct from the two
  // above: those sit far apart in the refusing direction (13h, same day)
  // and far apart in the permitting direction (33h, next day), so a rolling
  // 24-hour window would pass both by accident. Here the gap is only 9
  // hours -- well under 24 -- but it crosses the America/Chicago local
  // midnight, so the correct group-local-day answer is "permit" while a
  // rolling `now - lastSent >= 24h` check would answer "refuse". This is
  // the exact wrong implementation the brief named ("a 24-hour window would
  // drift the send time later every day"), and this is the test that would
  // catch it: see the task report for the mutation proof.
  it("permits a send across a 9-hour gap that crosses the group-local day boundary (proves this is a calendar-day guard, not a rolling 24-hour window)", () => {
    const lastDigestSentAt = chicagoDay(-1, 23) // 11pm yesterday, Chicago-local
    const now = chicagoDay(0, 8) // 8am today, Chicago-local -- 9 hours later
    const out = isDigestEligibleToday({ now, timeZone: TZ, lastDigestSentAt, digestOptOutAt: null })
    expect(out).toBe(true)
  })

  it("refuses when digestOptOutAt is set, regardless of lastDigestSentAt", () => {
    const out = isDigestEligibleToday({
      now: NOW,
      timeZone: TZ,
      lastDigestSentAt: null,
      digestOptOutAt: chicagoDay(-10),
    })
    expect(out).toBe(false)
  })

  // ── Non-UTC: the once-a-day guard is the more dangerous direction to get
  // wrong, because the failure it protects against (decision 5) is a
  // duplicate email, not a missed one. Built the same way as the rule-one
  // non-UTC case above: two instants that share one LA-local day (Jan 15)
  // while sitting on two different UTC calendar days (Jan 15 and Jan 16). A
  // naive UTC-day guard would see different UTC days and wrongly permit a
  // second send the group-local day has not actually turned over into.
  it("refuses a same-group-local-day second send even though the UTC calendar days disagree (America/Los_Angeles)", () => {
    const nonUtcTz = "America/Los_Angeles"
    const lastDigestSentAt = zonedWallTimeToUtc(2026, 1, 15, 10, 0, nonUtcTz) // 10am Jan 15 LA = 18:00 Jan 15 UTC
    const now = zonedWallTimeToUtc(2026, 1, 15, 23, 0, nonUtcTz) // 11pm Jan 15 LA = 07:00 Jan 16 UTC
    expect(lastDigestSentAt.toISOString().slice(0, 10)).toBe("2026-01-15")
    expect(now.toISOString().slice(0, 10)).toBe("2026-01-16")

    const out = isDigestEligibleToday({ now, timeZone: nonUtcTz, lastDigestSentAt, digestOptOutAt: null })
    expect(out).toBe(false)
  })
})
