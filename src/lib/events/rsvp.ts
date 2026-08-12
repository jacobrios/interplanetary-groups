// src/lib/events/rsvp.ts
import { prisma } from "@/lib/prisma"
import type { Rsvp } from "@prisma/client"
import { RsvpStatus } from "@prisma/client"

interface SetRsvpInput {
  supabaseAuthId: string
  eventId: string
  status: RsvpStatus
}

interface SetRsvpResult {
  rsvp: Rsvp
}

/**
 * Writes (or updates) the viewer's RSVP for a single event in one transaction.
 *
 * Data-layer guards:
 * 1. Re-resolves the user from supabaseAuthId inside the tx — never trusts a
 *    client-passed userId.
 * 2. Upserts on the @@unique([eventId, userId]) compound key so a re-tap
 *    updates the single row rather than creating a duplicate.  The compound
 *    unique is also the DB-level safety net against races.
 * 3. Throws "NO_USER" when no User row exists for the given auth id.  The
 *    RSVP action does NOT mint an anonymous session — a user who has no
 *    account has no group membership, so letting them RSVP would produce a
 *    row disconnected from any group roster.
 * 4. Throws "NO_EVENT" when no Event row exists for the given event id.
 * 5. Throws "NOT_A_MEMBER" when the resolved user is not a member of the
 *    event's group.
 *
 * This function is intentionally reusable: the event-detail page and the
 * future home-screen quick-RSVP card both call it.
 */
export async function setRsvp({
  supabaseAuthId,
  eventId,
  status,
}: SetRsvpInput): Promise<SetRsvpResult> {
  return prisma.$transaction(async (tx) => {
    // Re-resolve user inside the tx — never trust a client-passed id.
    const user = await tx.user.findUnique({ where: { supabaseAuthId } })
    if (!user) throw new Error("NO_USER")

    // Membership gate (share-readiness slice): an RSVP is a statement about a
    // group's plan, so only that group's members may make one. Before this
    // guard, a non-member's row wrote and then vanished from every derived
    // count, the silent-drop failure the slice exists to close.
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    })
    if (!event) throw new Error("NO_EVENT")
    const membership = await tx.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: event.groupId } },
      select: { id: true },
    })
    if (!membership) throw new Error("NOT_A_MEMBER")

    const rsvp = await tx.rsvp.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: { eventId, userId: user.id, status },
      update: { status },
    })

    return { rsvp }
  })
}
