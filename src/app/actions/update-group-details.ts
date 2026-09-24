"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { updateGroupDetails } from "@/lib/groups/update-details"
import { DETAILS_GENERIC } from "@/lib/groups/details-edit"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"

export interface UpdateGroupDetailsState {
  errors?: {
    general?: string
  }
}

function field(formData: FormData, key: string): string {
  return (formData.get(key) as string | null)?.trim() ?? ""
}

/**
 * Server action: the founder saves the group's name and activities, and
 * answers whether the next plan comes along (the form sends that answer
 * only when it asked). The lib re-checks the founder and validates every
 * field; this action only parses the form and maps refusals to copy.
 */
export async function updateGroupDetailsAction(
  _prevState: UpdateGroupDetailsState,
  formData: FormData
): Promise<UpdateGroupDetailsState> {
  const groupId = field(formData, "groupId")
  if (!groupId) {
    return { errors: { general: DETAILS_GENERIC } }
  }

  let name: string
  let rhythms: RhythmEdit[]
  try {
    const parsed = JSON.parse(formData.get("payload") as string) as {
      name?: unknown
      rhythms?: unknown
    }
    if (!Array.isArray(parsed?.rhythms)) throw new Error("BAD_PAYLOAD")
    name = typeof parsed.name === "string" ? parsed.name : ""
    // Only the array shape is checked here; validateDetailsEdit judges each entry.
    rhythms = parsed.rhythms as RhythmEdit[]
  } catch {
    return { errors: { general: DETAILS_GENERIC } }
  }

  const choice = field(formData, "planChoice")
  const planChoice = choice === "update" || choice === "leave" ? choice : null
  const planEventId = field(formData, "planEventId")
  const planStartsAt = field(formData, "planStartsAt")
  const openedPlan =
    planEventId && planStartsAt ? { eventId: planEventId, startsAt: planStartsAt } : null

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { errors: { general: "You need to be signed in for that." } }
  }

  let result: Awaited<ReturnType<typeof updateGroupDetails>>
  try {
    result = await updateGroupDetails({
      supabaseAuthId: authUser.id,
      groupId,
      name,
      rhythms,
      planChoice,
      openedPlan,
      now: new Date(),
    })
  } catch (err) {
    const code = err instanceof Error ? err.message : ""
    if (code === "NOT_FOUNDER" || code === "NO_USER") {
      return { errors: { general: "Only the founder can change group details." } }
    }
    console.error("[update-group-details] failed", err)
    return { errors: { general: DETAILS_GENERIC } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // Refreshed on a returned error too: a stale-plan refusal means the page
  // is showing an out-of-date plan, and the founder needs the current one.
  revalidatePath(`/groups/${groupId}/info`)
  revalidatePath(`/groups/${groupId}`)
  if (planEventId) revalidatePath(`/events/${planEventId}`)

  if (result.status === "error") return { errors: { general: result.message } }
  return {}
}
