// src/app/actions/join-group.ts
"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { joinGroupByInvite, DuplicateNameError } from "@/lib/groups/join"

// Discriminated union, following the mechanism CLAUDE.md names as the
// product's stronger error pattern (src/lib/auth/email.ts): a service or
// library outcome is a claim, normalized to a fixed result set exactly once,
// here, so a new variant is a compile error at every call site rather than a
// screen reading a blank line. "required" carries nothing because there is
// nothing to say beyond the fact; "duplicate" carries the collided member's
// stored name because the collision copy has to reference it.
export type JoinNameError =
  | { kind: "required" }
  | { kind: "duplicate"; existingName: string }

export interface JoinGroupState {
  errors?: {
    memberName?: JoinNameError
    general?: string
  }
}

export async function joinGroupAction(
  _prevState: JoinGroupState,
  formData: FormData
): Promise<JoinGroupState> {
  const inviteToken = (formData.get("inviteToken") as string | null)?.trim() ?? ""
  const memberName = (formData.get("memberName") as string | null)?.trim() ?? ""
  // "1" means the user already has a session and an existing User row; name comes
  // from that row, so the form field is empty and name validation is skipped.
  const hasSession = (formData.get("hasSession") as string | null) ?? ""

  // Validate required fields — name is only required for first-time visitors
  if (!hasSession && !memberName) {
    return { errors: { memberName: { kind: "required" } } }
  }

  const supabase = await createClient()

  // Auth-layer guard: reuse an existing session rather than minting a new
  // anonymous user. Mirrors create-group.ts; prevents duplicate ghost accounts.
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      return {
        errors: {
          general: "Could not create a session. Please try again.",
        },
      }
    }
    user = data.user
  }

  let group: Awaited<ReturnType<typeof joinGroupByInvite>>["group"]
  try {
    const result = await joinGroupByInvite({
      supabaseAuthId: user.id,
      memberName,
      inviteToken,
    })
    group = result.group
  } catch (err) {
    // DuplicateNameError is a name collision on the group's roster, not a
    // failure — it must return a field-anchored error, never fall into
    // `general`, so a database outage can never masquerade as a taken name
    // and a taken name can never masquerade as "something went wrong."
    if (err instanceof DuplicateNameError) {
      return {
        errors: {
          memberName: { kind: "duplicate", existingName: err.existingName },
        },
      }
    }
    return {
      errors: {
        general: "Something went wrong joining this group. Please try again.",
      },
    }
  }

  // CRITICAL: redirect() throws internally (NEXT_REDIRECT) and must be called
  // outside and after any try/catch — otherwise the throw is swallowed by catch.
  redirect(`/groups/${group.id}`)
}
