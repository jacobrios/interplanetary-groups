import { describe, expect, it } from "vitest"
import { groupMessagesByDay } from "@/lib/messages/day-groups"

const msg = (id: string, iso: string) => ({ id, createdAt: new Date(iso) })

describe("groupMessagesByDay", () => {
  // Group zone must differ from a plausible dev/CI machine zone AND from
  // UTC, or a regression that reads ambient local time instead of the
  // passed `timeZone` could produce byte-identical output to the correct
  // implementation (fix-round-1 Finding 2 — the reviewer proved exactly
  // this against the original America/Chicago-only fixtures, since this
  // machine's own ambient zone is also America/Chicago). Asia/Tokyo
  // (UTC+9, no DST) can't coincide with this or a typical US/UTC CI
  // machine, and every case below is built so a naive UTC-based grouping
  // would give a visibly different (wrong) answer too.
  describe("group zone drives the split (Asia/Tokyo, UTC+9)", () => {
    const tz = "Asia/Tokyo"
    const now = new Date("2026-08-10T11:00:00Z") // 8:00pm Mon 10 Aug, Tokyo

    it("splits two messages that share a UTC calendar date but not a Tokyo one", () => {
      const groups = groupMessagesByDay(
        [
          msg("a", "2026-08-09T14:30:00Z"), // 11:30pm Sun 9 Aug Tokyo — UTC still Sun 9 Aug
          msg("b", "2026-08-09T15:30:00Z"), // 12:30am Mon 10 Aug Tokyo — UTC still Sun 9 Aug
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
      const groups = groupMessagesByDay([msg("a", "2026-07-27T01:00:00Z")], tz, now) // 10am Mon 27 Jul Tokyo
      expect(groups[0].label).toBe("Mon, Jul 27")
    })

    it("merges two messages on the same Tokyo day even though their UTC calendar dates differ", () => {
      const groups = groupMessagesByDay(
        [
          msg("a", "2026-08-09T23:00:00Z"), // 8am Mon 10 Aug Tokyo — UTC still Sun 9 Aug
          msg("b", "2026-08-10T14:00:00Z"), // 11pm Mon 10 Aug Tokyo — UTC already Mon 10 Aug
        ],
        tz,
        now
      )
      expect(groups.length).toBe(1)
    })

    it("accepts string timestamps (client-serialized rows)", () => {
      const groups = groupMessagesByDay([{ id: "a", createdAt: "2026-08-09T15:30:00Z" }], tz, now)
      expect(groups[0].label).toBe("Today")
    })
  })

  // The sign must also be exercised west of UTC (Tokyo only proves the
  // east-of-UTC direction). Pacific/Honolulu is fixed-offset (UTC-10, no
  // DST), so it also stands in as the "keep a fixed-offset zone case"
  // guard against the DST fix below ever regressing a non-DST zone.
  describe("group zone drives the split, west of UTC too (Pacific/Honolulu, UTC-10)", () => {
    const tz = "Pacific/Honolulu"
    const now = new Date("2026-08-11T07:00:00Z") // 9:00pm Mon 10 Aug, Honolulu

    it("splits Yesterday/Today the other direction", () => {
      const groups = groupMessagesByDay(
        [
          msg("a", "2026-08-10T09:00:00Z"), // 11pm Sun 9 Aug Honolulu — UTC already Mon 10 Aug
          msg("b", "2026-08-10T22:00:00Z"), // 12pm Mon 10 Aug Honolulu
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
  })

  // "Yesterday" must survive a DST transition (fix-round-1 Finding 1): the
  // reviewer proved the original 24h-wall-clock-subtraction implementation
  // mislabels a genuine yesterday message as an older weekday+date for
  // roughly an hour, twice a year, whenever the 24-hour window straddles a
  // spring-forward or fall-back boundary. These fixtures are the exact
  // ones from the review. America/Chicago is the right zone for this
  // specific pair of tests (unlike the group-zone tests above, these are
  // testing DST arithmetic, not zone selection, so they must use a real
  // DST zone; a regression here would fail regardless of the machine's own
  // ambient zone, because it's a date-arithmetic bug, not a zone-selection
  // bug).
  describe("Yesterday survives a DST transition (America/Chicago)", () => {
    const tz = "America/Chicago"

    it("fall-back day: 11:30pm CST Nov 1 2026, message from 6pm CDT Oct 31", () => {
      const now = new Date("2026-11-02T05:30:00Z") // 11:30pm Sun 1 Nov, Chicago (CST, just fell back)
      const groups = groupMessagesByDay(
        [msg("a", "2026-10-31T23:00:00Z")], // 6:00pm Sat 31 Oct, Chicago (CDT, pre-transition)
        tz,
        now
      )
      expect(groups[0].label).toBe("Yesterday")
    })

    it("spring-forward day: 12:30am CDT Mar 9 2026, message from 10am CST Mar 8", () => {
      const now = new Date("2026-03-09T05:30:00Z") // 12:30am Mon 9 Mar, Chicago (CDT, just sprang forward)
      const groups = groupMessagesByDay(
        [msg("a", "2026-03-08T16:00:00Z")], // 10:00am Sun 8 Mar, Chicago (CST, pre-transition)
        tz,
        now
      )
      expect(groups[0].label).toBe("Yesterday")
    })
  })
})
