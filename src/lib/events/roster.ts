// src/lib/events/roster.ts
//
// Shared roster derivation and count formatting for event display.
//
// These are extracted from the inline logic in src/app/events/[id]/page.tsx
// so that the event-detail page and the compact home-screen card share a
// single source of truth.  The logic is unchanged from the original.

import { RsvpStatus } from "@prisma/client"

// ── Types ────────────────────────────────────────────────────────────────────

/** A minimal member shape — what the queries return. */
export interface RosterMember {
  id: string
  name: string
}

/** A minimal RSVP shape — what the queries return. */
export interface RsvpRecord {
  userId: string
  status: RsvpStatus
}

/** The three bucketed lists returned by deriveRoster. */
export interface DerivedRoster {
  inMembers: RosterMember[]
  outMembers: RosterMember[]
  pendingMembers: RosterMember[]
  /** The viewer's current status, or null if not replied / not a member. */
  viewerStatus: RsvpStatus | null
}

/** Counts shape for formatCounts. */
export interface RosterCounts {
  inCount: number
  outCount: number
  pendingCount: number
}

// ── deriveRoster ─────────────────────────────────────────────────────────────

/**
 * Partitions a group's members into IN / OUT / HAVEN'T REPLIED buckets.
 *
 * "HAVEN'T REPLIED" is the ABSENCE of an Rsvp row for this event — never
 * stored as a third status.  This invariant is enforced here (and in
 * setRsvp) so it can never drift.
 *
 * @param members   All group memberships (the source of who *should* reply).
 * @param rsvps     All RSVP rows for this event.
 * @param viewerId  The Prisma User.id of the current viewer, or null.
 */
export function deriveRoster(
  members: RosterMember[],
  rsvps: RsvpRecord[],
  viewerId: string | null
): DerivedRoster {
  const rsvpByUserId = new Map(rsvps.map((r) => [r.userId, r.status]))

  const inMembers: RosterMember[] = []
  const outMembers: RosterMember[] = []
  const pendingMembers: RosterMember[] = []

  for (const member of members) {
    const status = rsvpByUserId.get(member.id)
    if (status === RsvpStatus.IN) inMembers.push(member)
    else if (status === RsvpStatus.OUT) outMembers.push(member)
    else pendingMembers.push(member)
  }

  const viewerStatus = viewerId ? (rsvpByUserId.get(viewerId) ?? null) : null

  return { inMembers, outMembers, pendingMembers, viewerStatus }
}

// ── formatCounts ─────────────────────────────────────────────────────────────

/**
 * Formats roster counts as the compact home-card status line.
 *
 * Rules per build-notes §7:
 * - In is always shown, even when zero.
 * - Out is included only when at least one person has replied Out.
 * - TBD (pending) is omitted when the count is zero.
 * - Items are separated by " · " (a deliberate separator dot).
 *
 * Examples:
 *   "4 In · 4 TBD"          (no Out responses)
 *   "4 In · 1 Out · 4 TBD"  (mixed)
 *   "4 In"                   (everyone replied In, none pending)
 */
export function formatCounts({ inCount, outCount, pendingCount }: RosterCounts): string {
  const parts: string[] = [`${inCount} In`]
  if (outCount > 0) parts.push(`${outCount} Out`)
  if (pendingCount > 0) parts.push(`${pendingCount} TBD`)
  return parts.join(" · ")
}
