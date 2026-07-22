// src/lib/orbit/__tests__/merge.test.ts
//
// The one thing merge.ts owns beyond the shared call helper is the
// CURRENT UNDERSTANDING re-encode: the stored partial state rebuilt in
// schema shape so the model carries fields the answer does not touch.
// A field missing from that re-encode is a field every gap round silently
// drops. The call helper is mocked; these tests assert the wire payload.

import { vi, describe, it, expect } from "vitest"

vi.mock("../extract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../extract")>()),
  callExtractionModel: vi.fn(async () => ({})),
}))

import { callExtractionModel } from "../extract"
import { mergeGapAnswer } from "../merge"

function sentUnderstanding(): { rhythms: Array<Record<string, unknown>> } {
  const user = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
  return JSON.parse(user.split("CURRENT UNDERSTANDING:\n")[1].split("\n\nCANDIDATE TIME")[0])
}

describe("mergeGapAnswer re-encode", () => {
  it("re-encodes venueName into CURRENT UNDERSTANDING so a gap round cannot drop a captured venue", async () => {
    await mergeGapAnswer({
      description: "we climb tuesdays at summit gym",
      groupName: null,
      currentState: [
        {
          activity: "climbing",
          title: "Climbing",
          cadence: "weekly",
          daysOfWeek: [2],
          timeLocal: null,
          venueName: "Summit Gym",
        },
      ],
      candidateTimeLocal: null,
      askedAbout: "time",
      answer: "7pm",
    })
    expect(sentUnderstanding().rhythms[0].venueName).toBe("Summit Gym")
  })

  it("re-encodes an absent venueName as explicit null (the schema's not-stated shape)", async () => {
    await mergeGapAnswer({
      description: "we climb tuesdays",
      groupName: null,
      currentState: [
        { activity: "climbing", title: "Climbing", cadence: "weekly", daysOfWeek: [2], timeLocal: null },
      ],
      candidateTimeLocal: null,
      askedAbout: "time",
      answer: "7pm",
    })
    expect(sentUnderstanding().rhythms[0].venueName).toBeNull()
  })
})
