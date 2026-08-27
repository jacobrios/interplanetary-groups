// src/lib/auth/email-ask.ts
//
// The database side of the email ask: the two facts email-offer.ts needs in
// order to decide, and the one write that answers an offer.
//
// email-offer.ts stays pure and time-injected, so everything that has to touch
// Prisma lives here instead of leaking into it.

import { prisma } from "@/lib/prisma"

export interface EmailAskInputs {
  /** The most recent moment this member did anything in THIS group. */
  latestContributionAt: Date | null
  hasVerifiedEmail: boolean
}

/**
 * Whether this person has a verified email on file, full stop: not scoped to
 * any group, because an email is attached to the person rather than to a
 * membership. Shared by loadEmailAskInputs below and by the group info page,
 * which has no group-scoped question to ask here (it already knows the viewer
 * is a member) but needs the same answer. Keeping one definition means the
 * group home and the info page can never quietly disagree about whether the
 * same member has an email attached.
 */
export async function hasVerifiedEmail(userId: string): Promise<boolean> {
  const contactMethod = await prisma.contactMethod.findFirst({
    where: { userId, type: "EMAIL", isVerified: true },
    select: { id: true },
  })
  return contactMethod !== null
}

/**
 * The address this person has on file, for showing it back to them.
 *
 * THE ONLY QUERY IN THE PRODUCT THAT CAN SEE AN ADDRESS, and the shape of it
 * is the guardrail. CLAUDE.md's data-model rule, as amended 27 August 2026:
 * never shown to the group or to any other member, always shown to its owner,
 * on the group info page, and nowhere else. The group half of that promise
 * rests on two properties of this function, both asserted in
 * src/app/__tests__/no-email-address-on-screen.test.tsx:
 *
 *   - it takes ONE scalar user id, so there is no list to hand it and no way
 *     to run it across a roster;
 *   - it has exactly one call site, the group info page, which calls it with
 *     the viewer's own id.
 *
 * Kept separate from hasVerifiedEmail above rather than folded into it, even
 * though this one's result answers that one's question too. The group home
 * needs the boolean and must never be handed an address it could pass into a
 * client component by accident, so the query that feeds it stays narrowed to
 * the row id. Two queries is the price of that, and it is one extra indexed
 * lookup on a page that already runs several.
 */
export async function verifiedEmailAddress(userId: string): Promise<string | null> {
  const contactMethod = await prisma.contactMethod.findFirst({
    where: { userId, type: "EMAIL", isVerified: true },
    select: { value: true },
  })
  return contactMethod?.value ?? null
}

/**
 * What the group home reads before deciding whether to offer.
 *
 * Contribution is the broad definition on purpose, because this product's
 * spark flow starts in chat: a member can be part of the group for weeks
 * without an RSVP ever coming up, and asking only after an RSVP would skip
 * them entirely.
 *
 * A decision worth naming rather than leaving to look like an accident: all
 * three reads are scoped to the group whose home is being rendered, not to
 * everything the person has ever done anywhere. The caller already holds the
 * group id so it costs nothing; the founder's version of the copy speaks about
 * "the group you started", which is this group; and someone who has been busy
 * in group A has not yet given group B a reason to interrupt them. The
 * two-asks-per-person accounting is unaffected either way, because the counter
 * lives on the User row rather than on a membership.
 */
export async function loadEmailAskInputs({
  userId,
  groupId,
}: {
  userId: string
  groupId: string
}): Promise<EmailAskInputs> {
  const [rsvp, message, vote, verifiedEmail] = await Promise.all([
    // respondedAt is @updatedAt, so this is last-touched rather than
    // first-answered: changing an answer reads as a fresh contribution. That is
    // the right reading for "when did this person last do something", and it is
    // the only timestamp the row carries anyway.
    prisma.rsvp.findFirst({
      where: { userId, event: { groupId } },
      orderBy: { respondedAt: "desc" },
      select: { respondedAt: true },
    }),
    prisma.message.findFirst({
      where: { groupId, authorType: "MEMBER", authorId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    // updatedAt for the same reason as the RSVP above: changing a gauge vote is
    // a contribution, not a rewrite of an old one.
    prisma.gaugeVote.findFirst({
      where: { userId, gauge: { groupId } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    hasVerifiedEmail(userId),
  ])

  const moments = [rsvp?.respondedAt, message?.createdAt, vote?.updatedAt].filter(
    (d): d is Date => d instanceof Date
  )

  return {
    latestContributionAt:
      moments.length === 0
        ? null
        : moments.reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest)),
    hasVerifiedEmail: verifiedEmail,
  }
}

/**
 * The member answered an offer by declining it.
 *
 * This is the ONLY write that advances emailAskCount. Showing the offer writes
 * nothing (owner, 26 Aug 2026): an ask is an episode rather than a glimpse, so
 * counting impressions would spend both asks on someone who never looked, and
 * it would send the second ask to the wrong person, since the one it is for is
 * the member who said no while still deciding whether to trust the product.
 *
 * The count and the timestamp move together in one write, which is what lets
 * shouldOfferEmail treat "count is 1 but no timestamp" as a state the product
 * cannot produce.
 */
export async function recordEmailOfferDismissed({
  userId,
  now,
}: {
  userId: string
  now: Date
}): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailAskCount: { increment: 1 }, emailAskedAt: now },
  })
}
