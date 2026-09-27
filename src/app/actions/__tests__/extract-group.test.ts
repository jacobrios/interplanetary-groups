import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/orbit/extract", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/extract")>()
  return { ...mod, extractGroupProfile: vi.fn() }
})

vi.mock("@/lib/orbit/merge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orbit/merge")>()
  return { ...mod, mergeGapAnswer: vi.fn() }
})

import { extractGroupProfile } from "@/lib/orbit/extract"
import { mergeGapAnswer } from "@/lib/orbit/merge"
import { ExtractionError, ModelUnavailableError } from "@/lib/orbit/model-errors"
import { extractGroupAction } from "../extract-group"

function form(description: string): FormData {
  const f = new FormData()
  f.set("description", description)
  return f
}

describe("extractGroupAction failure states", () => {
  it("maps a dry-balance failure to unavailable/credits", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ModelUnavailableError("credits", "dry")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "unavailable", reason: "credits" })
  })

  it("maps an outage to unavailable/trouble", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ModelUnavailableError("trouble", "overloaded")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "unavailable", reason: "trouble" })
  })

  it("keeps a plain failure on the generic error state", async () => {
    vi.mocked(extractGroupProfile).mockRejectedValueOnce(
      new ExtractionError("response was not valid JSON")
    )
    const result = await extractGroupAction({ status: "idle" }, form("we climb sundays"))
    expect(result).toEqual({ status: "error" })
  })
})

describe("extractGroupAction, the spot gap", () => {
  it("a full schedule with no spot asks for the spot, naming the activity when the model asked nothing", async () => {
    vi.mocked(extractGroupProfile).mockResolvedValueOnce({
      suggestedGroupName: "Climbing Crew",
      clarifyingQuestion: null,
      rhythms: [
        {
          activity: "climbing",
          cadence: "weekly",
          daysOfWeek: [2, 4],
          timeLocal: "19:00",
          timeAmbiguous: false,
          isPrimary: true,
          venueName: null,
        },
      ],
    })
    const result = await extractGroupAction(
      { status: "idle" },
      form("we climb tuesdays and thursdays at 7pm")
    )
    expect(result).toMatchObject({
      status: "incomplete",
      gap: { missing: "spot", question: "Where do you usually meet for climbing?" },
    })
  })
})

describe("extractGroupAction, remembered answers", () => {
  // Day but no time and no spot: incomplete, so remembered answers matter.
  const incomplete = {
    suggestedGroupName: "Tuesday Climbers",
    clarifyingQuestion: null,
    rhythms: [
      {
        activity: "climbing",
        cadence: "weekly",
        daysOfWeek: [2],
        timeLocal: null,
        timeAmbiguous: false,
        isPrimary: true,
        venueName: null,
      },
    ],
  }

  it("replays well-formed prior answers and returns the filled profile", async () => {
    vi.mocked(mergeGapAnswer).mockReset()
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(incomplete)
    vi.mocked(mergeGapAnswer).mockResolvedValueOnce({
      ...incomplete,
      rhythms: [{ ...incomplete.rhythms[0], timeLocal: "19:00", venueName: "Movement" }],
    })
    const f = form("we climb tuesdays")
    f.set("priorAnswers", JSON.stringify(["7pm", "Movement"]))
    const result = await extractGroupAction({ status: "idle" }, f)
    expect(vi.mocked(mergeGapAnswer).mock.calls[0][0].answer).toBe("7pm\nMovement")
    expect(result).toMatchObject({
      status: "ready",
      profile: { rhythms: [{ timeLocal: "19:00", venueName: "Movement" }] },
    })
  })

  it("a malformed priorAnswers field behaves exactly like none", async () => {
    vi.mocked(mergeGapAnswer).mockReset()
    vi.mocked(extractGroupProfile).mockResolvedValueOnce(incomplete)
    const without = await extractGroupAction({ status: "idle" }, form("we climb tuesdays"))

    vi.mocked(extractGroupProfile).mockResolvedValueOnce(incomplete)
    const f = form("we climb tuesdays")
    f.set("priorAnswers", "{not json")
    const malformed = await extractGroupAction({ status: "idle" }, f)

    expect(malformed).toEqual(without)
    expect(malformed).toMatchObject({ status: "incomplete" })
    expect(mergeGapAnswer).not.toHaveBeenCalled()
  })
})
