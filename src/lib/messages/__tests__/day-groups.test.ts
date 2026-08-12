import { describe, expect, it } from "vitest"
import { groupMessagesByDay } from "@/lib/messages/day-groups"

const msg = (id: string, iso: string) => ({ id, createdAt: new Date(iso) })

describe("groupMessagesByDay", () => {
  // Group in Chicago (UTC-5 in August). "Now" is the evening of Mon 10 Aug 2026 there.
  const tz = "America/Chicago"
  const now = new Date("2026-08-11T01:30:00Z") // Mon 10 Aug, 8:30pm in Chicago

  it("splits messages on the group's day boundary, not UTC's", () => {
    const groups = groupMessagesByDay(
      [
        msg("a", "2026-08-10T02:00:00Z"), // Sun 9 Aug 9pm Chicago — UTC already Monday
        msg("b", "2026-08-10T14:00:00Z"), // Mon 10 Aug 9am Chicago
      ],
      tz,
      now
    )
    expect(groups.length).toBe(2)
    expect(groups[0].label).toBe("Yesterday")
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a"])
    expect(groups[1].label).toBe("Today")
    expect(groups[1].messages.map((m) => m.id)).toEqual(["b"])
  })

  it("labels older days with a three-letter weekday and short date", () => {
    const groups = groupMessagesByDay([msg("a", "2026-07-27T17:00:00Z")], tz, now)
    expect(groups[0].label).toBe("Mon, Jul 27")
  })

  it("keeps one group for messages on the same group-local day", () => {
    const groups = groupMessagesByDay(
      [msg("a", "2026-08-10T13:00:00Z"), msg("b", "2026-08-10T23:00:00Z")],
      tz,
      now
    )
    expect(groups.length).toBe(1)
  })

  it("accepts string timestamps (client-serialized rows)", () => {
    const groups = groupMessagesByDay([{ id: "a", createdAt: "2026-08-10T14:00:00Z" }], tz, now)
    expect(groups[0].label).toBe("Today")
  })
})
