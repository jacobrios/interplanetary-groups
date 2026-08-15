// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import EventCard from "../EventCard"
import type { ProposalBandData } from "@/lib/pending/derive"

vi.mock("@/app/actions/rsvp", () => ({ rsvpAction: vi.fn(async () => ({})) }))

afterEach(cleanup)

const EVENT = {
  id: "e1",
  title: "Friday beers",
  startsAt: new Date("2026-08-14T19:00:00-06:00"),
  endsAt: null,
  venues: [{ displayLabel: "Barcade", name: "Barcade Denver" }],
}

const BAND: ProposalBandData = {
  eventId: "e1",
  question: "Move Friday beers to 8pm?",
  notice: "Move to 8pm?",
  chips: {
    id: "p1",
    orbitMessageId: "m1",
    labels: { yes: "8pm works", keep: "Keep 7pm" },
    tallyLine: "Sam says yes",
    viewerAnswer: null,
  },
}

function renderCard(overrides: Partial<Parameters<typeof EventCard>[0]> = {}) {
  return render(
    <EventCard
      event={EVENT}
      groupId="g1"
      timeZone="America/Denver"
      inCount={3}
      outCount={1}
      pendingCount={5}
      viewerStatus={null}
      viewerHasSession
      {...overrides}
    />
  )
}

describe("EventCard need label and proposal notice", () => {
  it("unanswered, no proposal: NEEDS YOUR RSVP in teal", () => {
    renderCard()
    expect(screen.getByText("Needs your RSVP").style.color).toBe("var(--action)")
  })
  it("answered, no proposal: bare", () => {
    renderCard({ viewerStatus: "IN" })
    expect(screen.queryByText(/Needs/)).toBeNull()
  })
  it("the ladder: RSVP settled with an unanswered proposal asks for the vote", () => {
    renderCard({ viewerStatus: "IN", proposal: BAND })
    expect(screen.getByText("Needs your vote").style.color).toBe("var(--action)")
  })
  it("the ladder: both answered goes grey until others vote", () => {
    renderCard({ viewerStatus: "IN", proposal: { ...BAND, chips: { ...BAND.chips, viewerAnswer: "KEEP" } } })
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
  it("renders the notice line as a link to the event, with the objective question", () => {
    renderCard({ proposal: BAND })
    const line = screen.getByText("Move to 8pm?").closest("a") as HTMLAnchorElement
    expect(line.getAttribute("href")).toBe("/events/e1")
    expect(screen.getByText(/Time change proposed/)).toBeDefined()
  })
  it("never renders proposal chips on the card", () => {
    renderCard({ proposal: BAND })
    expect(screen.queryByRole("button", { name: "8pm works" })).toBeNull()
  })
  it("no notice renders when there is no open proposal", () => {
    renderCard()
    expect(screen.queryByText(/Time change proposed/)).toBeNull()
  })

  // Task 4 (card-region-height slice): the label moves off its own row onto
  // the counts row, mirroring IdeaCard's title row from task 3. jsdom lays
  // out nothing, so this asserts the structure and flex styles that produce
  // the wrap in a real browser, not the wrap itself at a given pixel width.
  // The visual wrap (a big group's counts pushing the label to its own line)
  // is browser evidence gathered separately (task 7's real-phone pass).
  it("puts the label on the same row as the counts, right-aligned and free to wrap", () => {
    renderCard()
    const counts = screen.getByText("3 In · 1 Out · 5 TBD")
    const label = screen.getByText("Needs your RSVP")
    const row = counts.parentElement as HTMLElement
    expect(row).toBe(label.parentElement!.parentElement)
    expect(row.style.display).toBe("flex")
    expect(row.style.flexWrap).toBe("wrap")
    // The counts text grows to fill the row (pushing the label flush right
    // on a shared line); the label's own wrapper never shrinks below its
    // text and carries the auto margin that pins it right if it lands alone
    // on a wrapped second line.
    expect(counts.style.flex).toBe("1 1 auto")
    const labelWrapper = label.parentElement as HTMLElement
    expect(labelWrapper.style.flexShrink).toBe("0")
    expect(labelWrapper.style.marginLeft).toBe("auto")
  })

  it("keeps the label inside the tappable link alongside the counts", () => {
    renderCard()
    const label = screen.getByText("Needs your RSVP")
    expect(label.closest("a")?.getAttribute("href")).toBe("/events/e1")
  })

  it("renders no label at all when the card needs nothing", () => {
    renderCard({ viewerStatus: "IN" })
    expect(screen.queryByText(/Needs/)).toBeNull()
    const counts = screen.getByText("3 In · 1 Out · 5 TBD")
    // The row structure survives even with nothing to show: the counts text
    // is still the sole child of the wrap row, still free to grow.
    const row = counts.parentElement as HTMLElement
    expect(row.style.flexWrap).toBe("wrap")
    expect(row.children).toHaveLength(1)
  })

  it("skips the label entirely for a viewer with no session", () => {
    renderCard({ viewerHasSession: false })
    expect(screen.queryByText(/Needs/)).toBeNull()
  })
})
