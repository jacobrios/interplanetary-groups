// src/lib/orbit/__tests__/playback.test.ts
//
// Pure unit tests for deterministic playback composition and the static
// re-ask templates. Every founder-visible string here is composed by code
// from normalized fields (§7 structured-extract-then-format).

import { describe, it, expect } from "vitest"
import {
  EXHAUSTED_COPY,
  formatGapRhythmRow,
  formatOtherActivitiesNote,
  formatRhythmRow,
  formatTimeLocal,
  REASK_COPY,
} from "../playback"
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
      "Once a month, no set day yet"
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
      "No set schedule yet"
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

describe("formatGapRhythmRow, spot kinds", () => {
  const climb = (over: Partial<StoredRhythm> = {}) =>
    rhythm({ cadence: "weekly", daysOfWeek: [2, 4], timeLocal: "19:00", ...over })

  it("spot alone keeps the whole schedule as the known part", () => {
    expect(formatGapRhythmRow(climb(), "spot", null)).toEqual({
      label: "CLIMBING", known: "Tue & Thu at 7pm", marker: "where?",
    })
  })
  it("spot alone on every day reads every day", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }), "spot", null).known).toBe("Every day at 7pm")
  })
  it("time and spot", () => {
    expect(formatGapRhythmRow(climb({ timeLocal: null }), "time_spot", null)).toEqual({
      label: "CLIMBING", known: "Tue & Thu", marker: "what time and where?",
    })
  })
  it("day and spot, both and spot, cadence and spot", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: null }), "day_spot", null)).toMatchObject({ known: "At 7pm", marker: "what days and where?" })
    expect(formatGapRhythmRow(climb({ daysOfWeek: null, timeLocal: null }), "both_spot", null)).toMatchObject({ known: null, marker: "when and where?" })
    expect(formatGapRhythmRow(climb({ cadence: null }), "cadence_spot", null)).toMatchObject({ known: "Tue & Thu at 7pm", marker: "every week, and where?" })
  })
  it("ambiguous time and spot, and its null-candidate degrade", () => {
    expect(formatGapRhythmRow(climb({ daysOfWeek: [2], timeLocal: null }), "ambiguous_time_spot", "19:00")).toMatchObject({ known: "Tue at 7", marker: "morning or evening, and where?" })
    expect(formatGapRhythmRow(climb({ daysOfWeek: [2], timeLocal: null }), "ambiguous_time_spot", null)).toMatchObject({ known: "Tue", marker: "what time and where?" })
  })
})

describe("EXHAUSTED_COPY", () => {
  it("names the spot, not the day and time, when only the spot is missing (the bug decision 4 fixes)", () => {
    expect(EXHAUSTED_COPY.spot).toBe(
      "I still need to know where you meet. Add it to your description, like “at Movement Gowanus”, and I'll take another look."
    )
    expect(EXHAUSTED_COPY.spot).not.toMatch(/day|time/i)
  })
  it("a combined gap names both halves", () => {
    expect(EXHAUSTED_COPY.time_spot).toMatch(/what time you meet, and where/)
  })
  it("nothing schedulable reuses the Step 1 copy", () => {
    expect(EXHAUSTED_COPY.nothing_schedulable).toBe(REASK_COPY.nothing_schedulable)
  })
  it("carries no em or en dashes", () => {
    for (const s of [...Object.values(EXHAUSTED_COPY), ...Object.values(REASK_COPY)]) expect(s).not.toMatch(/[—–]/)
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
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [2] }), "spot", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [1] }), "time_spot", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly" }), "day_spot", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly" }), "both_spot", null).marker,
      formatGapRhythmRow(rhythm({ cadence: "weekly", daysOfWeek: [1] }), "cadence_spot", null)
        .marker,
      formatGapRhythmRow(
        rhythm({ cadence: "weekly", daysOfWeek: [2] }),
        "ambiguous_time_spot",
        "19:00"
      ).marker,
    ]
    for (const m of markers) expect(m).not.toMatch(/[—–]/)
  })
})

describe("formatOtherActivitiesNote", () => {
  it("returns null for no others", () => {
    expect(formatOtherActivitiesNote("climbing", [])).toBeNull()
  })

  it("one other activity", () => {
    expect(formatOtherActivitiesNote("climbing", ["beers"])).toBe(
      "I'll put climbing on the calendar every week. For beers, just say it in the group chat when someone's up for it, like \u201cbeers Friday?\u201d I'll take it from there."
    )
  })

  it("two other activities join with and", () => {
    expect(formatOtherActivitiesNote("climbing", ["beers", "board games"])).toBe(
      "I'll put climbing on the calendar every week. For beers and board games, just say it in the group chat when someone's up for it, like \u201cbeers Friday?\u201d I'll take it from there."
    )
  })

  it("three other activities join with commas and a final and", () => {
    expect(
      formatOtherActivitiesNote("climbing", ["beers", "board games", "brunch"])
    ).toBe(
      "I'll put climbing on the calendar every week. For beers, board games, and brunch, just say it in the group chat when someone's up for it, like \u201cbeers Friday?\u201d I'll take it from there."
    )
  })

  it("four or more other activities collapse to a summary phrase, example still uses the first", () => {
    expect(
      formatOtherActivitiesNote("climbing", ["beers", "board games", "brunch", "hiking"])
    ).toBe(
      "I'll put climbing on the calendar every week. For the other things you mentioned, just say it in the group chat when someone's up for it, like \u201cbeers Friday?\u201d I'll take it from there."
    )
  })

  it("never contains an em or en dash", () => {
    const outputs = [
      formatOtherActivitiesNote("climbing", ["beers"]),
      formatOtherActivitiesNote("climbing", ["beers", "board games"]),
      formatOtherActivitiesNote("climbing", ["beers", "board games", "brunch"]),
      formatOtherActivitiesNote("climbing", ["beers", "board games", "brunch", "hiking"]),
    ]
    for (const out of outputs) {
      expect(out).not.toMatch(/[\u2013\u2014]/)
    }
  })
})
