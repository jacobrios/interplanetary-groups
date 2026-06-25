// src/app/actions/rsvp.ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { setRsvp } from "@/lib/events/rsvp"
import { RsvpStatus } from "@prisma/client"

export interface RsvpState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: write (or update) the viewer's RSVP for an event.
 *
 * Intentional divergence from create-group and join-group actions:
 * this action does NOT mint an anonymous session when the user has none.
 * A user with no session has no group membership, so allowing them to RSVP
 * would create a row disconnected from any group roster and misrepresent
 * the "who's coming" picture. The page omits the RSVP control for unauthenticated
 * viewers, so this path should only be hit in error or direct-POST cases.
 */
export async function rsvpAction(
  _prevState: RsvpState,
  formData: FormData
): Promise<RsvpState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  const statusRaw = (formData.get("status") as string | null)?.trim() ?? ""

  if (!eventId) {
    return { errors: { general: "Event not found. Please refresh and try again." } }
  }

  if (statusRaw !== RsvpStatus.IN && statusRaw !== RsvpStatus.OUT) {
    return { errors: { general: "Invalid RSVP choice. Please try again." } }
  }

  const status = statusRaw as RsvpStatus

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { errors: { general: "You need to be signed in to RSVP." } }
  }

  try {
    await setRsvp({ supabaseAuthId: user.id, eventId, status })
  } catch {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // In Next.js it uses a similar internal throw mechanism to redirect() and
  // would be swallowed if placed inside the catch block.
  revalidatePath(`/events/${eventId}`)

  // When the RSVP is submitted from the home-screen compact card, groupId is
  // included in the form data so both the detail page and the home page
  // revalidate.  The detail-page caller omits groupId, so this is additive.
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  if (groupId) {
    revalidatePath(`/groups/${groupId}`)
  }

  return {}
}
