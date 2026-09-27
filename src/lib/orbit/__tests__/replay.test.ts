import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../extract", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../extract")>()
  return { ...mod, extractGroupProfile: vi.fn() }
})
vi.mock("../merge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../merge")>()
  return { ...mod, mergeGapAnswer: vi.fn() }
})

import { extractGroupProfile } from "../extract"
import { mergeGapAnswer } from "../merge"
import { ModelUnavailableError } from "../model-errors"
import type { StoredRhythm } from "../rhythm"
import { enforceFreshFieldsWin, extractWithPriorAnswers, parsePriorAnswers } from "../replay"
import { ANSWER_MAX } from "../gap"

beforeEach(() => {
  vi.mocked(extractGroupProfile).mockReset()
  vi.mocked(mergeGapAnswer).mockReset()
})

describe("parsePriorAnswers", () => {
  it("keeps a good array of answers, trimmed", () => {
    expect(parsePriorAnswers(JSON.stringify(["  7pm ", "Movement"]))).toEqual(["7pm", "Movement"])
  })

  it("drops non-string and empty items", () => {
    expect(parsePriorAnswers(JSON.stringify(["7pm", 3, null, "   ", { a: 1 }, "Tuesdays"]))).toEqual([
      "7pm",
      "Tuesdays",
    ])
  })

  it("returns [] for junk, never throws", () => {
    expect(parsePriorAnswers("{not json")).toEqual([])
    expect(parsePriorAnswers(null)).toEqual([])
    expect(parsePriorAnswers(undefined)).toEqual([])
    expect(parsePriorAnswers(42)).toEqual([])
    expect(parsePriorAnswers(new File(["x"], "x.txt"))).toEqual([])
  })

  it("returns [] for JSON that is not an array", () => {
    expect(parsePriorAnswers(JSON.stringify({ answers: ["7pm"] }))).toEqual([])
    expect(parsePriorAnswers(JSON.stringify("7pm"))).toEqual([])
  })

  it("caps each answer at the gap-answer maximum", () => {
    const long = "a".repeat(ANSWER_MAX + 50)
    const [out] = parsePriorAnswers(JSON.stringify([long]))
    expect(out).toHaveLength(ANSWER_MAX)
  })

  it("keeps only the last six answers", () => {
    const seven = ["1", "2", "3", "4", "5", "6", "7"]
    expect(parsePriorAnswers(JSON.stringify(seven))).toEqual(["2", "3", "4", "5", "6", "7"])
  })
})

function stored(over: Partial<StoredRhythm> = {}): StoredRhythm {
  return {
    activity: "climbing",
    title: "Climbing",
    cadence: "weekly",
    daysOfWeek: [2],
    timeLocal: "19:00",
    venueName: "Movement",
    ...over,
  }
}

function rawRhythm(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activity: "climbing",
    venueName: null,
    cadence: "weekly",
    daysOfWeek: [2],
    timeLocal: "20:00",
    timeAmbiguous: false,
    isPrimary: true,
    ...over,
  }
}

describe("enforceFreshFieldsWin", () => {
  it("restores a fresh time over a merged one", () => {
    const raw = { suggestedGroupName: null, clarifyingQuestion: null, rhythms: [rawRhythm({ timeLocal: "08:00" })] }
    const out = enforceFreshFieldsWin(raw, [stored({ timeLocal: "19:00" })], null) as {
      rhythms: Record<string, unknown>[]
    }
    expect(out.rhythms[0].timeLocal).toBe("19:00")
    expect(out.rhythms[0].timeAmbiguous).toBe(false)
  })

  it("restores a fresh venue over a merged one", () => {
    const raw = { rhythms: [rawRhythm({ venueName: "Brooklyn Boulders" })] }
    const out = enforceFreshFieldsWin(raw, [stored({ venueName: "Movement" })], null) as {
      rhythms: Record<string, unknown>[]
    }
    expect(out.rhythms[0].venueName).toBe("Movement")
  })

  it("restores fresh days and cadence", () => {
    const raw = { rhythms: [rawRhythm({ daysOfWeek: [6], cadence: "monthly" })] }
    const out = enforceFreshFieldsWin(raw, [stored({ daysOfWeek: [2, 4], cadence: "weekly" })], null) as {
      rhythms: Record<string, unknown>[]
    }
    expect(out.rhythms[0].daysOfWeek).toEqual([2, 4])
    expect(out.rhythms[0].cadence).toBe("weekly")
  })

  it("leaves a field the fresh rhythm lacked exactly as merged", () => {
    const raw = { rhythms: [rawRhythm({ timeLocal: "20:00", venueName: "Sam's place" })] }
    const out = enforceFreshFieldsWin(
      raw,
      [stored({ timeLocal: null, venueName: null })],
      null
    ) as { rhythms: Record<string, unknown>[] }
    expect(out.rhythms[0].timeLocal).toBe("20:00")
    expect(out.rhythms[0].venueName).toBe("Sam's place")
  })

  it("matches by activity case-insensitively and trimmed, ignoring a merged rhythm with no fresh match", () => {
    const raw = {
      rhythms: [
        rawRhythm({ activity: "  Climbing ", timeLocal: "08:00" }),
        rawRhythm({ activity: "beers", timeLocal: "21:00", isPrimary: false }),
      ],
    }
    const out = enforceFreshFieldsWin(raw, [stored({ timeLocal: "19:00" })], null) as {
      rhythms: Record<string, unknown>[]
    }
    expect(out.rhythms[0].timeLocal).toBe("19:00")
    expect(out.rhythms[1].timeLocal).toBe("21:00")
  })

  it("restores the fresh group name when there is one, and leaves the merged one otherwise", () => {
    const raw = { suggestedGroupName: "Merged Name", rhythms: [rawRhythm()] }
    const won = enforceFreshFieldsWin(raw, [stored()], "Fresh Name") as Record<string, unknown>
    expect(won.suggestedGroupName).toBe("Fresh Name")
    const kept = enforceFreshFieldsWin(raw, [stored()], null) as Record<string, unknown>
    expect(kept.suggestedGroupName).toBe("Merged Name")
  })

  it("does not mutate its input and passes non-objects through", () => {
    const raw = { rhythms: [rawRhythm({ timeLocal: "08:00" })] }
    enforceFreshFieldsWin(raw, [stored()], null)
    expect(raw.rhythms[0].timeLocal).toBe("08:00")
    expect(enforceFreshFieldsWin(null, [stored()], null)).toBeNull()
    expect(enforceFreshFieldsWin({ rhythms: "x" }, [stored()], null)).toEqual({ rhythms: "x" })
  })
})

// A description with the day but no time and no spot: incomplete, so the
// prior answers are worth replaying.
const INCOMPLETE = {
  suggestedGroupName: "Tuesday Climbers",
  clarifyingQuestion: "What time do you climb, and where?",
  rhythms: [rawRhythm({ timeLocal: null, venueName: null })],
}

const READY = {
  suggestedGroupName: "Tuesday Climbers",
  clarifyingQuestion: null,
  rhythms: [rawRhythm({ timeLocal: "19:00", venueName: "Movement" })],
}

describe("extractWithPriorAnswers", () => {
  it("skips the merge when there are no prior answers", async () => {
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(INCOMPLETE)
    await expect(extractWithPriorAnswers("we climb tuesdays", [])).resolves.toBe(INCOMPLETE)
    expect(mergeGapAnswer).not.toHaveBeenCalled()
  })

  it("skips the merge when the extraction is already ready", async () => {
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(READY)
    await expect(
      extractWithPriorAnswers("we climb tuesdays at 7pm at Movement", ["8pm"])
    ).resolves.toBe(READY)
    expect(mergeGapAnswer).not.toHaveBeenCalled()
  })

  it("skips the merge when nothing is schedulable", async () => {
    const empty = { suggestedGroupName: null, clarifyingQuestion: null, rhythms: [] }
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(empty)
    await expect(extractWithPriorAnswers("hi", ["7pm"])).resolves.toBe(empty)
    expect(mergeGapAnswer).not.toHaveBeenCalled()
  })

  it("replays the joined answers through the merge when the extraction is incomplete", async () => {
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(INCOMPLETE)
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce({
      suggestedGroupName: "Tuesday Climbers",
      clarifyingQuestion: null,
      rhythms: [rawRhythm({ timeLocal: "19:00", venueName: "Movement" })],
    })

    const out = await extractWithPriorAnswers("we climb tuesdays", ["7pm", "Movement"])

    expect(mergeGapAnswer).toHaveBeenCalledTimes(1)
    const call = vi.mocked(mergeGapAnswer).mock.calls[0][0]
    expect(call).toMatchObject({
      description: "we climb tuesdays",
      groupName: "Tuesday Climbers",
      candidateTimeLocal: null,
      askedAbout: "time_spot",
      answer: "7pm\nMovement",
    })
    expect(call.currentState[0]).toMatchObject({ activity: "climbing", daysOfWeek: [2] })
    expect(out).toMatchObject({ rhythms: [{ timeLocal: "19:00", venueName: "Movement" }] })
  })

  it("lets the fresh description win where the merge disagreed with it", async () => {
    vi.mocked(extractGroupProfile).mockResolvedValueOnce({
      ...INCOMPLETE,
      rhythms: [rawRhythm({ daysOfWeek: [4], timeLocal: null, venueName: null })],
    })
    // The old answer said Tuesdays; the new description says Thursdays.
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce({
      suggestedGroupName: "Tuesday Climbers",
      clarifyingQuestion: null,
      rhythms: [rawRhythm({ daysOfWeek: [2], timeLocal: "19:00", venueName: "Movement" })],
    })

    const out = (await extractWithPriorAnswers("we climb thursdays", ["tuesdays at 7pm, Movement"])) as {
      rhythms: Record<string, unknown>[]
    }
    expect(out.rhythms[0].daysOfWeek).toEqual([4])
    expect(out.rhythms[0].timeLocal).toBe("19:00")
  })

  it("falls back to the extraction claim when the merge throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(INCOMPLETE)
    vi.mocked(mergeGapAnswer).mockRejectedValueOnce(new ModelUnavailableError("trouble", "overloaded"))

    await expect(extractWithPriorAnswers("we climb tuesdays", ["7pm"])).resolves.toBe(INCOMPLETE)
    expect(spy).toHaveBeenCalledWith("[onboarding] prior-answer replay failed:", expect.any(Error))
    spy.mockRestore()
  })

  it("still propagates an extraction ModelUnavailableError", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(new ModelUnavailableError("credits", "dry"))
    await expect(extractWithPriorAnswers("we climb tuesdays", ["7pm"])).rejects.toBeInstanceOf(
      ModelUnavailableError
    )
  })
})
