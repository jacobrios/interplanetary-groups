// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import ProposalSection from "../ProposalSection"
import type { ProposalBandData } from "@/lib/pending/derive"

vi.mock("@/app/actions/proposal-vote", () => ({ proposalVoteAction: vi.fn(async () => ({})) }))

afterEach(cleanup)

const BAND: ProposalBandData = {
  eventId: "e1",
  question: "Move Friday beers to 8pm?",
  chips: {
    id: "p1",
    orbitMessageId: "m1",
    labels: { yes: "Move to 8pm", keep: "Keep 7pm" },
    viewerAnswer: null,
  },
}

describe("ProposalSection", () => {
  it("renders the section label, the objective question, and the shipped chips", () => {
    render(<ProposalSection band={BAND} />)
    expect(screen.getByText("Time change")).toBeDefined()
    expect(screen.getByText("Move Friday beers to 8pm?")).toBeDefined()
    expect(screen.getByRole("button", { name: "Move to 8pm" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Keep 7pm" })).toBeDefined()
  })

  // The tally line was deleted in the 17 Aug event-copy pass, and nothing
  // takes its place. Pinned as the section's whole rendered text rather than
  // as three absent strings: the fixture no longer carries a tallyLine field
  // at all, so an absence assertion could not fail whatever the component
  // did, while this one fails the moment anything is added under the chips.
  it("renders the label, question and chips, and nothing else", () => {
    const { container } = render(<ProposalSection band={BAND} />)
    expect(container.textContent).toBe(
      "Time changeMove Friday beers to 8pm?Move to 8pmKeep 7pm"
    )
  })
  it("marks the viewer's standing vote", () => {
    render(<ProposalSection band={{ ...BAND, chips: { ...BAND.chips, viewerAnswer: "YES" } }} />)
    expect(screen.getByRole("button", { name: "✓ Move to 8pm" })).toBeDefined()
  })
})
