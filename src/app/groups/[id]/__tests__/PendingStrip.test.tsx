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
// tallyLine deliberately distinct from GAUGE_ITEM's own ("Maya is in"), so a
// test asserting it renders after tapping Change can't accidentally pass
// against the still-open waiting row's own tally instead (finding 5).
const YES_ITEM: PendingGaugeItem = { ...GAUGE_ITEM, key: "g2", title: "friday beers",
  whenLine: "Fri 7pm", chips: { ...GAUGE_ITEM.chips, id: "g2", viewerAnswer: "IN", tallyLine: "Priya is in" } }

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
    // Dot-separated per the brief's literal example ("2 waiting on you ·
    // 1 you're in on") and pending-surface.css's
    // .pd-striptxt .seg:not(:last-child)::after rule.
    expect(screen.getByRole("button", { expanded: false }).textContent).toContain("·")
    cleanup()
    render(<PendingStrip pending={data({ standingYes: [] })} />)
    expect(screen.queryByText("you're in on")).toBeNull()
    // Single segment: no trailing (or leading) dot.
    expect(screen.getByRole("button", { expanded: false }).textContent).not.toContain("·")
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
    // Spec-gap fix: a waiting gauge row shows the live tally too. GaugeChips
    // itself renders no tally (in the feed it's MessageFeed that puts
    // GaugeTally inside Orbit's bubble), so the panel row must render it
    // separately. GAUGE_ITEM.chips.tallyLine is "Maya is in". The empty-line
    // case (PROPOSAL_ITEM's own tally is "", rendered by GroupProposalChips
    // internally) is already guaranteed to render nothing extra by
    // GaugeTally's/GroupProposalTally's own `if (!line) return null` guard,
    // unchanged by this fix, so it isn't re-asserted here.
    expect(screen.getByText("Maya is in")).toBeDefined()
  })

  it("standing-yes row steps down and reveals chips on Change", () => {
    render(<PendingStrip pending={data()} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("You're in on")).toBeDefined()
    expect(screen.getByText("friday beers")).toBeDefined()
    expect(screen.queryByText("✓ ✋ I'm in")).toBeNull()
    // Finding 5: the standing-yes row's own tally is not shown until Change
    // reveals its chips (mirrors the chips themselves being hidden until then).
    expect(screen.queryByText("Priya is in")).toBeNull()
    fireEvent.click(screen.getByText("Change"))
    // NOTE (task 6): the brief's regex /I'm in/ matches two elements once the
    // panel is open with this fixture (the still-waiting GAUGE_ITEM's own
    // unselected "I'm in" chip, plus the now-revealed selected chip on the
    // standing-yes row). getByText requires a single match, so the query is
    // narrowed to the selected chip's exact text, which is what "revealed and
    // flippable" actually means here; the assertion's intent is unchanged.
    expect(screen.getByText("✓ ✋ I'm in")).toBeDefined()
    // Finding 5: GaugeTally now renders alongside the revealed chips here too,
    // matching the waiting row (fix-round-2). Distinct text from GAUGE_ITEM's
    // own tally proves it's *this* row's tally, not the still-open one above.
    expect(screen.getByText("Priya is in")).toBeDefined()
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

  it("collapsing after the caught-up note, with a standing yes held, shows the yes count instead of lingering on the goodbye", async () => {
    // Finding 2: the spec's rule is "on collapse the strip is gone unless
    // yeses remain, in which case it carries just the yes count" — the
    // caught-up note is a one-time goodbye, not a label that should survive
    // a collapse/expand cycle when the viewer still holds a standing yes.
    render(<PendingStrip pending={data({ waiting: [GAUGE_ITEM] })} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByText("🙏 Next time"))
    await waitFor(() => expect(screen.getByText("All caught up")).toBeDefined())

    fireEvent.click(screen.getByRole("button", { expanded: true }))

    expect(screen.queryByText("All caught up")).toBeNull()
    expect(screen.getByText("you're in on")).toBeDefined()
  })
})
