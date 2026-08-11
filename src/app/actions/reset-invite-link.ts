"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { resetInviteToken } from "@/lib/groups/reset-invite"

export interface ResetInviteLinkState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the founder rotates the invite link (spec decision 9).
 * The page re-renders with the new token via revalidatePath; the action
 * does not return the token to the client, the refreshed page carries it.
 */
export async function resetInviteLinkAction(
  _prevState: ResetInviteLinkState,
  formData: FormData
): Promise<ResetInviteLinkState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  if (!groupId) {
    return { errors: { general: "Couldn't save that, try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in for that." } }
  }

  try {
    await resetInviteToken({ supabaseAuthId: authUser.id, groupId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "NOT_FOUNDER" || code === "NO_USER") {
      return { errors: { general: "Only the founder can reset the link." } }
    }
    console.error("[reset-invite-link] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${groupId}/info`)
  return {}
}
