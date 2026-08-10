// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// NOTE (task 6): mocks explicitly typed via vi.fn's generic (not the brief's
// bare `vi.fn(async () => ({}))`) so `tsc --noEmit` accepts the spread call
// below; behavior is identical, this only widens the inferred mock signature.
const gaugeVoteMock = vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({}))
vi.mock("@/app/actions/gauge-vote", () => ({
  gaugeVoteAction: (...a: unknown[]) => gaugeVoteMock(...a),
}))
const proposalVoteMock = vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({}))
vi.mock("@/app/actions/proposal-vote", () => ({
  proposalVoteAction: (...a: unknown[]) => proposalVoteMock(...a),
}))

import { PendingStrip } from "../PendingStrip"
import type { PendingData, PendingGaugeItem, PendingProposalItem } from "@/lib/pending/derive"

afterEach(() => { cleanup(); gaugeVoteMock.mockClear(); proposalVoteMock.mockClear() })

const GAUGE_ITEM: PendingGaugeItem = {
  kind: "gauge", key: "g1", kindLine: "New idea · from Maya",
  title: "bouldering at the new east side gym", whenLine: "Sat 10am", sortMs: 1,
  chips: { id: "g1", orbitMessageId: "om1", tallyLine: "Maya is in",
    labels: { in: "✋ I'm in", out: "🙏 Next time", notThatDay: "📅 Yes, can't Sat" },
    viewerAnswer: null },
}
const PROPOSAL_ITEM: PendingProposalItem = {
  kind: "proposal", key: "p1", kindLine: "Time change · from Sam",
  title: "Monday morning climb", nowLabel: "Mon 8am", newLabel: "Mon 9am", sortMs: 2,
  chips: { id: "p1", orbitMessageId: "om2", labels: { yes: "9am works", keep: "Keep 8am" },
    tallyLine: "", viewerAnswer: null },
}
const YES_ITEM: PendingGaugeItem = { ...GAUGE_ITEM, key: "g2", title: "friday beers",
  whenLine: "Fri 7pm", chips: { ...GAUGE_ITEM.chips, id: "g2", viewerAnswer: "IN" } }

function data(over: Partial<PendingData> = {}): PendingData {
  return { waiting: [GAUGE_ITEM, PROPOSAL_ITEM], standingYes: [YES_ITEM], ...over }
}

describe("PendingStrip", () => {
  it("renders nothing when nothing is pending", () => {
    const { container } = render(<PendingStrip pending={{ waiting: [], standingYes: [] }} />)
    expect(container.firstChild).toBeNull()
  })

  it("composes the count line, second segment only when yeses exist", () => {
    render(<PendingStrip pending={data()} />)
    expect(screen.getByText("waiting on you")).toBeDefined()
    expect(screen.getByText("you're in on")).toBeDefined()
    cleanup()
    render(<PendingStrip pending={data({ standingYes: [] })} />)
    expect(screen.queryByText("you're in on")).toBeNull()
  })

  it("panel is closed until the strip is tapped, then rows render with their chips", () => {
    render(<PendingStrip pending={data()} />)
    expect(screen.queryByText("New idea · from Maya")).toBeNull()
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("New idea · from Maya")).toBeDefined()
    expect(screen.getByText("bouldering at the new east side gym")).toBeDefined()
    expect(screen.getByText("✋ I'm in")).toBeDefined()
    expect(screen.getByText("Mon 8am")).toBeDefined()
    expect(screen.getByText("9am works")).toBeDefined()
  })

  it("standing-yes row steps down and reveals chips on Change", () => {
    render(<PendingStrip pending={data()} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("You're in on")).toBeDefined()
    expect(screen.getByText("friday beers")).toBeDefined()
    expect(screen.queryByText("✓ ✋ I'm in")).toBeNull()
    fireEvent.click(screen.getByText("Change"))
    // NOTE (task 6): the brief's regex /I'm in/ matches two elements once the
    // panel is open with this fixture (the still-waiting GAUGE_ITEM's own
    // unselected "I'm in" chip, plus the now-revealed selected chip on the
    // standing-yes row). getByText requires a single match, so the query is
    // narrowed to the selected chip's exact text, which is what "revealed and
    // flippable" actually means here; the assertion's intent is unchanged.
    expect(screen.getByText("✓ ✋ I'm in")).toBeDefined()
  })

  it("a decline on the last waiting row shows the caught-up note verbatim", async () => {
    render(<PendingStrip pending={data({ waiting: [GAUGE_ITEM] })} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByText("🙏 Next time"))
    await waitFor(() =>
      expect(screen.getByText(
        "Next time it is. That was the last thing waiting on you, so you're all set. I'll say something when the group floats a new idea."
      )).toBeDefined()
    )
    expect(screen.getByText("All caught up")).toBeDefined()
  })

  it("a yes on the last waiting row does not trigger the caught-up note", async () => {
    render(<PendingStrip pending={data({ waiting: [GAUGE_ITEM] })} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByText("✋ I'm in"))
    await waitFor(() => expect(gaugeVoteMock).toHaveBeenCalled())
    expect(screen.queryByText("All caught up")).toBeNull()
  })
})
