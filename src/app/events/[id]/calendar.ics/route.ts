// src/app/events/[id]/calendar.ics/route.ts
//
// Serves the one-way calendar snapshot. Public by design: no surface in the
// product is membership-gated (standing state, owned by the access-control
// slice), and the file contains nothing personal. Composed per request so a
// tap after a time-change vote carries the moved time; the literal
// calendar.ics segment gives the download its natural filename, and no
// Content-Disposition is set so phones may open their add-to-calendar flow
// directly instead of being forced into a download.

import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { composeEventIcs } from "@/lib/events/ics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  const event = await prisma.event.findUnique({
    where: { id },
    include: { venues: true },
  })
  if (!event) {
    return new Response("Not found", { status: 404 })
  }

  const venue = event.venues[0] ?? null
  const origin = new URL(request.url).origin
  const body = composeEventIcs(
    {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      updatedAt: event.updatedAt,
      venue: venue
        ? { label: venue.displayLabel, name: venue.name, address: venue.address }
        : null,
      eventUrl: `${origin}/events/${event.id}`,
    },
    new Date()
  )
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Composed fresh per request; no cache may serve a stale copy after a
      // group's time-change vote moves the plan.
      "Cache-Control": "no-store",
    },
  })
}
