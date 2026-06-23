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

    const rsvp = await tx.rsvp.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: { eventId, userId: user.id, status },
      update: { status },
    })

    return { rsvp }
  })
}
