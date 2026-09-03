// src/lib/auth/email-offer.ts
//
// The one place the product decides whether to offer to take someone's email.
// The problem this exists to prevent: a member who loses their session has no
// way back into the group as themselves, so they rejoin through the invite
// link as a second person and every attendance count quietly goes wrong. An
// email lets them sign back in as the person they already are.
//
// Pure and time-injected, like the rest of Orbit's decision code (see
// spark-copy.ts's isGaugeLive): no clock read here, so a test's outcome can
// never depend on the machine it runs on.
//
// The ask also carries a short cooldown now, separate from emailAskCount: the
// sheet is modal, and tapping outside it (the ordinary "not now" gesture)
// records nothing toward the count, so without a cooldown a member would meet
// the sheet again on every return to the group home, forever. lastShownAt
// closes that gap. The caller sources it from a cookie; this module never
// reads a cookie and must not learn how the value is stored.

/** The two User columns this decision reads. Never the whole Prisma row. */
export interface EmailAskState {
  emailAskCount: number
  emailAskedAt: Date | null
}

export interface ShouldOfferEmailInput {
  user: EmailAskState
  /**
   * The most recent moment this member did ANYTHING in the group: an RSVP
   * (either status, since declining Thursday is not declining reminders), a
   * chat message they wrote, or a gauge vote. Deliberately broader than
   * "latest RSVP", since the spark flow starts in chat, so a member can be
   * active for weeks before an RSVP ever comes up. This function does not query
   * anything; the caller is responsible for computing the true latest of the
   * three and passing it here.
   */
  latestContributionAt: Date | null
  hasVerifiedEmail: boolean
  /**
   * The moment the sheet was last put in front of this member, or null if it
   * never has been. Deliberately an instant handed in rather than a boolean
   * computed by the caller: the comparison belongs here, beside the seven-day
   * one, where a test can hold it, and the shape matches what a `User` column
   * would store if the cookie is ever replaced.
   *
   * The caller reads this from a cookie. This module never does, and must not
   * learn how it is stored.
   */
  lastShownAt: Date | null
  now: Date
}

export type EmailOffer = "first" | "second" | null

const SECOND_ASK_MIN_WAIT_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Exported so the cookie module (task 2) can set its max-age to the same
 * duration instead of holding its own copy of `24 * 60 * 60 * 1000`; two
 * separately typed copies of "24 hours" is how they end up disagreeing. The
 * product rule for how long a dismissal snoozes the ask lives here, next to
 * the decision it governs, and the cookie module imports it rather than
 * restating it.
 */
export const ASK_COOLDOWN_MS = 24 * 60 * 60 * 1000

/**
 * Both asks are spent, so nothing else can matter.
 *
 * This exists purely so a caller can skip work it would otherwise do to answer
 * a question that is already answered: the group home reads three tables to
 * find a member's latest contribution, and for a member in this state no value
 * it could come back with would change the outcome. The two columns it reads
 * are already in hand on the User row, so the check itself is free.
 *
 * It deliberately does NOT re-implement any part of shouldOfferEmail below,
 * which stays the only thing that decides whether an ask is shown. This is
 * allowed to be conservative (say false and let the real decision run) and is
 * never allowed to be wrong in the other direction. The relationship is held
 * to that by a test that walks the whole input space rather than by this
 * comment.
 */
export function emailAskIsSettled(user: EmailAskState): boolean {
  return user.emailAskCount >= 2
}

/**
 * Whether the sheet was shown recently enough that showing it again right now
 * would read as pestering rather than a nudge. False when lastShownAt is not
 * a usable Date, since there is nothing to be recent relative to.
 *
 * It exists for the same reason emailAskIsSettled does: so page.tsx can skip
 * work whose answer cannot matter, without re-implementing the rule. It is
 * exported so there is exactly one definition of the cooldown, used by both
 * the page's skip and the decision below. Like emailAskIsSettled, it is
 * allowed to be conservative and is never allowed to be wrong in the other
 * direction: a future-skewed lastShownAt (a device clock running fast) still
 * reads as snoozed rather than as expired, because treating clock skew as
 * evidence of elapsed time is the direction that would actually pester
 * someone.
 *
 * ONE PRINCIPLE, held in two layers, not two principles. The type is the
 * real enforcement: `ShouldOfferEmailInput.lastShownAt` is `Date | null`,
 * required, not optional, and every real and test caller in this repo was
 * verified by a repo-wide search to pass it explicitly (page.tsx, the QA
 * script, and every test in email-offer.test.ts and EmailAskNote.test.tsx).
 * That is what actually prevents a member from ever seeing a broken screen
 * over this, and it is why the type stays strict rather than being loosened
 * back to accept `undefined`.
 *
 * The runtime guard below is defense for what the type cannot see: this
 * function is called directly inside EmailAskNote's render body, a
 * user-facing path, and a stale client cache or any other route that goes
 * around TypeScript could in principle hand it something other than a Date
 * or null. `instanceof Date` catches that case the same way `=== null` alone
 * would not (it lets `undefined` and any other non-Date value through to
 * `.getTime()`, which throws), and it resolves that case exactly the way
 * `shouldOfferEmail` already resolves its own missing-data case a few lines
 * down, at `emailAskedAt === null`: withhold the ask rather than guess or
 * throw on a user-facing path. Failing toward showing an optional nudge one
 * extra time is recoverable; taking down the group home's render is not.
 *
 * This used to be a loose `== null` check, which was wrong for a different
 * reason and is worth keeping on record: for tasks 1 through 3, the two call
 * sites that construct `lastShownAt` had not been updated yet, so this
 * function was routinely reachable with the field simply absent, and `==
 * null` was catching that as an accident of a mid-refactor state rather than
 * as a deliberate defense. Once every caller was updated (task 4), that
 * accidental reason for tolerance was gone, but the function still needed
 * *some* runtime tolerance for the reason above, so the fix was never "go
 * strict" on its own; it is "go strict in the type, stay defensive at the
 * boundary, and say why each layer exists."
 */
export function emailAskIsSnoozed(lastShownAt: Date | null, now: Date): boolean {
  if (!(lastShownAt instanceof Date)) return false
  return now.getTime() - lastShownAt.getTime() < ASK_COOLDOWN_MS
}

/**
 * Whether, and which, email ask to show right now.
 *
 * emailAskCount is still not an impression counter: it only advances when the
 * member answers an offer by dismissing it with the worded exit, never for
 * simply having seen one on screen and moved past it without acting (a tap
 * outside the sheet, the ordinary "not now," records nothing toward it).
 * That is why "first" can stay true across many renders in a row on that
 * axis alone; the caller advancing the count on a real dismissal is still
 * what eventually turns this off for good.
 *
 * What is no longer true without qualification: this function can now return
 * null on a render where the count-based answer would have been "first" or
 * "second," because of the cooldown below (see emailAskIsSnoozed), a separate
 * and temporary state that neither reads emailAskCount nor is read by it. The
 * cooldown can only ever suppress an ask the count would otherwise allow; it
 * can never revive one the count has already retired, and it never advances
 * or resets the count itself.
 */
export function shouldOfferEmail({
  user,
  latestContributionAt,
  hasVerifiedEmail,
  lastShownAt,
  now,
}: ShouldOfferEmailInput): EmailOffer {
  if (hasVerifiedEmail) return null
  if (user.emailAskCount >= 2) return null

  // The permanent answers are read first: an address on file or both asks
  // already spent settle this member forever, and nothing below can change
  // that. The cooldown is checked only after, because it is temporary, not a
  // settled state, just a "we asked recently, leave them alone for a day."
  if (emailAskIsSnoozed(lastShownAt, now)) return null

  if (user.emailAskCount === 0) {
    return latestContributionAt !== null ? "first" : null
  }

  // emailAskCount === 1 from here. emailAskedAt is nullable in the schema,
  // but the product should never produce this combination on its own: the
  // count only advances in the same write that sets the timestamp. If it
  // happens anyway there is no instant to measure seven days from, so the
  // safe answer is to withhold the second ask rather than guess or throw on
  // a user-facing path.
  if (user.emailAskedAt === null) return null

  const sevenDaysHavePassed = now.getTime() - user.emailAskedAt.getTime() >= SECOND_ASK_MIN_WAIT_MS
  const contributedSinceTheAsk =
    latestContributionAt !== null && latestContributionAt.getTime() > user.emailAskedAt.getTime()

  // The freshness check is deliberate and its cost is accepted: a member who
  // contributed once, got the first ask, and then goes quiet never gets a
  // second one, however much time passes. A plain timer would land on a
  // screen where nothing happened, and a nudge that cannot point to anything
  // reads as pestering rather than a helpful reminder.
  if (sevenDaysHavePassed && contributedSinceTheAsk) return "second"

  return null
}
