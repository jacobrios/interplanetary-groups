// src/app/actions/create-group.ts
"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { provisionFounderGroup } from "@/lib/groups/provision"

export interface CreateGroupState {
  errors?: {
    founderName?: string
    groupName?: string
    general?: string
  }
}

export async function createGroupAction(
  _prevState: CreateGroupState,
  formData: FormData
): Promise<CreateGroupState> {
  const founderName = (formData.get("founderName") as string | null)?.trim() ?? ""
  const groupName = (formData.get("groupName") as string | null)?.trim() ?? ""

  // Validate required fields
  const errors: CreateGroupState["errors"] = {}
  if (!founderName) errors.founderName = "Your name is required."
  if (!groupName) errors.groupName = "Group name is required."
  if (Object.keys(errors).length > 0) return { errors }

  const supabase = await createClient()

  // Auth-layer guard: reuse an existing session rather than minting a new
  // anonymous user. This, combined with the data-layer guard in
  // provisionFounderGroup, prevents duplicate ghost accounts (build-notes §3).
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      return {
        errors: {
          general:
            "Could not create a session. Please try again.",
        },
      }
    }
    user = data.user
  }

  let group: Awaited<ReturnType<typeof provisionFounderGroup>>["group"]
  try {
    const result = await provisionFounderGroup({
      supabaseAuthId: user.id,
      founderName,
      groupName,
    })
    group = result.group
  } catch {
    return {
      errors: {
        general: "Something went wrong creating your group. Please try again.",
      },
    }
  }

  redirect(`/groups/${group.id}`)
}
