import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/orbit/merge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/merge")>()
  return { ...mod, mergeGapAnswer: vi.fn() }
})

import { mergeGapAnswer } from "@/lib/orbit/merge"
import { ModelUnavailableError } from "@/lib/orbit/model-errors"
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
