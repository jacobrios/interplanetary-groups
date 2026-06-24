// src/app/actions/send-message.ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { createMessage } from "@/lib/messages/create"
import { MessageAuthor } from "@prisma/client"

export interface SendMessageState {
  errors?: {
    general?: string
  }
}

/**
 * Server action: post a member message to a group's feed.
 *
 * Auth model matches the other actions:
 * - Re-verifies the session via supabase.auth.getUser() — never trusts the client.
 * - Re-resolves the User row via getCurrentUser() so the authorId is always
 *   a real Prisma User id, never a client-passed value.
 * - Does NOT mint an anonymous session (no membership → no right to post).
 *
 * On success, revalidatePath refreshes the group home so the feed reflects
 * the new message on the next server render.
 */
export async function sendMessageAction(
  _prevState: SendMessageState,
  formData: FormData
): Promise<SendMessageState> {
  const groupId = (formData.get("groupId") as string | null)?.trim() ?? ""
  const body = (formData.get("body") as string | null) ?? ""

  if (!groupId) {
    return { errors: { general: "Something went wrong. Please refresh and try again." } }
  }

  if (!body.trim()) {
    return { errors: { general: "Message cannot be empty." } }
  }

  // Re-verify session server-side — never trust a client-passed user id.
  const supabase = await createClient()
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser()

  if (!supabaseUser) {
    return { errors: { general: "You need to be signed in to send messages." } }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { errors: { general: "You need to be signed in to send messages." } }
  }

  try {
    await createMessage({
      groupId,
      authorType: MessageAuthor.MEMBER,
      authorId: user.id,
      body,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg === "EMPTY_BODY") {
      return { errors: { general: "Message cannot be empty." } }
    }
    return { errors: { general: "Couldn't send that, try again." } }
  }

  // CRITICAL: revalidatePath must be called outside and after try/catch.
  // In Next.js it uses a similar internal throw mechanism to redirect() and
  // would be swallowed if placed inside the catch block.
  revalidatePath(`/groups/${groupId}`)
  return {}
}
