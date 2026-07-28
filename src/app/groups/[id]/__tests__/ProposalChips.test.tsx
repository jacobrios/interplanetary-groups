// @vitest-environment jsdom
//
// The server action is mocked: under test is the component's own contract
// (two chips with the labels it is given, a checkmark on the optimistic
// choice, an error line when the action reports one), not the action.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import ProposalChips, { type FeedProposal } from "../ProposalChips"

const answerMock = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock("@/app/actions/proposal-answer", () => ({
  proposalAnswerAction: (...args: unknown[]) => answerMock(...args),
}))

afterEach(() => {
  cleanup()
  answerMock.mockClear()
})

const PROPOSAL: FeedProposal = {
  id: "prop1",
  orbitMessageId: "msg1",
  labels: { confirm: "Yes, move it", decline: "Leave it" },
}

describe("ProposalChips", () => {
  it("renders both chips with their labels", () => {
    render(<ProposalChips proposal={PROPOSAL} />)
    expect(screen.getByRole("button", { name: "Yes, move it" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Leave it" })).toBeDefined()
  })

  it("shows the error line when the action reports one", async () => {
    answerMock.mockResolvedValueOnce({
      errors: { general: "The plan already changed, take a look up top." },
    })
    render(<ProposalChips proposal={PROPOSAL} />)
    fireEvent.click(screen.getByRole("button", { name: "Yes, move it" }))
    await waitFor(() =>
      expect(screen.getByText("The plan already changed, take a look up top.")).toBeDefined()
    )
  })
})
