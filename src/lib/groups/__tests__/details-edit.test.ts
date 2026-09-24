// Pure-function tests for validating and diffing a founder's group-details
// edit. No database: fixtures are inline StoredRhythm literals.

import { describe, it, expect } from "vitest"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import {
  DETAILS_UNSCHEDULABLE,
  DETAILS_NO_NAME,
  DETAILS_NO_ACTIVITY,
  DETAILS_GENERIC,
  toRhythmEdit,
  validateDetailsEdit,
  diffDetails,
} from "../details-edit"

const STORED: StoredRhythm[] = [
  { activity: "tennis", title: "Tennis", cadence: "weekly", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 3" },
  { activity: "beers", title: "Beers", cadence: "monthly", daysOfWeek: [5], timeLocal: "19:00", venueName: null },
]
const edit = (patch = {}) => ({ name: "Saturday Tennis", rhythms: STORED.map(toRhythmEdit), ...patch })

it("accepts an unchanged edit and returns stored-shaped rhythms", () => {
  const r = validateDetailsEdit(STORED, edit())
  expect(r).toEqual({ ok: true, name: "Saturday Tennis", rhythms: STORED })
})
it("refuses zero days on the first activity", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], daysOfWeek: null }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: DETAILS_UNSCHEDULABLE })
})
it("refuses a missing or malformed time on the first activity", () => {
  for (const t of [null, "25:00", "9am"]) {
    const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], timeLocal: t }
    expect(validateDetailsEdit(STORED, edit({ rhythms: rh })).ok).toBe(false)
  }
})
it("refuses clearing the first activity's spot", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], venueName: "  " }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: "Add where you meet for tennis." })
})
it("accepts clearing a later activity's spot", () => {
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], venueName: "Rusty Anchor" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[1].venueName).toBe("Rusty Anchor")
})
it("keeps a monthly rhythm monthly whatever is edited", () => {
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], daysOfWeek: [3], timeLocal: "18:00" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[1].cadence).toBe("monthly")
})
it("derives the title from a renamed activity", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], activity: "padel" }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[0].title).toBe("Padel")
})
it("dedupes and sorts days, dropping out-of-range values", () => {
  const rh = STORED.map(toRhythmEdit); rh[0] = { ...rh[0], daysOfWeek: [6, 1, 1, 9] }
  const r = validateDetailsEdit(STORED, edit({ rhythms: rh }))
  expect(r.ok && r.rhythms[0].daysOfWeek).toEqual([1, 6])
})
it("refuses a blank group name and a blank activity", () => {
  expect(validateDetailsEdit(STORED, edit({ name: "  " }))).toEqual({ ok: false, error: DETAILS_NO_NAME })
  const rh = STORED.map(toRhythmEdit); rh[1] = { ...rh[1], activity: " " }
  expect(validateDetailsEdit(STORED, edit({ rhythms: rh }))).toEqual({ ok: false, error: DETAILS_NO_ACTIVITY })
})
it("refuses adding or removing an activity", () => {
  expect(validateDetailsEdit(STORED, edit({ rhythms: [toRhythmEdit(STORED[0])] }))).toEqual({ ok: false, error: DETAILS_GENERIC })
})
describe("diffDetails", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffDetails(STORED, STORED, "A", "A")).toEqual({ nameChanged: false, rhythms: [] })
  })
  it("reports each field independently", () => {
    const after = [{ ...STORED[0], activity: "padel", title: "Padel", timeLocal: "08:00", venueName: "Court 5" }, STORED[1]]
    expect(diffDetails(STORED, after, "A", "B")).toEqual({
      nameChanged: true,
      rhythms: [{ index: 0, activity: { from: "tennis", to: "padel" }, schedule: true, spot: { from: "Court 3", to: "Court 5" } }],
    })
  })
  it("treats reordered identical days as unchanged", () => {
    const before = [{ ...STORED[0], daysOfWeek: [1, 6] }]
    const after = [{ ...STORED[0], daysOfWeek: [6, 1] }]
    expect(diffDetails(before, after, "A", "A").rhythms).toEqual([])
  })
})
