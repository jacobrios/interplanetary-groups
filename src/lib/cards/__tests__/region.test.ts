import { describe, expect, it } from "vitest"
import {
  CARD_REGION_CAP,
  composeCardRegion,
  eventNeedLabel,
  ideaNeedLabel,
} from "../region"

describe("composeCardRegion", () => {
  const ev = (id: string, ms: number) => ({ sortMs: ms, data: id })
  const idea = (id: string, ms: number) => ({ sortMs: ms, item: id })

  it("mingles kinds in pure date order", () => {
    const out = composeCardRegion([ev("sat", 200)], [idea("fri", 100)])
    expect(out.map((e) => e.kind)).toEqual(["idea", "event"])
  })

  it("breaks a same-instant tie in favor of the confirmed plan", () => {
    const out = composeCardRegion([ev("e", 100)], [idea("i", 100)])
    expect(out[0].kind).toBe("event")
  })

  it("caps the combined list at five", () => {
    const events = [ev("a", 1), ev("b", 2), ev("c", 3)]
    const ideas = [idea("x", 4), idea("y", 5), idea("z", 6)]
    const out = composeCardRegion(events, ideas)
    expect(CARD_REGION_CAP).toBe(5)
    expect(out).toHaveLength(5)
    expect(out[4]).toMatchObject({ kind: "idea", item: "y" })
  })

  it("returns empty for no input (the empty-state branch)", () => {
    expect(composeCardRegion([], [])).toEqual([])
  })

  it("composes from ideas alone when there are no confirmed events yet", () => {
    const out = composeCardRegion([], [idea("fri", 100), idea("sat", 200)])
    expect(out.map((e) => e.kind)).toEqual(["idea", "idea"])
    expect(out.map((e) => (e.kind === "idea" ? e.item : null))).toEqual(["fri", "sat"])
  })
})

describe("eventNeedLabel (the dense-face ladder, spec decision 6)", () => {
  it("no RSVP yet: needs your RSVP, viewer's move", () => {
    expect(eventNeedLabel(null)).toEqual({ text: "Needs your RSVP", needsViewer: true })
  })
  // Card-region-height slice (task 6): the open-proposal branch left with
  // the card's footer notice. A settled RSVP now always reads bare, with no
  // way left to ask this function about an open vote at all — the second
  // argument that used to carry it is gone from the signature. If that
  // branch ever came back, this is the assertion it would break.
  it("RSVP settled: bare, regardless of any open time-change vote", () => {
    expect(eventNeedLabel("IN")).toBeNull()
    expect(eventNeedLabel("OUT")).toBeNull()
  })
})

describe("ideaNeedLabel", () => {
  it("unvoted: needs your vote", () => {
    expect(ideaNeedLabel(null)).toEqual({ text: "Needs your vote", needsViewer: true })
  })
  it("viewer yes: needs other votes", () => {
    expect(ideaNeedLabel("IN")).toEqual({ text: "Needs other votes", needsViewer: false })
  })
  it("declined viewers see no card, so no label exists for them", () => {
    expect(ideaNeedLabel("OUT")).toBeNull()
    expect(ideaNeedLabel("NOT_THAT_DAY")).toBeNull()
  })
})
