// src/lib/orbit/__tests__/playback.test.ts
//
// Pure unit tests for deterministic playback composition and the static
// re-ask templates. Every founder-visible string here is composed by code
// from normalized fields (§7 structured-extract-then-format).

import { describe, it, expect } from "vitest"
import { formatGapRhythmRow, formatRhythmRow, formatTimeLocal, REASK_COPY } from "../playback"
import type { StoredRhythm } from "../rhythm"

const rhythm =(over: Partial<StoredRhythm>): StoredRhythm => ({
  activity: "climbing",
  title: "x",
  cadence: null,
  daysOfWeek: null,
  timeLocal: null,
  ...over,
})

describe("formatTimeLocal", () => {
  it("formats on-the-hour and off-hour times", () => {
    expect(formatTimeLocal("08:00")).toBe("8am")
    expect(formatTimeLocal("14:30")).toBe("2:30pm")
    expect(formatTimeLocal("00:00")).toBe("12am")
    expect(formatTimeLocal("12:00")).toBe("12pm")
    expect(formatTimeLocal("23:59")).toBe("11:59pm")
  })
})

describe("formatRhythmRow", () => {
  it("weekly single day", () => {
    expect(
      formatRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00" }))
    ).toEqual({ label: "CLIMBING", value: "Sun at 8am, every week" })
  })

  it("weekly multiple days uses 3-letter abbreviations and ampersands", () => {
    expect(
      formatRhythmRow(
        rhythm({ activity: "runs", cadence: "weekly", daysOfWeek: [1, 3], timeLocal: "06:30" })
      ).value
    ).toBe("Mon & Wed at 6:30am, every week")
  })

  it("weekly all seven days reads as every day", () => {
    expect(
      formatRhythmRow(
        rhythm({
          activity: "walks",
          cadence: "weekly",
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          timeLocal: "06:00",
        })
      ).value
    ).toBe("Every day at 6am")
  })

  it("monthly with nothing stated", () => {
    expect(formatRhythmRow(rhythm({ activity: "beers", cadence: "monthly" })).value).toBe(
      "Once a month, we'll pick a day later"
    )
  })

  it("monthly with a stated day", () => {
    expect(
      formatRhythmRow(rhythm({ activity: "beers", cadence: "monthly", daysOfWeek: [5] })).value
    ).toBe("Fri, once a month")
  })

  it("monthly with a stated day and time", () => {
    expect(
      formatRhythmRow(
        rhythm({ activity: "beers", cadence: "monthly", daysOfWeek: [5], timeLocal: "18:00" })
      ).value
    ).toBe("Fri at 6pm, once a month")
  })

  it("loose (no cadence)", () => {
    expect(formatRhythmRow(rhythm({ activity: "camping" })).value).toBe(
      "We'll sort out timing later"
    )
  })

  it("label is uppercased activity capped at two words", () => {
    expect(formatRhythmRow(rhythm({ activity: "board game nights" })).label).toBe("BOARD GAME")
    expect(formatRhythmRow(rhythm({ activity: "beers" })).label).toBe("BEERS")
  })

  it("every value row starts with a capital letter, for consistent reading", () => {
    const samples = [
      rhythm({ cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00" }),
      rhythm({ cadence: "weekly", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeLocal: "06:00" }),
      rhythm({ activity: "beers", cadence: "monthly" }),
      rhythm({ activity: "beers", cadence: "monthly", daysOfWeek: [5] }),
      rhythm({ activity: "camping" }),
    ]
    for (const s of samples) {
      const { value } = formatRhythmRow(s)
      expect(value.charAt(0)).toBe(value.charAt(0).toUpperCase())
    }
  })
})

describe("formatGapRhythmRow", () => {
  // The gap card's gapped row: the known part of the value plus the marker
  // Orbit points at with the lime underline. All composed by code.

  it("time gap shows the known days and the what-time marker", () => {
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [1, 3] }), "time", null)
    ).toEqual({ label: "CLIMBING", known: "Mon & Wed", marker: "what time?" })
  })

  it("day gap shows the known time", () => {
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", timeLocal: "19:00" }), "day", null)
    ).toEqual({ label: "CLIMBING", known: "At 7pm", marker: "what days?" })
  })

  it("both gap has no known part", () => {
    expect(formatGapRhythmRow(rhythm({ cadence: "weekly" }), "both", null)).toEqual({
      label: "CLIMBING",
      known: null,
      marker: "what day and time?",
    })
  })

  it("cadence gap shows day and time with the every-week marker", () => {
    expect(
      formatGapRhythmRow(rhythm({ daysOfWeek: [1, 3], timeLocal: "19:00" }), "cadence", null)
    ).toEqual({ label: "CLIMBING", known: "Mon & Wed at 7pm", marker: "every week?" })
  })

  it("ambiguous gap shows the bare candidate hour, deliberately without am or pm", () => {
    // The stored timeLocal is null for an ambiguous primary; the candidate
    // travels separately and renders without am/pm — honest about not knowing.
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", "19:00")
    ).toEqual({ label: "CLIMBING", known: "Tue at 7", marker: "morning or evening?" })
  })

  it("bare candidate hour handles minutes and twelve o'clock", () => {
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", "19:30")
        .known
    ).toBe("Tue at 7:30")
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", "12:00")
        .known
    ).toBe("Tue at 12")
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", "00:30")
        .known
    ).toBe("Tue at 12:30")
  })

  it("a null candidate degrades the ambiguous row to a plain time gap", () => {
    expect(
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", null)
    ).toEqual({ label: "CLIMBING", known: "Tue", marker: "what time?" })
  })
})

describe("copy rules", () => {
  it("no em or en dashes anywhere in composed copy or re-ask templates", () => {
    const samples = [
      ...Object.values(REASK_COPY),
      formatRhythmRow(rhythm({ activity: "beers", cadence: "monthly" })).value,
      formatRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [0], timeLocal: "08:00" })).value,
      formatRhythmRow(rhythm({ activity: "camping" })).value,
    ]
    for (const s of samples) expect(s).not.toMatch(/[—–]/)
  })

  it("re-ask templates match the approved copy", () => {
    expect(REASK_COPY.time).toBe(
      "Got it. What time do you usually meet? Add that to your description and I'll set up the schedule."
    )
    expect(REASK_COPY.day).toBe(
      "Got it. What days do you usually meet? Add that and I'll set up the schedule."
    )
    expect(REASK_COPY.both).toBe(
      "I need a day and a time to set up your schedule. Add those to your description and try again."
    )
    expect(REASK_COPY.cadence).toBe(
      "Got it. Is that every week? Say so in your description and I'll set up the schedule."
    )
    expect(REASK_COPY.nothing_schedulable).toBe(
      "Tell me a bit more about what your group does together and when. I need an activity, a day, and a time to get your schedule going."
    )
    expect(REASK_COPY.ambiguous_time).toBe(
      "Got it. Is that morning or evening? Add am or pm to your description and I'll set up the schedule."
    )
  })

  it("gap markers carry no em or en dashes", () => {
    const markers = [
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [1] }), "time", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly" }), "both", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "ambiguous_time", "19:00")
        .marker,
    ]
    for (const m of markers) expect(m).not.toMatch(/[—–]/)
  })
})
