// src/lib/orbit/__tests__/spark-copy.test.ts
import { describe, it, expect } from "vitest"
import {
  buildGaugeMessage,
  buildSparkAnnouncement,
  buildTallyLine,
  chooseProposedDate,
  formatTimeLocalLabel,
  resolveSparkTime,
} from "../spark-copy"

describe("resolveSparkTime", () => {
  it("takes a clear stated time at face value, and says nothing", () => {
    expect(resolveSparkTime({ statedTime: "20:00", timeAmbiguous: false, partOfDay: "evening" }))
      .toEqual({ timeLocal: "20:00", disclosure: null })
  })

  it("takes a clear morning time at face value too", () => {
    expect(resolveSparkTime({ statedTime: "08:00", timeAmbiguous: false, partOfDay: "morning" }))
      .toEqual({ timeLocal: "08:00", disclosure: null })
  })

  it("keeps the stated hour on a coin flip and lands it in the evening", () => {
    // The person said 8. Falling back to the 7pm default here would put a time
    // on the card they never said.
    expect(resolveSparkTime({ statedTime: "08:00", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:00", disclosure: "You said 8, so I'm taking that as 8pm." })
  })

  it("leaves an already-evening ambiguous reading alone but still discloses", () => {
    expect(resolveSparkTime({ statedTime: "20:00", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:00", disclosure: "You said 8, so I'm taking that as 8pm." })
  })

  it("reads an ambiguous 12 as noon, not midnight", () => {
    expect(resolveSparkTime({ statedTime: "12:00", timeAmbiguous: true, partOfDay: null }).timeLocal)
      .toBe("12:00")
  })

  it("carries minutes through a coin flip", () => {
    expect(resolveSparkTime({ statedTime: "08:30", timeAmbiguous: true, partOfDay: null }))
      .toEqual({ timeLocal: "20:30", disclosure: "You said 8:30, so I'm taking that as 8:30pm." })
  })

  it("defaults an evening activity to 7pm with nothing to disclose", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: "evening" }))
      .toEqual({ timeLocal: "19:00", disclosure: null })
  })

  it("defaults a morning activity to 9am", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: "morning" }))
      .toEqual({ timeLocal: "09:00", disclosure: null })
  })

  it("defaults an unknown activity to the evening", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: null }).timeLocal)
      .toBe("19:00")
  })

  it("never discloses when nothing was stated: there is no guess to own up to", () => {
    expect(resolveSparkTime({ statedTime: null, timeAmbiguous: false, partOfDay: null }).disclosure)
      .toBeNull()
  })
})

describe("formatTimeLocalLabel", () => {
  it("renders the group-facing label", () => {
    expect(formatTimeLocalLabel("19:00")).toBe("7pm")
    expect(formatTimeLocalLabel("09:00")).toBe("9am")
    expect(formatTimeLocalLabel("20:30")).toBe("8:30pm")
    expect(formatTimeLocalLabel("12:00")).toBe("12pm")
    expect(formatTimeLocalLabel("00:00")).toBe("12am")
  })
})

describe("chooseProposedDate", () => {
  const TZ = "UTC"
  // Wednesday 2026-07-22.
  const WED = new Date("2026-07-22T12:00:00Z")

  it("proposes Friday for an evening activity with no stated day", () => {
    const d = chooseProposedDate(null, "evening", TZ, WED)
    expect(d.toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("proposes Friday when the activity's part of day is unknown", () => {
    expect(chooseProposedDate(null, null, TZ, WED).toISOString()).toBe("2026-07-24T00:00:00.000Z")
  })

  it("proposes Saturday for a morning activity", () => {
    // Friday was chosen on evening-social logic; breakfast should not inherit it.
    expect(chooseProposedDate(null, "morning", TZ, WED).toISOString()).toBe("2026-07-25T00:00:00.000Z")
  })

  it("still honours a stated day whatever the activity is", () => {
    // Monday, stated. Taken at face value, part of day irrelevant.
    expect(chooseProposedDate(1, "morning", TZ, WED).toISOString()).toBe("2026-07-27T00:00:00.000Z")
  })

  it("still applies the notice buffer to its own guess", () => {
    // Thursday: the coming Friday is one day out, inside the two-day buffer,
    // so it pushes a week. Part one behavior, must not regress.
    const THU = new Date("2026-07-23T12:00:00Z")
    expect(chooseProposedDate(null, "evening", TZ, THU).toISOString()).toBe("2026-07-31T00:00:00.000Z")
  })

  it("applies the buffer to the Saturday guess too", () => {
    // Friday: the coming Saturday is one day out, inside the buffer.
    const FRI = new Date("2026-07-24T12:00:00Z")
    expect(chooseProposedDate(null, "morning", TZ, FRI).toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })
})

describe("buildGaugeMessage, part two", () => {
  const TZ = "UTC"
  const WED = new Date("2026-07-22T12:00:00Z")
  const FRI = new Date("2026-07-24T00:00:00Z")

  it("makes the promise it can now keep", () => {
    const msg = buildGaugeMessage("beers", FRI, TZ, WED, null)
    expect(msg).toBe("Love it. Anyone in for beers this Friday? If three of you are in, I'll set it up.")
  })

  it("owns up to a guessed half of the day, before the promise", () => {
    const msg = buildGaugeMessage("pickleball", FRI, TZ, WED, "You said 8, so I'm taking that as 8pm.")
    expect(msg).toBe(
      "Love it. Anyone in for pickleball this Friday? You said 8, so I'm taking that as 8pm. If three of you are in, I'll set it up."
    )
  })

  it("says nothing about time when it guessed nothing", () => {
    expect(buildGaugeMessage("beers", FRI, TZ, WED, null)).not.toContain("taking that as")
  })

  it("never uses an em dash", () => {
    // Product-voice rule: Orbit does not speak in dashes.
    const msg = buildGaugeMessage("beers", FRI, TZ, WED, "You said 8, so I'm taking that as 8pm.")
    expect(msg).not.toMatch(/[—–]/)
  })
})

describe("buildTallyLine, the countdown", () => {
  const names = new Map([["a", "Jacob"], ["b", "Maya"], ["c", "Jesse"]])
  const inVote = (userId: string) => ({ userId, answer: "IN" as const })

  it("counts down when the group is one away", () => {
    expect(buildTallyLine([inVote("a"), inVote("b")], names))
      .toBe("Jacob & Maya are in so far · one more makes it happen")
  })

  it("stays quiet at one, where the countdown would be pressure", () => {
    expect(buildTallyLine([inVote("a")], names)).toBe("Jacob is in so far")
  })

  it("stops counting down once the bar is met", () => {
    expect(buildTallyLine([inVote("a"), inVote("b"), inVote("c")], names))
      .not.toContain("makes it happen")
  })

  it("does not count a different-day answer toward the bar", () => {
    const votes = [inVote("a"), { userId: "b", answer: "NOT_THAT_DAY" as const }]
    expect(buildTallyLine(votes, names)).toBe("Jacob is in so far · 1 wants a different day")
  })
})

describe("buildSparkAnnouncement", () => {
  it("names the day and the time, so the guess is visible the moment it is made", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC"))
      .toBe("Three of you are in, so beers is on for Fri at 7pm. It's up top now.")
  })

  it("never uses an em dash", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC")).not.toMatch(/[—–]/)
  })
})
