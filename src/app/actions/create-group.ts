// src/app/actions/create-group.ts
//
// Step 2 confirm: create the group from the founder-approved profile, then
// generate the first event immediately (scoped reconcile) so the home is
// alive on day one. The client-held rhythm payload is re-validated here —
// the completeness gate is enforced server-side, so no request path can
// create a group without a schedulable primary rhythm. The wizard advances
// to the Step 3 share screen on success rather than being redirected; see
// CreateGroupResult.

"use server"

import { createClient } from "@/lib/supabase/server"
import { provisionFounderGroup } from "@/lib/groups/provision"
import { parseStoredRhythms, parseRhythm } from "@/lib/orbit/rhythm"
import { normalizeTimeZone } from "@/lib/groups/timezone"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"

export interface CreateGroupInput {
  founderName: string
  groupName: string
  description: string
  /** The normalized profile held by the wizard — re-validated, never trusted. */
  rhythms: unknown
  /**
   * The founder's browser-inferred IANA timezone — a client-asserted claim,
   * re-validated here (normalizeTimeZone) before it is stored. null when
   * detection produced nothing; it degrades to "UTC" rather than blocking.
   */
  timeZone: string | null
}

const DESCRIPTION_MAX = 2000

export type CreateGroupResult =
  | { error: string }
  | { groupId: string; inviteToken: string }

export async function createGroupAction(input: CreateGroupInput): Promise<CreateGroupResult> {
  const founderName = input.founderName?.trim() ?? ""
  const groupName = input.groupName?.trim() ?? ""
  const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX)

  if (!founderName || !groupName) {
    return { error: "Something went missing. Please try again." }
  }

  // Server-side completeness gate (the "no bypass" rule): the payload must be
  // a valid stored-rhythm array whose position 0 is schedulable, regardless
  // of what the client sends.
  const rhythms = parseStoredRhythms(input.rhythms)
  if (!rhythms || parseRhythm(rhythms) === null) {
    return { error: "I lost track of your schedule. Go back a step and try again." }
  }

  // The timezone is a client claim: validate before it drives display or is
  // stored. An unrecognized/absent zone becomes "UTC" — never a hard failure,
  // so a founder is never blocked from creating a group over this field.
  const timeZone = normalizeTimeZone(input.timeZone)

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
      return { error: "Could not create a session. Please try again." }
    }
    user = data.user
  }

  let group: Awaited<ReturnType<typeof provisionFounderGroup>>["group"]
  try {
    const result = await provisionFounderGroup({
      supabaseAuthId: user.id,
      founderName,
      groupName,
      description,
      recurringActivities: rhythms,
      timeZone,
    })
    group = result.group
  } catch {
    return { error: "Something went wrong creating your group. Please try again." }
  }

  // Create-time first event, scoped to this group only. Fail-soft: a failed
  // event must never destroy a successfully created group — the founder still
  // lands on a valid home and the daily cron catches up.
  try {
    await reconcileScheduledEvents(new Date(), { groupId: group.id })
  } catch (err) {
    console.error("[onboarding] first-event reconcile failed (cron will catch up):", err)
  }

  // The wizard advances to the share step (mockup 04) instead of being
  // redirected into the group; it needs the id to proceed and the token to
  // share. Returning after the reconcile keeps first-event creation fail-soft.
  return { groupId: group.id, inviteToken: group.inviteToken }
}
