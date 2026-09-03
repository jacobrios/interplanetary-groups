// src/lib/digest/cancellations.ts
//
// What got called off since this member last looked.
//
// Derived from EVENT ROWS, never from Orbit's message prose, and that is the
// whole point of the module. The you-missed block filters to
// MessageAuthor.MEMBER by a settled rule, so Orbit's cancellation
// announcement can never appear there; widening that filter would have
// reopened "which other Orbit messages qualify", which is a design question
// rather than a filter change. Reading the rows instead keeps that rule
// intact and matches the product's structured-extract-then-format
// discipline.
//
// Pure, following you-missed.ts and needs-you.ts: rows the caller already
// fetched go in, decided lines come out. Nothing here queries or writes.
//
// Read position is the same one you-missed uses: the later of
// Membership.lastSeenAt and Membership.lastDigestSentAt, falling back to
// joinedAt. Sharing that definition is deliberate, so the two blocks can
// never disagree about what "since you last looked" means.
//
// A cancellation that was undone before the digest runs produces no line at
// all, automatically: the row is SCHEDULED again, so the caller's query
// never returns it.

import { whenPhrase } from "@/lib/orbit/change-copy"

export interface CancellationRow {
  id: string
  title: string
  startsAt: Date
  cancelledAt: Date | null
}

export interface CancellationLine {
  title: string
  /** "this Tue", or "on Tue, Sep 22" beyond a week: the same phrasing Orbit
   *  used in the feed, so the email and the chat never disagree. */
  whenLine: string
}

interface DeriveInput {
  /** Rows the caller already fetched, filtered to CANCELLED. Any order. */
  events: CancellationRow[]
  lastSeenAt: Date | null
  lastDigestSentAt: Date | null
  joinedAt: Date
  timeZone: string
  now: Date
}

/** How many cancellations get named. Newest first, because the soonest thing
 *  a member needs to not turn up for is the one just decided. */
const MAX_LINES = 3

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a.getTime() >= b.getTime() ? a : b
  return a ?? b
}

export function deriveCancellations(input: DeriveInput): CancellationLine[] {
  const readPosition = laterOf(input.lastSeenAt, input.lastDigestSentAt) ?? input.joinedAt

  return input.events
    .filter(
      (e) => e.cancelledAt !== null && e.cancelledAt.getTime() > readPosition.getTime()
    )
    .sort((a, b) => b.cancelledAt!.getTime() - a.cancelledAt!.getTime())
    .slice(0, MAX_LINES)
    .map((e) => ({
      title: e.title,
      whenLine: whenPhrase(e.startsAt, input.timeZone, input.now),
    }))
}
