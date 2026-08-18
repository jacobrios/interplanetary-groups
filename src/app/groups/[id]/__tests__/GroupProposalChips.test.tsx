// @vitest-environment jsdom
//
// The server action is mocked: under test is the component's own contract
// (two chips with the labels it is given, a checkmark on the optimistic /
// persisted choice, an error line when the action reports one), not the
// action. The tally line left this component in the 17 Aug event-copy pass;
// the checkmark is now the only confirmation a vote landed.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import GroupProposalChips, { type FeedGroupProposal } from "../GroupProposalChips"

const voteMock = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock("@/app/actions/proposal-vote", () => ({
  proposalVoteAction: (...args: unknown[]) => voteMock(...args),
}))

afterEach(() => {
  cleanup()
  voteMock.mockClear()
})

const PROPOSAL: FeedGroupProposal = {
  id: "p1",
  orbitMessageId: "m1",
  labels: { yes: "Move to 9am", keep: "Keep 8am" },
  viewerAnswer: null,
}

describe("GroupProposalChips", () => {
  it("renders both chips from labels, and nothing under them", () => {
    const { container } = render(<GroupProposalChips proposal={PROPOSAL} />)
    expect(screen.getByRole("button", { name: "Move to 9am" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Keep 8am" })).toBeDefined()
    // No tally, and nothing in its place: a vote is confirmed by its own
    // checkmark, and a passed change is announced by Orbit in the feed.
    expect(container.textContent).toBe("Move to 9amKeep 8am")
  })

  it("marks the viewer's own standing answer", () => {
    render(<GroupProposalChips proposal={{ ...PROPOSAL, viewerAnswer: "YES" }} />)
    expect(screen.getByRole("button", { name: "✓ Move to 9am" })).toBeDefined()
  })

  it("shows the error line when the action reports one", async () => {
    voteMock.mockResolvedValueOnce({
      errors: { general: "The plan already changed, take a look up top." },
    })
    render(<GroupProposalChips proposal={PROPOSAL} />)
    fireEvent.click(screen.getByRole("button", { name: "Move to 9am" }))
    await waitFor(() =>
      expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
    )
  })

  it("reports the answer upward after a successful vote", async () => {
    const onAnswered = vi.fn()
    render(<GroupProposalChips proposal={PROPOSAL} onAnswered={onAnswered} />)
    fireEvent.click(screen.getByRole("button", { name: "Move to 9am" }))
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith("YES"))
  })

  it("does not report upward when the action returns an error", async () => {
    const onAnswered = vi.fn()
    voteMock.mockResolvedValueOnce({
      errors: { general: "The plan already changed, take a look up top." },
    })
    render(<GroupProposalChips proposal={PROPOSAL} onAnswered={onAnswered} />)
    fireEvent.click(screen.getByRole("button", { name: "Move to 9am" }))
    await waitFor(() =>
      expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
    )
    expect(onAnswered).not.toHaveBeenCalled()
  })
})
