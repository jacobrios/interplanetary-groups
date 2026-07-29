import { describe, it, expect } from "vitest"
import {
  buildCantDoReply,
  buildChangeAnnouncement,
  buildChangeQuestion,
  changeChipLabels,
  changeStartInstant,
  PAST_TIME_REPLY,
  resolveChangeTime,
  buildGroupProposalQuestion,
  buildConsensusAnnouncement,
  proposalChipLabels,
  buildProposalTallyLine,
  buildWhichPlanQuestion,
  buildWhichTimeQuestion,
  buildAlreadyAtReply,
  NO_PLANS_REPLY,
} from "../change-copy"

// Fixtures in UTC so wall time and instant read the same in assertions.
const ZONE = "UTC"
const MORNING_EVENT = new Date("2099-06-14T08:00:00Z") // Sun 8am
const EVENING_EVENT = new Date("2099-06-12T19:00:00Z") // Fri 7pm
const NOW = new Date("2099-06-10T12:00:00Z") // Wed before both

describe("resolveChangeTime", () => {
  it("keeps an unambiguous time untouched, no disclosure", () => {
    expect(
      resolveChangeTime({
        requestedTime: "18:00",
        requestedTimeAmbiguous: false,
        eventStartsAt: MORNING_EVENT,
        timeZone: ZONE,
      })
    ).toEqual({ timeLocal: "18:00", disclosure: null })
  })

  it("reads a bare 9 on a morning plan as 9am, disclosed", () => {
    const r = resolveChangeTime({
      requestedTime: "21:00", // the model's best reading; ambiguous
      requestedTimeAmbiguous: true,
      eventStartsAt: MORNING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("09:00")
    expect(r.disclosure).toBe(
      "You said 9, and since this plan was in the morning I took that as 9am."
    )
  })

  it("reads a bare 9 on an evening plan as 9pm, disclosed", () => {
    const r = resolveChangeTime({
      requestedTime: "09:00",
      requestedTimeAmbiguous: true,
      eventStartsAt: EVENING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("21:00")
    expect(r.disclosure).toBe(
      "You said 9, and since this plan was in the evening I took that as 9pm."
    )
  })

  it("keeps minutes through inheritance", () => {
    const r = resolveChangeTime({
      requestedTime: "21:30",
      requestedTimeAmbiguous: true,
      eventStartsAt: MORNING_EVENT,
      timeZone: ZONE,
    })
    expect(r.timeLocal).toBe("09:30")
  })

  it("leaves twelve o'clock to the model's best reading, undisclosed", () => {
    expect(
      resolveChangeTime({
        requestedTime: "12:00",
        requestedTimeAmbiguous: true,
        eventStartsAt: EVENING_EVENT,
        timeZone: ZONE,
      })
    ).toEqual({ timeLocal: "12:00", disclosure: null })
  })
})

describe("changeStartInstant", () => {
  it("keeps the event's local day and swaps the wall time", () => {
    expect(changeStartInstant(MORNING_EVENT, "18:00", ZONE).toISOString()).toBe(
      "2099-06-14T18:00:00.000Z"
    )
  })
  it("respects the group zone", () => {
    // 8am UTC on Jun 14 is Jun 14 in LA too (1am); 18:00 LA wall = 01:00 UTC Jun 15.
    expect(
      changeStartInstant(MORNING_EVENT, "18:00", "America/Los_Angeles").toISOString()
    ).toBe("2099-06-15T01:00:00.000Z")
  })
})

describe("copy composers", () => {
  it("announcement names both times, the reset, and the revert invitation", () => {
    const body = buildChangeAnnouncement(
      "climbing",
      new Date("2099-06-14T18:00:00Z"),
      MORNING_EVENT,
      ZONE,
      NOW,
      null
    )
    expect(body).toBe(
      "Done. Climbing this Sun is moving to 6pm, it was 8am. Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at 8am? Say the word."
    )
  })

  it("announcement carries the disclosure when one was needed", () => {
    const body = buildChangeAnnouncement(
      "climbing",
      new Date("2099-06-14T09:00:00Z"),
      MORNING_EVENT,
      ZONE,
      NOW,
      "You said 9, and since this plan was in the morning I took that as 9am."
    )
    expect(body).toContain("it was 8am. You said 9, and since this plan was in the morning I took that as 9am. Since the time changed")
  })

  it("switches to a dated phrase beyond a week, like the gauge copy", () => {
    const farOut = new Date("2099-06-21T18:00:00Z") // 11 days from NOW
    const body = buildChangeAnnouncement("climbing", farOut, MORNING_EVENT, ZONE, NOW, null)
    expect(body).toContain("on Sun, Jun 21")
  })

  it("question proposes the concrete reading and asks", () => {
    expect(buildChangeQuestion("climbing", new Date("2099-06-14T09:00:00Z"), ZONE, NOW)).toBe(
      "Sounds like you want climbing this Sun moved to 9am. Want me to make the change?"
    )
  })

  it("declines by field: day wins over venue, venue over other", () => {
    expect(buildCantDoReply(["day", "time"], MORNING_EVENT, ZONE)).toBe(
      "I can't move it to another day yet. I can change the time on Sun if that helps."
    )
    expect(buildCantDoReply(["venue"], MORNING_EVENT, ZONE)).toBe(
      "I can't change the spot yet, that's coming. I can move the time if that helps."
    )
    expect(buildCantDoReply(["other"], MORNING_EVENT, ZONE)).toBe(
      "I can't change that part of the plan yet. Moving the time is what I can do."
    )
  })

  it("fixed strings and chip labels", () => {
    expect(PAST_TIME_REPLY).toBe("That time has already passed, so I'm leaving the plan alone.")
    expect(changeChipLabels()).toEqual({ confirm: "Yes, move it", decline: "Leave it" })
  })
})

describe("group proposal copy", () => {
  const TZ = "America/Chicago"
  const now = new Date("2026-07-26T15:00:00Z")
  const oldStart = new Date("2026-07-28T13:00:00Z") // Tue 8:00am
  const newStart = new Date("2026-07-28T14:00:00Z") // Tue 9:00am

  it("the question names the asker, both times, and asks the group", () => {
    const q = buildGroupProposalQuestion("Sam", "climbing", newStart, oldStart, TZ, now, null)
    expect(q).toBe("Sam wants climbing this Tue at 9am instead of 8am. Works for you?")
  })

  it("the disclosure rides the question once", () => {
    const q = buildGroupProposalQuestion("Sam", "climbing", newStart, oldStart, TZ, now,
      "You said 9, and since this plan was in the morning I took that as 9am.")
    expect(q).toContain("Works for you? You said 9,")
  })

  it("the announcement never assumes a count and owns the seeding out loud", () => {
    const a = buildConsensusAnnouncement("climbing", newStart, oldStart, TZ, now)
    expect(a).toBe(
      "That settles it. Climbing this Tue is moving to 9am, it was 8am. I marked everyone who said yes as in; the rest of you, answer again up top. Want it back at 8am? Say the word."
    )
    expect(a).not.toMatch(/three|Three|3/)
  })

  it("chips are soft on both sides", () => {
    expect(proposalChipLabels(newStart, oldStart, TZ)).toEqual({
      yes: "9am works",
      keep: "Keep 8am",
    })
  })

  it("tally: names for yeses, count for keeps, countdown only when told", () => {
    expect(buildProposalTallyLine([], 0, false)).toBe("")
    expect(buildProposalTallyLine(["Sam"], 0, false)).toBe("Sam says yes")
    expect(buildProposalTallyLine(["Sam", "Priya"], 1, false)).toBe(
      "Sam & Priya say yes · 1 would keep it"
    )
    expect(buildProposalTallyLine(["Sam", "Priya"], 0, true)).toBe(
      "Sam & Priya say yes · one more makes it happen"
    )
  })

  it("verify questions are concrete about what they know", () => {
    expect(buildWhichPlanQuestion(["climbing", "beers"])).toBe(
      "I can move a time. Which plan do you mean, climbing or beers?"
    )
    expect(buildWhichTimeQuestion("beers")).toBe(
      "Happy to move beers. What time were you thinking?"
    )
  })

  it("already-at and no-plans replies", () => {
    expect(buildAlreadyAtReply("climbing", oldStart, TZ, now)).toBe(
      "Good news, climbing this Tue is already at 8am."
    )
    expect(NO_PLANS_REPLY).toBe("I don't see any plans on the calendar right now.")
  })

  it("the targetless decline drops the weekday clause", () => {
    expect(buildCantDoReply(["day"], null, TZ)).toBe(
      "I can't move it to another day yet. I can change the time if that helps."
    )
  })
})
