// src/lib/orbit/__tests__/rhythm.test.ts
//
// Pure unit tests — no database, no async.  parseRhythm validates the raw
// Json? value of Group.recurringActivities and returns a typed GroupRhythm
// or null.
import { describe, it, expect } from "vitest"
import { parseRhythm } from "../rhythm"

const VALID_RHYTHM = {
  activity: "climbing",
  title: "Climbing Sunday",
  daysOfWeek: [0],
  timeLocal: "08:00",
  cadence: "weekly",
}

describe("parseRhythm", () => {
  it("returns a GroupRhythm for valid input", () => {
    const result = parseRhythm([VALID_RHYTHM])
    expect(result).not.toBeNull()
    expect(result?.activity).toBe("climbing")
    expect(result?.title).toBe("Climbing Sunday")
    expect(result?.daysOfWeek).toEqual([0])
    expect(result?.timeLocal).toBe("08:00")
    expect(result?.cadence).toBe("weekly")
  })

  it("includes durationMinutes when provided", () => {
    const result = parseRhythm([{ ...VALID_RHYTHM, durationMinutes: 90 }])
    expect(result?.durationMinutes).toBe(90)
  })

  it("durationMinutes is optional — omitting it is valid", () => {
    const result = parseRhythm([VALID_RHYTHM])
    expect(result).not.toBeNull()
    // durationMinutes may be undefined or null — both are fine
    expect(result?.durationMinutes == null).toBe(true)
  })

  it("accepts null durationMinutes", () => {
    const result = parseRhythm([{ ...VALID_RHYTHM, durationMinutes: null }])
    expect(result).not.toBeNull()
    expect(result?.durationMinutes).toBeNull()
  })

  it("accepts multiple daysOfWeek", () => {
    const result = parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: [1, 3] }])
    expect(result?.daysOfWeek).toEqual([1, 3])
  })

  it("returns null for null input", () => {
    expect(parseRhythm(null)).toBeNull()
  })

  it("returns null for undefined input", () => {
    expect(parseRhythm(undefined)).toBeNull()
  })

  it("returns null for an empty array", () => {
    expect(parseRhythm([])).toBeNull()
  })

  it("returns null for a non-array (object)", () => {
    expect(parseRhythm(VALID_RHYTHM)).toBeNull()
  })

  it("returns null for a non-array (string)", () => {
    expect(parseRhythm("climbing")).toBeNull()
  })

  it("returns null for a non-array (number)", () => {
    expect(parseRhythm(42)).toBeNull()
  })

  it("returns null when activity field is missing", () => {
    const { activity: _a, ...rest } = VALID_RHYTHM
    expect(parseRhythm([rest])).toBeNull()
  })

  it("returns null when title field is missing", () => {
    const { title: _t, ...rest } = VALID_RHYTHM
    expect(parseRhythm([rest])).toBeNull()
  })

  it("returns null when daysOfWeek field is missing", () => {
    const { daysOfWeek: _d, ...rest } = VALID_RHYTHM
    expect(parseRhythm([rest])).toBeNull()
  })

  it("returns null when timeLocal field is missing", () => {
    const { timeLocal: _tl, ...rest } = VALID_RHYTHM
    expect(parseRhythm([rest])).toBeNull()
  })

  it("returns null when cadence field is missing", () => {
    const { cadence: _c, ...rest } = VALID_RHYTHM
    expect(parseRhythm([rest])).toBeNull()
  })

  it("returns null when activity is an empty string", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, activity: "" }])).toBeNull()
  })

  it("returns null when title is an empty string", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, title: "" }])).toBeNull()
  })

  it("returns null when daysOfWeek is a string instead of array", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: "sun" }])).toBeNull()
  })

  it("returns null when daysOfWeek is an empty array", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: [] }])).toBeNull()
  })

  it("returns null when daysOfWeek contains a value out of range (7)", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: [7] }])).toBeNull()
  })

  it("returns null when daysOfWeek contains a negative value", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: [-1] }])).toBeNull()
  })

  it("returns null when daysOfWeek contains a non-integer", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, daysOfWeek: [1.5] }])).toBeNull()
  })

  it("returns null for invalid timeLocal format (missing leading zero)", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "8:00" }])).toBeNull()
  })

  it("returns null for invalid timeLocal format (with seconds)", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "08:00:00" }])).toBeNull()
  })

  it("returns null for invalid timeLocal format (non-numeric)", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, timeLocal: "morning" }])).toBeNull()
  })

  it("returns null when cadence is not 'weekly'", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, cadence: "monthly" }])).toBeNull()
  })

  it("returns null when cadence is 'Weekly' (case-sensitive)", () => {
    expect(parseRhythm([{ ...VALID_RHYTHM, cadence: "Weekly" }])).toBeNull()
  })

  it("reads the first element of the array when multiple rhythms are present", () => {
    const second = { ...VALID_RHYTHM, activity: "running", title: "Running Monday", daysOfWeek: [1] }
    const result = parseRhythm([VALID_RHYTHM, second])
    expect(result?.activity).toBe("climbing")
  })
})
