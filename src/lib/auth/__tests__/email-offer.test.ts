// src/lib/auth/__tests__/email-offer.test.ts
//
// shouldOfferEmail is pure and time is always injected, so every case below
// states its own `now` instead of reaching for the clock. That is what makes
// the seven-day boundary tests meaningful: they would pass or fail identically
// on any machine, in any timezone, on any day.

import { describe, it, expect } from "vitest"
import {
  shouldOfferEmail,
  emailAskIsSettled,
  emailAskIsSnoozed,
  ASK_COOLDOWN_MS,
  type EmailAskState,
} from "../email-offer"

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
      lastShownAt: null,
      now: new Date("2026-08-10T00:00:01.000Z"),
    })
    expect(result).toBeNull()
  })

  it("beats a second ask that would otherwise be due", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: sevenDaysLater,
      hasVerifiedEmail: true,
      lastShownAt: null,
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
      lastShownAt: null,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("never offers above 2 either, in case a caller ever produces it", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 3, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(sevenDaysLater.getTime() + DAY_MS),
      hasVerifiedEmail: false,
      lastShownAt: null,
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
      lastShownAt: null,
      now: new Date("2026-08-05T00:00:01.000Z"),
    })
    expect(result).toBe("first")
  })

  it("does not fire with no contribution yet, even though nothing else blocks it", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: null,
      hasVerifiedEmail: false,
      lastShownAt: null,
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
      lastShownAt: null,
      now: sevenDaysLater,
    })
    expect(result).toBe("second")
  })

  it("does not fire one second under seven days", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() + 1),
      hasVerifiedEmail: false,
      lastShownAt: null,
      now: new Date(sevenDaysLater.getTime() - 1000),
    })
    expect(result).toBeNull()
  })

  it("fires one second over seven days", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() + 1),
      hasVerifiedEmail: false,
      lastShownAt: null,
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
      lastShownAt: null,
      now: new Date(sevenDaysLater.getTime() + DAY_MS),
    })
    expect(result).toBeNull()
  })

  it("does not fire when the latest contribution predates the first ask", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
      latestContributionAt: new Date(askedOnceAt.getTime() - DAY_MS),
      hasVerifiedEmail: false,
      lastShownAt: null,
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
      lastShownAt: null,
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
      lastShownAt: null,
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
        lastShownAt: null,
        now: new Date("2026-09-20T00:00:00.000Z"),
      })
    ).not.toThrow()

    const result = shouldOfferEmail({
      user: state({ emailAskCount: 1, emailAskedAt: null }),
      latestContributionAt: new Date("2026-08-20T00:00:00.000Z"),
      hasVerifiedEmail: false,
      lastShownAt: null,
      now: new Date("2026-09-20T00:00:00.000Z"),
    })
    expect(result).toBeNull()
  })
})

// ── the 24-hour cooldown (added 3 Sept 2026, email-ask-cooldown slice) ──────
//
// The sheet is modal, and tapping outside it (the ordinary "not now" gesture)
// records nothing toward emailAskCount, which used to mean a member met the
// sheet again on every return to the group home. lastShownAt and the cooldown
// it feeds close that gap without touching the count at all.

describe("shouldOfferEmail: the 24-hour cooldown", () => {
  const contributed = new Date("2026-08-05T00:00:00.000Z")
  const now = new Date("2026-08-05T00:00:01.000Z")

  it("never shown (lastShownAt: null), count 0, contributed: still fires \"first\" (proves the new input does not break the existing path)", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: null,
      now,
    })
    expect(result).toBe("first")
  })

  it("shown ten minutes ago suppresses an otherwise-due first ask", () => {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: tenMinutesAgo,
      now,
    })
    expect(result).toBeNull()
  })

  it("pins the boundary as inclusive: shown exactly 24 hours ago is no longer snoozed", () => {
    const exactly24hAgo = new Date(now.getTime() - ASK_COOLDOWN_MS)
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: exactly24hAgo,
      now,
    })
    expect(result).toBe("first")
  })

  it("shown 25 hours ago is well past the cooldown", () => {
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: twentyFiveHoursAgo,
      now,
    })
    expect(result).toBe("first")
  })

  it("a future lastShownAt (a skewed device clock) reads as snoozed, not as expired", () => {
    const anHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 0 }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: anHourFromNow,
      now,
    })
    expect(result).toBeNull()
  })

  it("the settled check still wins: count 2 and shown ten minutes ago stays null", () => {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 2, emailAskedAt: askedOnceAt }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: tenMinutesAgo,
      now,
    })
    expect(result).toBeNull()
  })

  it("the settled check still wins: count 2 and never shown stays null too (the cooldown is not a way back in)", () => {
    const result = shouldOfferEmail({
      user: state({ emailAskCount: 2, emailAskedAt: askedOnceAt }),
      latestContributionAt: contributed,
      hasVerifiedEmail: false,
      lastShownAt: null,
      now,
    })
    expect(result).toBeNull()
  })

  it("a verified email beats every cooldown combination", () => {
    const combos: Array<Date | null> = [
      null,
      new Date(now.getTime() - 10 * 60 * 1000),
      new Date(now.getTime() - ASK_COOLDOWN_MS),
      new Date(now.getTime() - 25 * 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
    ]
    for (const lastShownAt of combos) {
      const result = shouldOfferEmail({
        user: state({ emailAskCount: 0 }),
        latestContributionAt: contributed,
        hasVerifiedEmail: true,
        lastShownAt,
        now,
      })
      expect(result).toBeNull()
    }
  })

  it("the second-ask boundary matrix, re-run with lastShownAt: null, is unchanged", () => {
    // Same three boundary instants as "shouldOfferEmail: the second ask, at
    // the seven-day boundary" above, restated here with the new required
    // field so the cooldown's absence-of-effect is proven rather than assumed.
    const underBoundaryNow = new Date(sevenDaysLater.getTime() - 1000)
    const atBoundaryNow = sevenDaysLater
    const overBoundaryNow = new Date(sevenDaysLater.getTime() + 1000)
    const contributionSinceAsk = new Date(askedOnceAt.getTime() + 1)

    expect(
      shouldOfferEmail({
        user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
        latestContributionAt: contributionSinceAsk,
        hasVerifiedEmail: false,
        lastShownAt: null,
        now: underBoundaryNow,
      })
    ).toBeNull()

    expect(
      shouldOfferEmail({
        user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
        latestContributionAt: contributionSinceAsk,
        hasVerifiedEmail: false,
        lastShownAt: null,
        now: atBoundaryNow,
      })
    ).toBe("second")

    expect(
      shouldOfferEmail({
        user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
        latestContributionAt: contributionSinceAsk,
        hasVerifiedEmail: false,
        lastShownAt: null,
        now: overBoundaryNow,
      })
    ).toBe("second")
  })

  it("the same matrix with a fresh lastShownAt is null throughout: the cooldown gates the second ask too", () => {
    const underBoundaryNow = new Date(sevenDaysLater.getTime() - 1000)
    const atBoundaryNow = sevenDaysLater
    const overBoundaryNow = new Date(sevenDaysLater.getTime() + 1000)
    const contributionSinceAsk = new Date(askedOnceAt.getTime() + 1)

    for (const boundaryNow of [underBoundaryNow, atBoundaryNow, overBoundaryNow]) {
      const fresh = new Date(boundaryNow.getTime() - 10 * 60 * 1000)
      const result = shouldOfferEmail({
        user: state({ emailAskCount: 1, emailAskedAt: askedOnceAt }),
        latestContributionAt: contributionSinceAsk,
        hasVerifiedEmail: false,
        lastShownAt: fresh,
        now: boundaryNow,
      })
      expect(result).toBeNull()
    }
  })
})

describe("emailAskIsSnoozed", () => {
  const now = new Date("2026-08-10T00:00:00.000Z")

  it("is false when lastShownAt is null", () => {
    expect(emailAskIsSnoozed(null, now)).toBe(false)
  })

  it("throws on a runtime-absent lastShownAt rather than silently reading it as never shown", () => {
    // The type says `Date | null`, and every real and test caller in this
    // repo now passes one of those two. Nothing can hand this function
    // `undefined` without going around TypeScript, which is exactly what this
    // does (task 4's own tightening from `== null` to `=== null`, so this test
    // is what proves the change is real rather than a comment-only edit: with
    // the old loose check this call returned `false`, the same as a genuine
    // `null`, and would not have thrown). A future caller that somehow loses
    // the type (an untyped script, a JSON round trip) now fails loudly here
    // instead of quietly treating a missing value as "the sheet was never
    // shown," which is the direction that would hide a real bug.
    expect(() => emailAskIsSnoozed(undefined as unknown as Date | null, now)).toThrow()
  })

  it("is true when shown just now", () => {
    expect(emailAskIsSnoozed(now, now)).toBe(true)
  })

  it("is false exactly at the 24-hour boundary", () => {
    const exactly24hAgo = new Date(now.getTime() - ASK_COOLDOWN_MS)
    expect(emailAskIsSnoozed(exactly24hAgo, now)).toBe(false)
  })

  it("is false well past the cooldown", () => {
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    expect(emailAskIsSnoozed(twentyFiveHoursAgo, now)).toBe(false)
  })

  it("is true for a future lastShownAt (a skewed device clock)", () => {
    const anHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    expect(emailAskIsSnoozed(anHourFromNow, now)).toBe(true)
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
                lastShownAt: null,
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
