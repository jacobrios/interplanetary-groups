// src/lib/auth/__tests__/email-offer.test.ts
//
// shouldOfferEmail is pure and time is always injected, so every case below
// states its own `now` instead of reaching for the clock. That is what makes
// the seven-day boundary tests meaningful: they would pass or fail identically
// on any machine, in any timezone, on any day.

import { describe, it, expect } from "vitest"
import { shouldOfferEmail, emailAskIsSettled, type EmailAskState } from "../email-offer"

const DAY_MS = 24 * 60 * 60 * 1000

const askedOnceAt = new Date("2026-08-01T12:00:00.000Z")
const sevenDaysLater = new Date(askedOnceAt.getTime() + 7 * DAY_MS)

function state(overrides: Partial<EmailAskState> = {}): EmailAskState {
  return { emailAskCount: 0, emailAskedAt: null, ...overrides }
}

describe("shouldOfferEmail: verified email always wins", () => {
  it("never offers once a verified email exists, even with a fresh contribution", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: new Date("2026-08-10T00:00:00.000Z"),
      hasVerifiedEmail: true,
      now: new Date("2026-08-10T00:00:01.000Z"),
    })
    expect(result).toBeNull()
  })

  it("beats a second ask that would otherwise be due", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: sevenDaysLater,
      hasVerifiedEmail: true,
      now: sevenDaysLater,
    })
    expect(result).toBeNull()
  })
})

describe("shouldOfferEmail: the count ceiling", () => {
  it("never offers once emailAskCount reaches 2", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 2, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(sevenDaysLater.getTime() + DAY_MS),
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("never offers above 2 either, in case a caller ever produces it", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 3, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(sevenDaysLater.getTime() + DAY_MS),
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })
})

describe("shouldOfferEmail: the first ask", () => {
  it("fires the moment there is any contribution and no email has ever been asked for", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: new Date("2026-08-05T00:00:00.000Z"),
      hasVerifiedEmail: false,
      now: new Date("2026-08-05T00:00:01.000Z"),
    })
    expect(result).toBe("first")
  })

  it("does not fire with no contribution yet, even though nothing else blocks it", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: null,
      hasVerifiedEmail: false,
      now: new Date("2026-08-05T00:00:00.000Z"),
    })
    expect(result).toBeNull()
  })
})

describe("shouldOfferEmail: the second ask, at the seven-day boundary", () => {
  const freshContribution = new Date(sevenDaysLater.getTime()) // after the ask, well before "now" in the under-boundary case

  it("fires at exactly seven days, with a contribution since the first ask", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() + 1),
      hasVerifiedEmail: false,
      now: sevenDaysLater,
    })
    expect(result).toBe("second")
  })

  it("does not fire one second under seven days", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() + 1),
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() - 1000),
    })
    expect(result).toBeNull()
  })

  it("fires one second over seven days", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() + 1),
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + 1000),
    })
    expect(result).toBe("second")
  })
})

describe("shouldOfferEmail: the second ask also requires a fresh contribution", () => {
  it("does not fire when seven days passed but nothing happened since the ask", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: null,
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("does not fire when the latest contribution predates the first ask", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() - DAY_MS),
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("does not fire when the latest contribution is exactly the ask instant itself", () => {
    // The rule is "more recent than emailAskedAt", strictly after, not on-or-after.
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: askedOnceAt,
      hasVerifiedEmail: false,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("accepted cost: never fires again once seven days pass with no further contribution, by design", () => {
    // A member who contributed once, got the first ask, and never touched the
    // group again gets no second ask, ever. This is deliberate: a plain timer
    // would land on a quiet screen where nothing happened, which is exactly
    // when a nudge reads as pestering.
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: null,
      hasVerifiedEmail: false,
      now: new Date(askedOnceAt.getTime() + 365 * DAY_MS),
    })
    expect(result).toBeNull()
  })
})

describe("shouldOfferEmail: emailAskedAt missing while emailAskCount is 1", () => {
  // The schema allows this combination (emailAskedAt is nullable) even though
  // the product should never produce it: emailAskCount only advances in the
  // same write that sets emailAskedAt. If it ever happens anyway, there is no
  // instant to measure seven days from, so the sane and safe answer is to
  // withhold the second ask rather than guess or throw on a user-facing path.
  it("does not offer and does not throw", () => {
    expect(() =>
      shouldOfferEmail({
        user: state({ emailAskCount: 1, emailAskedAt: null }),
        latestContributionAt: new Date("2026-08-20T00:00:00.000Z"),
        hasVerifiedEmail: false,
        now: new Date("2026-09-20T00:00:00.000Z"),
      })
    ).not.toThrow()

    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: null }),
      latestContributionAt: new Date("2026-08-20T00:00:00.000Z"),
      hasVerifiedEmail: false,
      now: new Date("2026-09-20T00:00:00.000Z"),
    })
    expect(result).toBeNull()
  })
})

// ── emailAskIsSettled (added 27 Aug 2026, task 5 fix round 1) ───────────────
//
// The group home skips four database reads when this predicate says the answer
// is already decided. That is only safe if the predicate can never disagree
// with shouldOfferEmail, so the relationship is tested rather than asserted in
// a comment: whenever it says settled, no combination of the other inputs may
// produce an offer.

describe("emailAskIsSettled", () => {
  it("is true exactly when the count has reached the two-ask limit", () => {
    expect(emailAskIsSettled(state({ emailAskCount: 0 }))).toBe(false)
    expect(emailAskIsSettled(state({ emailAskCount: 1 }))).toBe(false)
    expect(emailAskIsSettled(state({ emailAskCount: 2 }))).toBe(true)
    // Two taps racing each other can push it past two; still settled.
    expect(emailAskIsSettled(state({ emailAskCount: 3 }))).toBe(true)
  })

  it("never disagrees with shouldOfferEmail across the whole input space", () => {
    const counts = [0, 1, 2, 3]
    const askedAts = [null, askedOnceAt, sevenDaysLater]
    const contributions = [
      null,
      new Date(askedOnceAt.getTime() - DAY_MS),
      new Date(askedOnceAt.getTime() + DAY_MS),
    ]
    const verifieds = [true, false]
    const nows = [askedOnceAt, sevenDaysLater, new Date(sevenDaysLater.getTime() + 30 * DAY_MS)]

    let offersSeen = 0
    let settledSeen = 0

    for (const emailAskCount of counts) {
      for (const emailAskedAt of askedAts) {
        for (const latestContributionAt of contributions) {
          for (const hasVerifiedEmail of verifieds) {
            for (const now of nows) {
              const user = state({ emailAskCount, emailAskedAt })
              const offer = shouldOfferEmail({
                user,
                latestContributionAt,
                hasVerifiedEmail,
                now,
              })
              if (offer !== null) offersSeen += 1
              if (emailAskIsSettled(user)) {
                settledSeen += 1
                expect(offer).toBeNull()
              }
            }
          }
        }
      }
    }

    // Without these the loop above could pass while proving nothing: an empty
    // settled set, or a matrix that never produces an offer at all, would both
    // be silently green.
    expect(settledSeen).toBeGreaterThan(0)
    expect(offersSeen).toBeGreaterThan(0)
  })
})
