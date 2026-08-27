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
  now: Date
}

export type EmailOffer = "first" | "second" | null

const SECOND_ASK_MIN_WAIT_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether, and which, email ask to show right now.
 *
 * emailAskCount is not an impression counter: it only advances when the
 * member answers an offer by dismissing it, never for simply having seen one
 * on screen and moved past it without acting. That is why "first" can stay
 * true across many renders in a row (nothing has counted yet), and it is
 * also why there is no bound here on how many times "first" or "second" can
 * be returned; the caller advancing the count on a real dismissal is what
 * eventually turns this off.
 */
export function shouldOfferEmail({
  user,
  latestContributionAt,
  hasVerifiedEmail,
  now,
}: ShouldOfferEmailInput): EmailOffer {
  if (hasVerifiedEmail) return null
  if (user.emailAskCount >= 2) return null

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
