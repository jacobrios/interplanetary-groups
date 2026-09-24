// src/app/actions/edit-event.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { submitEventEdit } from "@/lib/events/submit-edit"

export interface EditEventState {
  errors?: {
    general?: string
  }
}

// Thin by design, the cancel-event.ts precedent: everything worth testing
// (membership, validation, the two write paths) lives in submitEventEdit,
// which is tested. This action only resolves who is asking and hands the
// form off.
export async function editEventAction(
  _prev: EditEventState,
  formData: FormData
): Promise<EditEventState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  if (!eventId) return { errors: { general: "That plan is gone." } }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return { errors: { general: "You need to be signed in to do that." } }

  const user = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } })
  if (!user) return { errors: { general: "You need to be signed in to do that." } }

  // Unlike cancel-event.ts's resolveActor, membership is not checked here:
  // submitEventEdit checks it itself, so it stays covered by that module's
  // own tests instead of duplicated (and untested) in this thin action.
  const title = (formData.get("title") as string | null) ?? ""
  const place = (formData.get("place") as string | null) ?? ""
  const dateLocal = (formData.get("dateLocal") as string | null) ?? ""
  const timeLocal = (formData.get("timeLocal") as string | null) ?? ""
  // What the form showed when it was opened. submitEventEdit compares
  // against these, not against the stored row, so a form left open while
  // somebody else changed the plan cannot undo their change.
  const field = (name: string) => (formData.get(name) as string | null) ?? ""
  const original = {
    title: field("origTitle"),
    place: field("origPlace"),
    dateLocal: field("origDateLocal"),
    timeLocal: field("origTimeLocal"),
  }

  const result = await submitEventEdit({
    eventId,
    actor: { id: user.id, name: user.name },
    title,
    place,
    dateLocal,
    timeLocal,
    now: new Date(),
    original,
  })

  // A partial save (title or place written, then the vote refused) is an
  // error the member must see AND a change the page must show, so the
  // refresh keys off whether anything was written, not off success.
  if (result.status === "ok" || result.edited) {
    revalidatePath(`/events/${eventId}`)
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    })
    if (event) revalidatePath(`/groups/${event.groupId}`)
  }

  if (result.status === "error") {
    return { errors: { general: result.message } }
  }

  return {}
}
