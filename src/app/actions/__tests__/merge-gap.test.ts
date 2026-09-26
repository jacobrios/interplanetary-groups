import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/orbit/merge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/merge")>()
  return { ...mod, mergeGapAnswer: vi.fn() }
})

import { mergeGapAnswer } from "@/lib/orbit/merge"
import { ModelUnavailableError } from "@/lib/orbit/model-errors"
import { GAP_ASKABLE_KINDS } from "@/lib/orbit/gap"
import { mergeGapAction } from "../merge-gap"

const GAP_INPUT = {
  description: "we climb on sundays",
  answer: "8am",
  round: 0,
  gap: {
    missing: "time" as const,
    groupName: "Sunday Climbers",
    rhythms: [
      {
        activity: "climbing",
        title: "Climbing",
        cadence: "weekly",
        daysOfWeek: [0],
        timeLocal: null,
        venueName: null,
      },
    ],
    candidateTimeLocal: null,
  },
}

describe("mergeGapAction failure states", () => {
  it("maps a dry-balance failure to unavailable/credits, round not consumed", async () => {
    vi.mocked(mergeGapAnswer).mockRejectedValueOnce(new ModelUnavailableError("credits", "dry"))
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "unavailable", reason: "credits" })
  })

  it("keeps a plain failure on the generic error state", async () => {
    vi.mocked(mergeGapAnswer).mockRejectedValueOnce(new Error("boom"))
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "error" })
  })
})

function rawRhythm(over: Record<string, unknown> = {}) {
  return {
    activity: "climbing",
    cadence: "weekly",
    daysOfWeek: [0],
    timeLocal: "08:00",
    timeAmbiguous: false,
    isPrimary: true,
    venueName: null,
    ...over,
  }
}

function raw(r: ReturnType<typeof rawRhythm>) {
  return { suggestedGroupName: "Sunday Climbers", clarifyingQuestion: null, rhythms: [r] }
}

describe("mergeGapAction, the spot kinds and the cap", () => {
  it("accepts every askable kind", async () => {
    for (const kind of GAP_ASKABLE_KINDS) {
      vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm({ venueName: "Summit Gym" })))
      const result = await mergeGapAction({ ...GAP_INPUT, gap: { ...GAP_INPUT.gap, missing: kind } })
      expect(result.status).toBe("ready")
    }
  })

  it("still refuses an unknown kind", async () => {
    const result = await mergeGapAction({
      ...GAP_INPUT,
      gap: { ...GAP_INPUT.gap, missing: "venue" as never },
    })
    expect(result).toEqual({ status: "error" })
  })

  it("a third answer is still asked about (round 1 -> round 2)", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm()))
    const result = await mergeGapAction({
      ...GAP_INPUT,
      round: 1,
      gap: { ...GAP_INPUT.gap, missing: "spot" },
    })
    expect(result).toMatchObject({ status: "incomplete", round: 2, gap: { missing: "spot" } })
  })

  it("after the third answer it gives up, saying what is still missing", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(raw(rawRhythm()))
    const result = await mergeGapAction({
      ...GAP_INPUT,
      round: 2,
      gap: { ...GAP_INPUT.gap, missing: "spot" },
    })
    expect(result).toEqual({ status: "exhausted", missing: "spot" })
  })

  it("a merge that loses everything schedulable gives up naming that", async () => {
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce({
      suggestedGroupName: null,
      clarifyingQuestion: null,
      rhythms: [],
    })
    const result = await mergeGapAction(GAP_INPUT)
    expect(result).toEqual({ status: "exhausted", missing: "nothing_schedulable" })
  })

  it("an 'idk' answer to the spot question keeps asking and keeps a spot already given", async () => {
    // prior state already holds a spot for climbing; the answer is a non-answer
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce(
      raw(rawRhythm({ timeLocal: null, venueName: "idk" }))
    )
    const result = await mergeGapAction({
      ...GAP_INPUT,
      answer: "idk",
      gap: {
        ...GAP_INPUT.gap,
        missing: "time",
        rhythms: [{ ...GAP_INPUT.gap.rhythms[0], venueName: "Summit Gym" }],
      },
    })
    expect(result).toMatchObject({ status: "incomplete", gap: { missing: "time" } })
    if (result.status !== "incomplete") return
    expect(result.gap.rhythms[0].venueName).toBe("Summit Gym")
  })
})
