// @vitest-environment jsdom
//
// The server action is mocked: under test is the component's own contract
// (two chips with the labels it is given, a checkmark on the optimistic /
// persisted choice, the tally line rendered below the chips, an error line
// when the action reports one), not the action.

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
  labels: { yes: "9am works", keep: "Keep 8am" },
  tallyLine: "Sam says yes",
  viewerAnswer: null,
}

describe("GroupProposalChips", () => {
  it("renders both chips from labels and the tally line", () => {
    render(<GroupProposalChips proposal={PROPOSAL} />)
    expect(screen.getByRole("button", { name: "9am works" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Keep 8am" })).toBeDefined()
    expect(screen.getByText("Sam says yes")).toBeDefined()
  })

  it("marks the viewer's own standing answer", () => {
    render(<GroupProposalChips proposal={{ ...PROPOSAL, viewerAnswer: "YES" }} />)
    expect(screen.getByRole("button", { name: "✓ 9am works" })).toBeDefined()
  })

  it("shows the error line when the action reports one", async () => {
    voteMock.mockResolvedValueOnce({
      errors: { general: "The plan already changed, take a look up top." },
    })
    render(<GroupProposalChips proposal={PROPOSAL} />)
    fireEvent.click(screen.getByRole("button", { name: "9am works" }))
    await waitFor(() =>
      expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
    )
  })

  it("renders no tally line when it is empty", () => {
    render(<GroupProposalChips proposal={{ ...PROPOSAL, tallyLine: "" }} />)
    expect(screen.queryByText("Sam says yes")).toBeNull()
  })
})
