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

  const title = (formData.get("title") as string | null) ?? ""
  const place = (formData.get("place") as string | null) ?? ""
  const dateLocal = (formData.get("dateLocal") as string | null) ?? ""
  const timeLocal = (formData.get("timeLocal") as string | null) ?? ""

  const result = await submitEventEdit({
    eventId,
    actor: { id: user.id, name: user.name },
    title,
    place,
    dateLocal,
    timeLocal,
    now: new Date(),
  })

  if (result.status === "error") {
    return { errors: { general: result.message } }
  }

  revalidatePath(`/events/${eventId}`)
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { groupId: true } })
  if (event) revalidatePath(`/groups/${event.groupId}`)

  return {}
}
