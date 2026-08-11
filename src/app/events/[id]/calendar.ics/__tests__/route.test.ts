// src/app/events/[id]/calendar.ics/__tests__/route.test.ts
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { GET } from "../route"

describe("GET /events/[id]/calendar.ics", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("serves a parseable calendar file for a real event", async () => {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Ics Founder", supabaseAuthId: `test-ics-${Date.now()}` },
    })
    const group = await prisma.group.create({
      data: { name: "[TEST] Ics Group", founderId: founder.id },
    })
    groupIds.push(group.id)
    userIds.push(founder.id)
    const event = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Sunday climb",
        startsAt: new Date("2026-08-16T15:00:00Z"),
        venues: { create: { name: "[TEST] The Wall", address: "123 Main St" } },
      },
    })

    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8")
    // Composed fresh per request (spec: "fresh at tap time"); no cache may
    // sit between a group's time-change vote and the next download.
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const rawBody = await response.text()
    // RFC 5545 §3.1 line folding wraps long lines with CRLF + a single space;
    // unfold before asserting so the check targets real content, not where a
    // particular event id happened to cross the 75-octet boundary.
    const body = rawBody.replace(/\r\n /g, "")
    expect(body).toContain("SUMMARY:[TEST] Sunday climb")
    expect(body).toContain("DTSTART:20260816T150000Z")
    expect(body).toContain("LOCATION:[TEST] The Wall\\, 123 Main St")
    expect(body).toContain(
      `DESCRIPTION:Details and RSVPs: http://localhost:3000/events/${event.id}`
    )
  })

  it("returns 404 for an unknown event id", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/events/nope/calendar.ics"),
      { params: Promise.resolve({ id: "nope" }) }
    )
    expect(response.status).toBe(404)
  })
})
