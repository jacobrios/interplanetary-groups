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
  notice: "Move to 8pm?",
  chips: {
    id: "p1",
    orbitMessageId: "m1",
    labels: { yes: "8pm works", keep: "Keep 7pm" },
    tallyLine: "Maya & Rowan want 8pm so far · one more makes it happen",
    viewerAnswer: null,
  },
}

describe("ProposalSection", () => {
  it("renders the section label, the objective question, the shipped chips, and the tally", () => {
    render(<ProposalSection band={BAND} />)
    expect(screen.getByText("Time change")).toBeDefined()
    expect(screen.getByText("Move Friday beers to 8pm?")).toBeDefined()
    expect(screen.getByRole("button", { name: "8pm works" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Keep 7pm" })).toBeDefined()
    expect(screen.getByText("Maya & Rowan want 8pm so far · one more makes it happen")).toBeDefined()
  })
  it("marks the viewer's standing vote", () => {
    render(<ProposalSection band={{ ...BAND, chips: { ...BAND.chips, viewerAnswer: "YES" } }} />)
    expect(screen.getByRole("button", { name: "✓ 8pm works" })).toBeDefined()
  })
})
