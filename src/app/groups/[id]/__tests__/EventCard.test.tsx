// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import EventCard from "../EventCard"
import { EventStatus } from "@prisma/client"

vi.mock("@/app/actions/rsvp", () => ({ rsvpAction: vi.fn(async () => ({})) }))

afterEach(cleanup)

const EVENT = {
  id: "e1",
  title: "Friday beers",
  startsAt: new Date("2026-08-14T19:00:00-06:00"),
  endsAt: null,
  status: EventStatus.SCHEDULED,
  venues: [{ displayLabel: "Barcade", name: "Barcade Denver" }],
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

describe("EventCard need label", () => {
  it("unanswered: NEEDS YOUR RSVP in teal", () => {
    renderCard()
    expect(screen.getByText("Needs your RSVP").style.color).toBe("var(--action)")
  })
  it("answered: bare", () => {
    renderCard({ viewerStatus: "IN" })
    expect(screen.queryByText(/Needs/)).toBeNull()
  })

  // Card-region-height slice (task 6): the confirmed card's footer notice
  // for an open group time-change vote is gone. The vote itself is
  // untouched — it still runs in the group chat and on the event's own
  // detail screen (ProposalSection.test.tsx, the event detail page) — this
  // card just no longer advertises it. EventCard no longer even accepts a
  // proposal prop, so there is no state this card can be handed that would
  // make it render one; these two cases (settled and unsettled RSVP) are
  // the ones a stale notice would most plausibly have leaked into.
  it("renders no time-change notice, unanswered", () => {
    renderCard()
    expect(screen.queryByText(/Time change/)).toBeNull()
    expect(screen.queryByText(/^Move to /)).toBeNull()
  })
  it("renders no time-change notice, RSVP already answered", () => {
    renderCard({ viewerStatus: "IN" })
    expect(screen.queryByText(/Time change/)).toBeNull()
    expect(screen.queryByText(/^Move to /)).toBeNull()
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

// Cancel-one-occurrence slice (task 8): a called-off plan on the group home
// reads as off, with nothing left to answer and nothing to tally.
describe("EventCard, a called-off plan", () => {
  it("reads as called off, with no answer row and no counts", () => {
    render(
      <EventCard
        event={{
          id: "e1",
          title: "Tennis",
          startsAt: new Date("2099-06-14T18:00:00Z"),
          endsAt: null,
          status: EventStatus.CANCELLED,
          venues: [],
        }}
        groupId="g1"
        timeZone="UTC"
        inCount={4}
        outCount={1}
        pendingCount={3}
        viewerStatus={null}
        viewerHasSession
      />
    )

    expect(screen.getByText("Called off")).toBeDefined()
    // The answer row goes: there is nothing to be in or out for.
    expect(screen.queryByRole("button", { name: /I'm in/i })).toBeNull()
    // The counts go: a tally under a called-off game reads as attendance for
    // something that is not happening.
    expect(screen.queryByText(/4 In/)).toBeNull()
    expect(screen.queryByText(/Needs your RSVP/)).toBeNull()
  })

  it("is unchanged for a live plan", () => {
    render(
      <EventCard
        event={{
          id: "e1",
          title: "Tennis",
          startsAt: new Date("2099-06-14T18:00:00Z"),
          endsAt: null,
          status: EventStatus.SCHEDULED,
          venues: [],
        }}
        groupId="g1"
        timeZone="UTC"
        inCount={4}
        outCount={1}
        pendingCount={3}
        viewerStatus={null}
        viewerHasSession
      />
    )

    expect(screen.getByText(/4 In/)).toBeDefined()
    expect(screen.getByText("Needs your RSVP")).toBeDefined()
    expect(screen.queryByText("Called off")).toBeNull()
  })
})
