// src/app/events/[id]/calendar.ics/__tests__/route.test.ts
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { GET } from "../route"

let mockViewer: { id: string } | null = null
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => Promise.resolve(mockViewer),
}))

describe("GET /events/[id]/calendar.ics", () => {
  const groupIds: string[] = []
  const userIds: string[] = []

  beforeEach(() => {
    mockViewer = null
  })

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function createEventFixture() {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Ics Founder", supabaseAuthId: `test-ics-${Date.now()}` },
    })
    const outsider = await prisma.user.create({
      data: { name: "[TEST] Ics Outsider", supabaseAuthId: `test-ics-outsider-${Date.now()}` },
    })
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Ics Group",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    userIds.push(founder.id, outsider.id)
    const event = await prisma.event.create({
      data: {
        groupId: group.id,
        title: "[TEST] Sunday climb",
        startsAt: new Date("2026-08-16T15:00:00Z"),
        venues: { create: { name: "[TEST] The Wall", address: "123 Main St" } },
      },
    })
    return { founder, outsider, group, event }
  }

  it("serves a parseable calendar file for a real event", async () => {
    const { founder, event } = await createEventFixture()
    mockViewer = { id: founder.id }

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

  it("refuses a non-member with 403 and no calendar body", async () => {
    const { outsider, event } = await createEventFixture()
    mockViewer = { id: outsider.id }

    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain("BEGIN:VCALENDAR")
  })

  it("refuses a session-less request with 403", async () => {
    const { event } = await createEventFixture()
    mockViewer = null

    const response = await GET(
      new NextRequest(`http://localhost:3000/events/${event.id}/calendar.ics`),
      { params: Promise.resolve({ id: event.id }) }
    )
    expect(response.status).toBe(403)
  })
})
