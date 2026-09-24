// Integration tests for editEventDetails: hits the real dev-test DB.
// Cleanup order (FK constraints): Message -> Event (Venue and Rsvp cascade
// with their Event) -> Membership -> Group -> User. Modelled on cancel.test.ts.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { EventStatus, MessageAuthor, RsvpStatus } from "@prisma/client"
import { editEventDetails, applyDetailChangeInTx, EDIT_TITLE_MAX } from "../edit-details"
import { VENUE_NAME_MAX } from "@/lib/orbit/rhythm"
import type { DetailChange } from "@/lib/orbit/edit-copy"

let userId: string | null = null
let secondUserId: string | null = null
let groupId: string | null = null
let eventId: string | null = null

const START = new Date("2099-06-14T18:00:00Z")
const NOW = new Date("2099-06-10T12:00:00Z")

const STUB_ANNOUNCEMENT = "[TEST] stub announcement"
const stubAnnounce = (_change: DetailChange, _currentTitle: string) => STUB_ANNOUNCEMENT

async function cleanup() {
  if (groupId) {
    await prisma.message.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.event.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.membership.deleteMany({ where: { groupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {})
    groupId = null
  }
  for (const id of [userId, secondUserId]) {
    if (id) await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  userId = null
  secondUserId = null
  eventId = null
}

afterEach(async () => {
  await cleanup()
  await prisma.$disconnect()
})

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const user = await prisma.user.create({
    data: { name: "[TEST] Editor", supabaseAuthId: `test-edit-${suffix}` },
  })
  userId = user.id
  const second = await prisma.user.create({
    data: { name: "[TEST] Other", supabaseAuthId: `test-edit2-${suffix}` },
  })
  secondUserId = second.id
  const group = await prisma.group.create({
    data: {
      name: "[TEST] Edit Group",
      founderId: user.id,
      timeZone: "UTC",
      recurringActivities: [] as never,
      memberships: { create: [{ userId: user.id }, { userId: second.id }] },
    },
  })
  groupId = group.id
  const event = await prisma.event.create({
    data: { groupId: group.id, title: "Tennis", activityLabel: "tennis", startsAt: START },
  })
  eventId = event.id
  await prisma.rsvp.createMany({
    data: [
      { eventId: event.id, userId: user.id, status: RsvpStatus.IN },
      { eventId: event.id, userId: second.id, status: RsvpStatus.OUT },
    ],
  })
})

describe("editEventDetails", () => {
  it("renames the event, posts one ORBIT message with the announce body, and returns the change", async () => {
    const result = await editEventDetails({
      eventId: eventId!,
      title: "Pool at Sam's",
      place: "",
      now: NOW,
      announce: stubAnnounce,
    })
    expect(result).toEqual({
      status: "edited",
      change: { title: { from: "Tennis", to: "Pool at Sam's" } },
    })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Pool at Sam's")
    expect(event?.activityLabel).toBe("Pool at Sam's")

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(1)
    expect(messages[0].authorType).toBe(MessageAuthor.ORBIT)
    expect(messages[0].authorId).toBeNull()
    expect(messages[0].body).toBe(STUB_ANNOUNCEMENT)
  })

  it("updates an existing Venue row in place, nulling address, displayLabel and url", async () => {
    const venue = await prisma.venue.create({
      data: {
        eventId: eventId!,
        name: "Court 3",
        address: "123 Court Rd",
        displayLabel: "The Courts",
        url: "https://example.com",
      },
    })

    const result = await editEventDetails({
      eventId: eventId!,
      title: "Tennis",
      place: "Court 5",
      now: NOW,
      announce: stubAnnounce,
    })
    expect(result).toEqual({
      status: "edited",
      change: { place: { from: "The Courts", to: "Court 5" } },
    })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues).toHaveLength(1)
    expect(venues[0].id).toBe(venue.id)
    expect(venues[0].name).toBe("Court 5")
    expect(venues[0].address).toBeNull()
    expect(venues[0].displayLabel).toBeNull()
    expect(venues[0].url).toBeNull()
  })

  it("creates a Venue when a place is added to an event with none", async () => {
    const result = await editEventDetails({
      eventId: eventId!,
      title: "Tennis",
      place: "Court 3",
      now: NOW,
      announce: stubAnnounce,
    })
    expect(result).toEqual({
      status: "edited",
      change: { place: { from: null, to: "Court 3" } },
    })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues).toHaveLength(1)
    expect(venues[0].name).toBe("Court 3")
  })

  it("deletes the Venue when the place is cleared", async () => {
    await prisma.venue.create({ data: { eventId: eventId!, name: "Court 3" } })

    const result = await editEventDetails({
      eventId: eventId!,
      title: "Tennis",
      place: "",
      now: NOW,
      announce: stubAnnounce,
    })
    expect(result).toEqual({
      status: "edited",
      change: { place: { from: "Court 3", to: null } },
    })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues).toHaveLength(0)
  })

  it("leaves every RSVP row exactly as it was", async () => {
    const before = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })

    await editEventDetails({
      eventId: eventId!,
      title: "Pool",
      place: "Sam's House",
      now: NOW,
      announce: stubAnnounce,
    })

    const after = await prisma.rsvp.findMany({
      where: { eventId: eventId! },
      orderBy: { userId: "asc" },
    })
    expect(after).toEqual(before)
  })

  it("strictly increases updatedAt on a place-only edit", async () => {
    const before = await prisma.event.findUnique({ where: { id: eventId! } })
    await new Promise((resolve) => setTimeout(resolve, 5))

    await editEventDetails({
      eventId: eventId!,
      title: "Tennis",
      place: "Court 3",
      now: NOW,
      announce: stubAnnounce,
    })

    const after = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
  })

  it("leaves startsAt, scheduledKey and gaugeId unchanged", async () => {
    const before = await prisma.event.findUnique({ where: { id: eventId! } })

    await editEventDetails({
      eventId: eventId!,
      title: "Pool",
      place: "Sam's House",
      now: NOW,
      announce: stubAnnounce,
    })

    const after = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(after!.startsAt).toEqual(before!.startsAt)
    expect(after!.scheduledKey).toEqual(before!.scheduledKey)
    expect(after!.gaugeId).toEqual(before!.gaugeId)
  })

  describe("refusals write no message", () => {
    it("refuses an event that does not exist", async () => {
      const result = await editEventDetails({
        eventId: "does-not-exist",
        title: "Pool",
        place: "",
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "no_event" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses a cancelled event", async () => {
      await prisma.event.update({
        where: { id: eventId! },
        data: { status: EventStatus.CANCELLED, cancelledAt: NOW },
      })
      const result = await editEventDetails({
        eventId: eventId!,
        title: "Pool",
        place: "",
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "cancelled" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses a plan whose start has already passed", async () => {
      const afterStart = new Date(START.getTime() + 60_000)
      const result = await editEventDetails({
        eventId: eventId!,
        title: "Pool",
        place: "",
        now: afterStart,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "already_started" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses a no-op edit: same title and place after trim", async () => {
      const result = await editEventDetails({
        eventId: eventId!,
        title: "  Tennis  ",
        place: "",
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "noop" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses a blank title", async () => {
      const result = await editEventDetails({
        eventId: eventId!,
        title: "   ",
        place: "",
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "invalid_title" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses a 51-character title", async () => {
      const result = await editEventDetails({
        eventId: eventId!,
        title: "x".repeat(EDIT_TITLE_MAX + 1),
        place: "",
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "invalid_title" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })

    it("refuses an 81-character place", async () => {
      const result = await editEventDetails({
        eventId: eventId!,
        title: "Tennis",
        place: "x".repeat(VENUE_NAME_MAX + 1),
        now: NOW,
        announce: stubAnnounce,
      })
      expect(result).toEqual({ status: "skipped", reason: "invalid_place" })
      const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
      expect(messages).toHaveLength(0)
    })
  })

  it("is stale-safe under concurrent edits: exactly one wins, exactly one message posts", async () => {
    // A bare Promise.all of two editEventDetails calls is not a reliable
    // race: against a real Postgres connection pool the two calls are as
    // likely to run fully serially (each starting from whatever the row
    // holds at that moment, both then genuinely succeeding) as to actually
    // overlap. So an external transaction takes the row lock first and
    // holds it until editEventDetails has provably done its read (and is
    // about to issue its conditional write), then commits. That read saw
    // the pre-edit row, so the write must match nothing and lose, whatever
    // the timing of the commit relative to the write.
    //
    // No sleep decides the outcome: the hold ends on a signal from inside
    // editEventDetails's own transaction, taken by wrapping the tx handle
    // it is given so its event.updateMany announces itself before running.
    // (An earlier version slept 1500ms and assumed the write landed inside
    // that window, which a slow shared database does not guarantee.)
    let locked!: () => void
    const lockHeld = new Promise<void>((resolve) => {
      locked = resolve
    })
    let writeReached!: () => void
    const editReachedWrite = new Promise<void>((resolve) => {
      writeReached = resolve
    })

    const externalEdit = prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId! },
        data: { title: "Badminton", activityLabel: "Badminton" },
      })
      locked()
      await editReachedWrite
    })
    await lockHeld

    // Only editEventDetails's transaction starts from here on, so every
    // $transaction call this spy sees is that one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalTransaction = (prisma.$transaction as any).bind(prisma)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = (vi.spyOn(prisma, "$transaction") as any).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: (tx: any) => Promise<unknown>, opts?: unknown) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        originalTransaction((tx: any) => {
          const event = new Proxy(tx.event, {
            get(target, prop) {
              if (prop === "updateMany") {
                return (args: unknown) => {
                  writeReached()
                  return target.updateMany(args)
                }
              }
              const value = Reflect.get(target, prop)
              return typeof value === "function" ? value.bind(target) : value
            },
          })
          const wrapped = new Proxy(tx, {
            get(target, prop) {
              if (prop === "event") return event
              const value = Reflect.get(target, prop)
              return typeof value === "function" ? value.bind(target) : value
            },
          })
          return fn(wrapped)
        }, opts)
    )

    let result
    try {
      ;[, result] = await Promise.all([
        externalEdit,
        editEventDetails({
          eventId: eventId!,
          title: "Pool",
          place: "",
          now: NOW,
          announce: stubAnnounce,
        }),
      ])
    } finally {
      spy.mockRestore()
    }
    expect(result).toEqual({ status: "skipped", reason: "stale" })

    const event = await prisma.event.findUnique({ where: { id: eventId! } })
    expect(event?.title).toBe("Badminton") // the external edit's result stands

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0) // no announcement for the losing edit
  })

  it("applyDetailChangeInTx applies a place change and writes zero Message rows", async () => {
    const result = await prisma.$transaction((tx) =>
      applyDetailChangeInTx(tx, {
        eventId: eventId!,
        title: "Tennis",
        place: "Court 3",
        now: NOW,
      })
    )
    expect(result).toEqual({
      status: "applied",
      change: { place: { from: null, to: "Court 3" } },
      currentTitle: "Tennis",
      groupId: groupId!,
    })

    const venues = await prisma.venue.findMany({ where: { eventId: eventId! } })
    expect(venues).toHaveLength(1)
    expect(venues[0].name).toBe("Court 3")

    const messages = await prisma.message.findMany({ where: { groupId: groupId! } })
    expect(messages).toHaveLength(0)
  })
})
