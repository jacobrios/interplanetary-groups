"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { leaveGroup } from "@/lib/groups/leave"

export interface LeaveGroupState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: the viewer leaves a group.
 *
 * Same auth model as every mutating action: the session is re-verified
 * server-side and the user re-resolved from it. The founder guard lives in
 * the lib (the UI also never shows the founder a Leave button; this is the
 * backstop). Departures are silent in the feed by design (spec decision 2).
 *
 * On success this redirects to "/" (the front door routes the ex-member to
 * their other group or the pitch), so it only ever RETURNS on failure.
 */
export async function leaveGroupAction(
  _prevState: LeaveGroupState,
  formData: FormData
): Promise<LeaveGroupState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  if (!groupId) {
    return { errors: { general: "Couldn't find that group. Refresh and try again." } }
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in to leave." } }
  }

  try {
    await leaveGroup({ supabaseAuthId: authUser.id, groupId })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "FOUNDER_CANNOT_LEAVE") {
      return { errors: { general: "As the founder, you can't leave your own group yet." } }
    }
    if (code === "NOT_A_MEMBER" || code === "NO_USER") {
      return { errors: { general: "You're not a member of this group." } }
    }
    console.error("[leave-group] failed", err)
    return { errors: { general: "Couldn't save that, try again." } }
  }

  // CRITICAL: revalidatePath and redirect must be called outside and after
  // try/catch. Both use internal throw mechanisms in Next.js and would be
  // swallowed if placed inside the catch block.
  revalidatePath(`/groups/${groupId}`)
  revalidatePath(`/groups/${groupId}/info`)
  redirect("/")
}
