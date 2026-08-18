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

  // The tally line was deleted in the 17 Aug event-copy pass. Nothing takes
  // its place, so this screen shows the question and the two answers only.
  it("shows no tally under the chips", () => {
    render(<ProposalSection band={BAND} />)
    expect(screen.queryByText(/so far/)).toBeNull()
    expect(screen.queryByText(/makes it happen/)).toBeNull()
    expect(screen.queryByText(/would keep it/)).toBeNull()
  })
  it("marks the viewer's standing vote", () => {
    render(<ProposalSection band={{ ...BAND, chips: { ...BAND.chips, viewerAnswer: "YES" } }} />)
    expect(screen.getByRole("button", { name: "✓ Move to 8pm" })).toBeDefined()
  })
})
