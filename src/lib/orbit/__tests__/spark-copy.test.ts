// src/lib/orbit/__tests__/spark-copy.test.ts
import { describe, it, expect } from "vitest"
import {
  buildGaugeMessage,
  buildRetryAskMessage,
  buildRetryGuessMessage,
  buildSparkAnnouncement,
  buildTallyLine,
  chooseProposedDate,
  chooseRetryGuessDate,
  formatTimeLocalLabel,
  resolveSparkTime,
  sparkStartInstant,
} from "../spark-copy"
import { zonedWallTimeToUtc } from "../occurrence"

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
  const WED = new Date("2026-07-22T12:00:00Z")

  it("names the day and the time, so the guess is visible the moment it is made", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC", 3, WED))
      .toBe("Three of you are in, so beers is on for Fri at 7pm. It's up top now.")
  })

  it("tells the truth when a later yes is what got it over the line", () => {
    // Reachable when promotion fails transiently at the bar and a fourth yes
    // retries it. Saying "Three of you are in" to four people is a small lie in
    // Orbit's own voice, and the bar itself lives in one place for this reason.
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC", 4, WED))
      .toBe("Four of you are in, so beers is on for Fri at 7pm. It's up top now.")
  })

  it("names the date outright when the day is more than a week out", () => {
    // The fallback buffer can land eight days away, where a bare "Fri" is
    // ambiguous between this Friday and next. Matches buildGaugeMessage.
    const startsAt = new Date("2026-07-31T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC", 3, WED))
      .toBe("Three of you are in, so beers is on for Fri, Jul 31 at 7pm. It's up top now.")
  })

  it("never uses an em dash", () => {
    const startsAt = new Date("2026-07-24T19:00:00Z")
    expect(buildSparkAnnouncement("beers", startsAt, "UTC", 3, WED)).not.toMatch(/[—–]/)
  })
})

describe("resolveSparkTime, a morning activity settles its own ambiguity", () => {
  it("keeps a morning hour when the model flagged ambiguity but named the part of day", () => {
    // "hike at 6": the flag says coin flip, the activity says morning. Trusting
    // the normalized field over the flag is what stops a 6am sunrise hike
    // becoming 6pm, and there is nothing to disclose because the activity, not
    // Orbit, did the deciding.
    expect(resolveSparkTime({ statedTime: "06:00", timeAmbiguous: true, partOfDay: "morning" }))
      .toEqual({ timeLocal: "06:00", disclosure: null })
  })

  it("still flips an evening or unknown activity", () => {
    expect(resolveSparkTime({ statedTime: "06:00", timeAmbiguous: true, partOfDay: null }).timeLocal)
      .toBe("18:00")
  })
})

describe("sparkStartInstant", () => {
  it("combines the proposed day and the stored time in the group's zone", () => {
    const day = new Date("2026-07-24T00:00:00Z")
    expect(sparkStartInstant(day, "19:00", "UTC").toISOString()).toBe("2026-07-24T19:00:00.000Z")
  })

  it("falls back to the evening default for a gauge written before this slice", () => {
    const day = new Date("2026-07-24T00:00:00Z")
    expect(sparkStartInstant(day, null, "UTC").toISOString()).toBe("2026-07-24T19:00:00.000Z")
  })

  it("reads the day in the group's zone, not the server's", () => {
    // Local midnight Fri 24 Jul in UTC-11, plus 19:00 local.
    const day = new Date("2026-07-24T11:00:00Z")
    expect(sparkStartInstant(day, "19:00", "Pacific/Midway").toISOString())
      .toBe("2026-07-25T06:00:00.000Z")
  })
})

describe("chooseRetryGuessDate", () => {
  it("same weekday one week later, group-local midnight", () => {
    // Fri 2099-06-12 local midnight in Chicago -> Fri 2099-06-19 local midnight
    const failed = zonedWallTimeToUtc(2099, 6, 12, 0, 0, "America/Chicago")
    const guess = chooseRetryGuessDate(failed, "America/Chicago")
    expect(guess).toEqual(zonedWallTimeToUtc(2099, 6, 19, 0, 0, "America/Chicago"))
  })
  it("crosses a month boundary without a special case", () => {
    const failed = zonedWallTimeToUtc(2099, 1, 28, 0, 0, "America/Chicago")
    const guess = chooseRetryGuessDate(failed, "America/Chicago")
    expect(guess).toEqual(zonedWallTimeToUtc(2099, 2, 4, 0, 0, "America/Chicago"))
  })
})

describe("buildRetryAskMessage", () => {
  it("closes and asks in one breath, activity capitalized, count spelled", () => {
    const failed = zonedWallTimeToUtc(2099, 6, 12, 0, 0, "UTC") // a Friday
    expect(buildRetryAskMessage("beers", failed, "UTC", 3)).toBe(
      "Beers didn't happen for Friday, but three of you want it. What day works better?"
    )
  })
})

describe("buildRetryGuessMessage", () => {
  it("names the next same weekday, no em dashes, ends open for chips", () => {
    const guess = zonedWallTimeToUtc(2099, 6, 19, 0, 0, "UTC") // a Friday
    expect(buildRetryGuessMessage("beers", guess, "UTC")).toBe(
      "No takers on a new day yet, so how about beers next Friday?"
    )
  })
})
