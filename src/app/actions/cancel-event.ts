// src/app/actions/cancel-event.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { isGroupMember } from "@/lib/auth/membership"
import { cancelEvent, restoreEvent } from "@/lib/events/cancel"
import {
  buildCancelAnnouncement,
  buildRestoreAnnouncement,
} from "@/lib/orbit/cancel-copy"

export interface CancelEventState {
  errors?: {
    general?: string
  }
}

// Anyone in the group can call a plan off, and anyone can put it back
// (decisions 1 and 4). Founder-only would rebuild the organizer role the
// product exists to dissolve, and weather is an observable fact rather than
// a judgment call. What makes that safe is that the action is reversible in
// two taps by anybody and announced publicly the same second.
async function resolveActor(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return { error: "You need to be signed in to do that." } as const

  const user = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } })
  if (!user) return { error: "You need to be signed in to do that." } as const

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { group: { select: { id: true, timeZone: true } } },
  })
  if (!event) return { error: "That plan is gone." } as const

  // Every write path is membership-gated: a removed member's stale tab still
  // holds live buttons.
  if (!(await isGroupMember(user.id, event.group.id))) {
    return { error: "Only members can change this group's plans." } as const
  }

  return { user, event } as const
}

export async function cancelEventAction(
  _prevState: CancelEventState,
  formData: FormData
): Promise<CancelEventState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  if (!eventId) return { errors: { general: "That plan is gone." } }

  const resolved = await resolveActor(eventId)
  if ("error" in resolved) return { errors: { general: resolved.error } }
  const { user, event } = resolved

  const now = new Date()
  const label = event.activityLabel ?? event.title.toLowerCase()
  const result = await cancelEvent({
    eventId,
    announcementBody: buildCancelAnnouncement(
      user.name,
      label,
      event.startsAt,
      event.group.timeZone,
      now
    ),
    now,
  })

  if (result.status === "skipped") {
    if (result.reason === "already_cancelled") {
      return { errors: { general: "This one's already been called off." } }
    }
    if (result.reason === "already_started") {
      return { errors: { general: "This one has already started." } }
    }
    return { errors: { general: "Couldn't do that, try again." } }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/groups/${event.group.id}`)
  return {}
}

export async function restoreEventAction(
  _prevState: CancelEventState,
  formData: FormData
): Promise<CancelEventState> {
  const eventId = (formData.get("eventId") as string | null)?.trim() ?? ""
  if (!eventId) return { errors: { general: "That plan is gone." } }

  const resolved = await resolveActor(eventId)
  if ("error" in resolved) return { errors: { general: resolved.error } }
  const { user, event } = resolved

  const now = new Date()
  const label = event.activityLabel ?? event.title.toLowerCase()
  const result = await restoreEvent({
    eventId,
    announcementBody: buildRestoreAnnouncement(
      user.name,
      label,
      event.startsAt,
      event.group.timeZone,
      now
    ),
    now,
  })

  if (result.status === "skipped") {
    if (result.reason === "not_cancelled") {
      return { errors: { general: "This one's already back on." } }
    }
    if (result.reason === "already_started") {
      return { errors: { general: "This one has already started." } }
    }
    return { errors: { general: "Couldn't do that, try again." } }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/groups/${event.group.id}`)
  return {}
}
