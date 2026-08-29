// src/lib/digest/you-missed.ts
//
// The digest's "you missed" block: what happened in the group's chat since
// this member was last here, when there is anything to report. This is the
// reason somebody who has drifted away opens the email at all, so its whole
// risk runs in both directions: undercounting hides real activity the
// member would want to know about, overcounting (or drawing the window in
// the wrong place) tells them something untrue about their own group.
//
// Pure, following lib/digest/needs-you.ts: rows the caller already fetched
// go in, a decided result comes out. Nothing here queries Prisma or writes
// anything, so a digest job and any future second consumer can never
// disagree about what counted as missed.
//
// Read position is the later of Membership.lastSeenAt (this member opened
// the group's home) and Membership.lastDigestSentAt (this member was last
// sent a digest): a member who visits the app between two digest runs is
// never told about messages they already saw there, and a member who reads
// a digest without ever opening the group is never told about that same
// stretch of chat again next time. Both null (never opened the group, never
// sent a digest) falls back to Membership.joinedAt, so a brand new member's
// window starts at the moment they joined rather than at the dawn of the
// group.
//
// Only MessageAuthor.MEMBER counts, per decision 4: ORBIT's own messages
// need no summarizing back to the room (anything needing a response from
// this member already surfaces in the "needs you" block), and SYSTEM join
// announcements are not something anyone "said". A member's own messages
// are never something they missed from themselves.
//
// Truncating a long body is task 7's job, not this module's: task 7 owns
// rendering and plain text and HTML have different room, so this module
// always returns the whole body.

import type { Message, User } from "@prisma/client"
import { MessageAuthor } from "@prisma/client"

export type YouMissedMessage = Message & { author: User | null }

interface DeriveInput {
  /** Candidate messages for this group; any order, this module sorts.
   *  Filtered to MEMBER, and to after the read position, inside here. */
  messages: YouMissedMessage[]
  lastSeenAt: Date | null
  lastDigestSentAt: Date | null
  joinedAt: Date
  viewerId: string
}

export interface YouMissedLine {
  authorName: string | null
  body: string
}

export interface YouMissedResult {
  /** Everything missed, not just what fits in `lines`. This is the number
   *  that must never be wrong: it is the claim the block makes about how
   *  much the member missed, independent of how few lines get quoted. */
  count: number
  /** The most recent few, oldest first, so reading top to bottom reads like
   *  catching up rather than scrolling backward. */
  lines: YouMissedLine[]
}

/** How many of the most recent missed messages get quoted. */
const MAX_LINES = 3

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a.getTime() >= b.getTime() ? a : b
  return a ?? b
}

/**
 * What this member missed in the group's chat since the read position, or
 * null when there is nothing to report. Suppressed entirely rather than
 * rendered empty, because a "you missed nothing" block is not the reason
 * anyone opens this email.
 */
export function deriveYouMissed(input: DeriveInput): YouMissedResult | null {
  const readPosition = laterOf(input.lastSeenAt, input.lastDigestSentAt) ?? input.joinedAt

  const missed = input.messages
    .filter(
      (m) =>
        m.authorType === MessageAuthor.MEMBER &&
        m.authorId !== input.viewerId &&
        m.createdAt.getTime() > readPosition.getTime()
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  if (missed.length === 0) return null

  return {
    count: missed.length,
    lines: missed.slice(-MAX_LINES).map((m) => ({
      authorName: m.author?.name ?? null,
      body: m.body,
    })),
  }
}
