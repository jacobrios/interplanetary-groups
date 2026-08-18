// src/lib/orbit/__tests__/spark-copy.test.ts
import { describe, it, expect } from "vitest"
import {
  buildCardTallyLine,
  buildDayCommentReply,
  buildGaugeMessage,
  buildLiveGaugeLine,
  buildOpenAskLine,
  buildRetryAskMessage,
  buildRetryGuessMessage,
  buildSparkAnnouncement,
  buildSuggestedRetryMessage,
  buildTallyLine,
  buildWhichGaugeQuestion,
  chooseProposedDate,
  chooseRetryGuessDate,
  chooseSuggestedRetryDate,
  formatTimeLocalLabel,
  localWeekday,
  planAnswerGauge,
  resolveAnswerTime,
  resolveSparkTime,
  sparkStartInstant,
} from "../spark-copy"
import { getLocalParts, zonedWallTimeToUtc } from "../occurrence"

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
    // Shortened by the event-copy pass (17 Aug 2026): two rendered rows on a
    // phone against three. "Anyone in for X?" and "If three are in" were
    // asking the same question twice; the politeness was never the length.
    expect(msg).toBe("Love it. Beers this Friday? If three are in, I'll set it up.")
  })

  it("owns up to a guessed half of the day, before the promise", () => {
    const msg = buildGaugeMessage("pickleball", FRI, TZ, WED, "You said 8, so I'm taking that as 8pm.")
    expect(msg).toBe(
      "Love it. Pickleball this Friday? You said 8, so I'm taking that as 8pm. If three are in, I'll set it up."
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

describe("buildTallyLine, which no longer counts down", () => {
  const names = new Map([["a", "Jacob"], ["b", "Maya"], ["c", "Jesse"], ["d", "Sam"]])
  const inVote = (userId: string) => ({ userId, answer: "IN" as const })

  // Each surface states the bar exactly once (event-copy pass, 17 Aug 2026).
  // Orbit's own message directly above this line already says "if three are
  // in", so the tally repeating it in chat was the second telling. The card
  // keeps its countdown because nothing on the card says the bar otherwise.
  it("names who is in and stops there, even one away from the bar", () => {
    expect(buildTallyLine([inVote("a"), inVote("b")], names))
      .toBe("Jacob & Maya are in so far")
  })

  it("stays quiet at one, where the countdown would be pressure", () => {
    expect(buildTallyLine([inVote("a")], names)).toBe("Jacob is in so far")
  })

  it("carries no countdown at any count", () => {
    for (const n of [1, 2, 3, 4]) {
      const votes = ["a", "b", "c", "d"].slice(0, n).map(inVote)
      expect(buildTallyLine(votes, names)).not.toContain("makes it happen")
    }
  })

  it("does not count a different-day answer toward the bar", () => {
    const votes = [inVote("a"), { userId: "b", answer: "NOT_THAT_DAY" as const }]
    expect(buildTallyLine(votes, names)).toBe("Jacob is in so far · 1 wants a different day")
  })
})

// The idea card's counts form: same vote rows and same one-away countdown
// rule as buildTallyLine above, but numbers instead of names. As of the PR
// #67 QA fix it shares buildTallyLine's "one more makes it happen" wording
// too, and dropped the different-day clause entirely: "2 in · 1 for another
// day · one more makes it happen" measured 334px against the card's 298px
// ceiling, so the different-day count no longer appears on the card at all.
// The two tallies diverged again on 17 Aug 2026: the chat form dropped its
// countdown (Orbit's message above it already states the bar) while this
// card form kept one (nothing on the card states it). Two tally voices by
// design; see the describe above.
describe("buildCardTallyLine, the counts form", () => {
  const names = new Map([["a", "Jacob"], ["b", "Maya"], ["c", "Jesse"], ["d", "Sam"]])
  const inVote = (userId: string) => ({ userId, answer: "IN" as const })
  const dayVote = (userId: string) => ({ userId, answer: "NOT_THAT_DAY" as const })

  it("returns the empty string when nobody has voted", () => {
    expect(buildCardTallyLine([], names)).toBe("")
  })

  it("shows the count at one, with no countdown yet", () => {
    expect(buildCardTallyLine([inVote("a")], names)).toBe("1 in")
  })

  it("counts down when the group is one away from the three-person bar", () => {
    expect(buildCardTallyLine([inVote("a"), inVote("b")], names))
      .toBe("2 in · one more makes it happen")
  })

  it("stops counting down once the bar is met", () => {
    expect(buildCardTallyLine([inVote("a"), inVote("b"), inVote("c")], names)).toBe("3 in")
  })

  it("stays a plain count past the bar", () => {
    expect(buildCardTallyLine([inVote("a"), inVote("b"), inVote("c"), inVote("d")], names))
      .toBe("4 in")
  })

  it("never shows the different-day count, even when a different-day vote exists", () => {
    const votes = [inVote("a"), inVote("b"), dayVote("c")]
    expect(buildCardTallyLine(votes, names)).toBe("2 in · one more makes it happen")
  })

  it("does not count a different-day answer toward the in-count or the bar", () => {
    const votes = [inVote("a"), dayVote("b"), dayVote("c")]
    expect(buildCardTallyLine(votes, names)).toBe("1 in")
  })

  it("does not count a vote for someone missing from the names map", () => {
    const votes = [inVote("a"), inVote("not-a-member")]
    expect(buildCardTallyLine(votes, names)).toBe("1 in")
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

describe("buildOpenAskLine", () => {
  it("names the activity and the failed weekday", () => {
    const failedProposedDate = new Date("2026-07-24T00:00:00Z") // Fri, UTC midnight
    expect(buildOpenAskLine("beers", failedProposedDate, "UTC")).toBe(
      "Orbit asked the group what day works better for beers, since Friday didn't work, and is waiting on an answer."
    )
  })

  it("reads the weekday in the group's zone, not the server's", () => {
    // 2026-07-23T02:00Z is already Thu in UTC but still Wed in Pacific/Midway.
    const failedProposedDate = new Date("2026-07-23T02:00:00Z")
    expect(buildOpenAskLine("climbing", failedProposedDate, "Pacific/Midway")).toBe(
      "Orbit asked the group what day works better for climbing, since Wednesday didn't work, and is waiting on an answer."
    )
  })

  it("uses no em or en dashes", () => {
    const failedProposedDate = new Date("2026-07-24T00:00:00Z")
    expect(buildOpenAskLine("beers", failedProposedDate, "UTC")).not.toMatch(/[—–]/)
  })
})

describe("resolveAnswerTime", () => {
  it("no stated time carries the original's", () => {
    expect(resolveAnswerTime({ answerTime: null, answerTimeAmbiguous: false, carriedTime: "20:00" })).toBe(
      "20:00"
    )
  })

  it("a stated unambiguous time wins", () => {
    expect(resolveAnswerTime({ answerTime: "21:00", answerTimeAmbiguous: false, carriedTime: "20:00" })).toBe(
      "21:00"
    )
  })

  it("a bare number lands in the original's half of day: evening original", () => {
    // "Saturday at 9?" against a 20:00 plan is 21:00, decided by the group's
    // own stored time, so no disclosure exists anywhere in this path.
    expect(resolveAnswerTime({ answerTime: "09:00", answerTimeAmbiguous: true, carriedTime: "20:00" })).toBe(
      "21:00"
    )
  })

  it("a bare number against a morning original stays morning", () => {
    expect(resolveAnswerTime({ answerTime: "09:00", answerTimeAmbiguous: true, carriedTime: "08:00" })).toBe(
      "09:00"
    )
  })

  it("no original time falls to the evening default", () => {
    expect(resolveAnswerTime({ answerTime: null, answerTimeAmbiguous: false, carriedTime: null })).toBe(
      "19:00"
    )
  })
})

describe("planAnswerGauge", () => {
  // ask fixture: proposedDate Fri 2026-07-24, proposedTime "20:00", tz UTC.
  const ask = { proposedDate: new Date("2026-07-24T00:00:00Z"), proposedTime: "20:00" }
  const TZ = "UTC"

  it("a named day takes its next occurrence with the time carried", () => {
    const now = new Date("2026-07-25T09:00:00Z") // Sat
    const result = planAnswerGauge(
      { dayOfWeek: 6, time: null, timeAmbiguous: false },
      ask,
      TZ,
      now
    )
    expect(result).not.toBeNull()
    expect(result?.proposedDate.toISOString()).toBe("2026-07-25T00:00:00.000Z")
    expect(result?.timeLocal).toBe("20:00")
    expect(result?.seedNamer).toBe(true)
  })

  it("no named day falls to the same weekday next week, nobody seeded", () => {
    const now = new Date("2026-07-25T09:00:00Z") // Sat
    const result = planAnswerGauge(
      { dayOfWeek: null, time: null, timeAmbiguous: false },
      ask,
      TZ,
      now
    )
    expect(result).not.toBeNull()
    expect(result?.proposedDate.toISOString()).toBe("2026-07-31T00:00:00.000Z")
    expect(result?.seedNamer).toBe(false)
  })

  it("a stated time wins over the carried one", () => {
    const now = new Date("2026-07-25T09:00:00Z") // Sat
    const result = planAnswerGauge(
      { dayOfWeek: 6, time: "21:00", timeAmbiguous: false },
      ask,
      TZ,
      now
    )
    expect(result?.timeLocal).toBe("21:00")
  })

  it("refuses a start already past", () => {
    const now = new Date("2026-07-25T21:00:00Z") // Sat, after 20:00 start
    const result = planAnswerGauge(
      { dayOfWeek: 6, time: null, timeAmbiguous: false },
      ask,
      TZ,
      now
    )
    expect(result).toBeNull()
  })

  it("flags a same-evening answer as born late", () => {
    const now = new Date("2026-07-25T19:00:00Z") // Sat, within the 2-hour close window
    const result = planAnswerGauge(
      { dayOfWeek: 6, time: null, timeAmbiguous: false },
      ask,
      TZ,
      now
    )
    expect(result).not.toBeNull()
    expect(result?.bornLate).toBe(true)
  })

  it("computes the fallback across a month boundary in a non-UTC zone", () => {
    const failedProposedDate = zonedWallTimeToUtc(2099, 1, 28, 0, 0, "America/Chicago")
    const chicagoAsk = { proposedDate: failedProposedDate, proposedTime: "20:00" }
    const now = new Date("2099-01-01T00:00:00Z")
    const result = planAnswerGauge(
      { dayOfWeek: null, time: null, timeAmbiguous: false },
      chicagoAsk,
      "America/Chicago",
      now
    )
    expect(result).not.toBeNull()
    // Fri 2099-01-28 + 7 days = Fri 2099-02-04, still CST (UTC-6) in February.
    expect(result?.proposedDate.toISOString()).toBe("2099-02-04T06:00:00.000Z")
    expect(result?.timeLocal).toBe("20:00")
  })
})

describe("day-comment helpers", () => {
  // Sat 2026-08-15 as UTC group-local midnight.
  const failedSaturday = zonedWallTimeToUtc(2026, 8, 15, 0, 0, "UTC")

  it("localWeekday reads the weekday in the group's zone", () => {
    expect(localWeekday(failedSaturday, "UTC")).toBe(6)
    // 2026-08-15T00:00Z is still Friday evening in Los Angeles.
    expect(localWeekday(failedSaturday, "America/Los_Angeles")).toBe(5)
  })

  it("chooseSuggestedRetryDate lands the first named weekday strictly after the failed day", () => {
    // Sunday after Saturday Aug 15 is Aug 16.
    const sunday = chooseSuggestedRetryDate(failedSaturday, 0, "UTC")
    expect(getLocalParts(sunday, "UTC")).toMatchObject({ month: 8, day: 16 })
    // Friday after Saturday Aug 15 is Aug 21, six days out, never the day before.
    const friday = chooseSuggestedRetryDate(failedSaturday, 5, "UTC")
    expect(getLocalParts(friday, "UTC")).toMatchObject({ month: 8, day: 21 })
    // Month boundary: Wednesday after Sat Aug 29 is Sep 2.
    const lateSat = zonedWallTimeToUtc(2026, 8, 29, 0, 0, "UTC")
    const wednesday = chooseSuggestedRetryDate(lateSat, 3, "UTC")
    expect(getLocalParts(wednesday, "UTC")).toMatchObject({ month: 9, day: 2 })
  })

  it("buildDayCommentReply speaks to the not-in and already-in cases", () => {
    expect(buildDayCommentReply(failedSaturday, 0, false, "UTC")).toBe(
      "Got it, Saturday doesn't work for you. Sunday's noted in case this one doesn't come together."
    )
    expect(buildDayCommentReply(failedSaturday, 0, true, "UTC")).toBe(
      "You're still in for Saturday, and Sunday's noted if it doesn't come together."
    )
  })

  it("buildWhichGaugeQuestion lists two or more activities", () => {
    expect(buildWhichGaugeQuestion(["beers", "climbing"])).toBe(
      "Which one do you mean, beers or climbing? Name it with the day again and I've got it."
    )
    expect(buildWhichGaugeQuestion(["beers", "climbing", "games"])).toBe(
      "Which one do you mean, beers, climbing, or games? Name it with the day again and I've got it."
    )
  })

  it("buildSuggestedRetryMessage names the failed day, the new day, and keeps the promise", () => {
    const sunday = chooseSuggestedRetryDate(failedSaturday, 0, "UTC")
    expect(buildSuggestedRetryMessage("beers", failedSaturday, sunday, "UTC")).toBe(
      "Beers didn't happen for Saturday, but Sunday came up as a better day. Anyone in for beers this Sunday? If three of you are in, I'll set it up."
    )
  })

  it("buildLiveGaugeLine is model-facing context, not member copy", () => {
    expect(buildLiveGaugeLine("beers", failedSaturday, "UTC")).toBe(
      "Orbit is currently gauging interest in beers for this Saturday; the group answers with the chips under that message."
    )
  })
})
