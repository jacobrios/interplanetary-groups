"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { removeMember } from "@/lib/groups/remove-member"

export interface RemoveMemberState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the founder removes a member (spec decisions 6 and 7).
 * The founder check lives in the lib; this wrapper only resolves the session
 * and maps thrown codes to copy. Removal is silent in the feed (decision 2).
 */
export async function removeMemberAction(
  _prevState: RemoveMemberState,
  formData: FormData
): Promise<RemoveMemberState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  const targetUserId = (formData.get("targetUserId") as string | null)?.trim() ?? ""

  if (!groupId || !targetUserId) {
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
    await removeMember({ supabaseAuthId: authUser.id, groupId, targetUserId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "NOT_FOUNDER" || code === "NO_USER") {
      return { errors: { general: "Only the founder can remove members." } }
    }
    if (code === "CANNOT_REMOVE_FOUNDER") {
      return { errors: { general: "The founder can't be removed." } }
    }
    if (code === "TARGET_NOT_MEMBER") {
      return { errors: { general: "They're not a member anymore." } }
    }
    console.error("[remove-member] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  revalidatePath(`/groups/${groupId}`)
  revalidatePath(`/groups/${groupId}/info`)
  return {}
}
