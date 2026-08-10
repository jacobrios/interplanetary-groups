// @vitest-environment jsdom
//
// Only the new callback contract: GaugeChips otherwise mirrors
// GroupProposalChips, which already carries the render/tally/error coverage.
// This file adds the one behavior specific to task 4 and nothing else.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import GaugeChips, { type FeedGauge } from "../GaugeChips"

const voteMock = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock("@/app/actions/gauge-vote", () => ({
  gaugeVoteAction: (...args: unknown[]) => voteMock(...args),
}))

afterEach(() => {
  cleanup()
  voteMock.mockClear()
})

const GAUGE: FeedGauge = {
  id: "g1",
  orbitMessageId: "m1",
  tallyLine: "Sam is in",
  labels: { in: "I'm in", out: "Can't make it", notThatDay: "Not that day" },
  viewerAnswer: null,
}

describe("GaugeChips", () => {
  it("reports IN upward after a successful vote", async () => {
    const onAnswered = vi.fn()
    render(<GaugeChips gauge={GAUGE} onAnswered={onAnswered} />)
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }))
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith("IN"))
  })

  it("reports OUT upward after a successful vote", async () => {
    const onAnswered = vi.fn()
    render(<GaugeChips gauge={GAUGE} onAnswered={onAnswered} />)
    fireEvent.click(screen.getByRole("button", { name: "Can't make it" }))
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith("OUT"))
  })
})
