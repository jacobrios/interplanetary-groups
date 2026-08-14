// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import IdeaCard from "../IdeaCard"
import type { IdeaItem } from "@/lib/pending/derive"

vi.mock("@/app/actions/gauge-vote", () => ({
  gaugeVoteAction: vi.fn(async () => ({})),
}))

afterEach(cleanup)

const ITEM: IdeaItem = {
  key: "g1",
  title: "Beers",
  whenLine: "Fri 7pm",
  sortMs: 0,
  chips: {
    id: "g1",
    orbitMessageId: "m1",
    tallyLine: "Rowan is in so far",
    labels: { in: "🍻 I'm in", out: "🙏 Next time", notThatDay: "📅 Yes, can't Fri" },
    viewerAnswer: null,
  },
}

describe("IdeaCard", () => {
  it("titles the idea with a question mark: a maybe, not a plan", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Beers?")).toBeDefined()
  })
  it("shows the when-line with the fixed Place TBD segment", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Fri 7pm · Place TBD")).toBeDefined()
  })
  it("labels an unvoted card NEEDS YOUR VOTE in teal, and a voted one NEEDS OTHER VOTES in grey", () => {
    const { unmount } = render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Needs your vote").style.color).toBe("var(--action)")
    unmount()
    render(<IdeaCard item={{ ...ITEM, chips: { ...ITEM.chips, viewerAnswer: "IN" } }} />)
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })
  it("renders the shipped chips and the tally", () => {
    render(<IdeaCard item={ITEM} />)
    expect(screen.getByRole("button", { name: "🍻 I'm in" })).toBeDefined()
    expect(screen.getByRole("button", { name: "📅 Yes, can't Fri" })).toBeDefined()
    expect(screen.getByText("Rowan is in so far")).toBeDefined()
  })
  it("does not append a second question mark if the activity already ends with one", () => {
    render(<IdeaCard item={{ ...ITEM, title: "Beers?" }} />)
    expect(screen.getByText("Beers?")).toBeDefined()
    expect(screen.queryByText("Beers??")).toBeNull()
  })
  it("stretches: column shell with the ask block bottom-anchored (board 06)", () => {
    const { container } = render(<IdeaCard item={ITEM} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.height).toBe("100%")
    expect(root.style.flexDirection).toBe("column")
    const ask = container.querySelector("[data-ask]") as HTMLElement
    expect(ask.style.marginTop).toBe("auto")
  })
  it("sits on its own ground, not the chat's", () => {
    const { container } = render(<IdeaCard item={ITEM} />)
    const shell = container.firstElementChild as HTMLElement
    // The whole point of the slice: the idea card used to be var(--surface-base),
    // which is the exact value of the page and the chat feed behind it, so it
    // was a hairline outline on the chat's own floor.
    expect(shell.style.backgroundColor).toBe("var(--surface-low)")
  })

  // Task 3 (card-region-height slice): the label rides the title's row
  // instead of a row of its own. jsdom lays out nothing, so these tests
  // assert the structure and the flex styles that produce the wrap in a
  // real browser — they cannot and do not assert the wrap itself happening
  // at a given pixel width. The visual wrap (short title beside the label,
  // a long one dropping it below) is browser evidence gathered separately
  // (task 7's real-phone pass), not proven here.
  it("puts the label on the same row as the title, right-aligned and free to wrap", () => {
    const { container } = render(<IdeaCard item={ITEM} />)
    const title = screen.getByText("Beers?")
    const label = screen.getByText("Needs your vote")
    const row = title.parentElement as HTMLElement
    expect(row).toBe(label.parentElement!.parentElement)
    expect(row.style.display).toBe("flex")
    expect(row.style.flexWrap).toBe("wrap")
    // The title grows to fill the row (pushing the label flush right on a
    // shared line); the label's own wrapper never shrinks below its text
    // and carries the auto margin that pins it right if it lands alone on
    // a wrapped second line.
    expect(title.style.flex).toBe("1 1 auto")
    const labelWrapper = label.parentElement as HTMLElement
    expect(labelWrapper.style.flexShrink).toBe("0")
    expect(labelWrapper.style.marginLeft).toBe("auto")
  })

  it("still renders the label alongside a long title, on the same wrap-capable row", () => {
    const longItem: IdeaItem = {
      ...ITEM,
      title: "Morning climbing session",
    }
    render(<IdeaCard item={longItem} />)
    const title = screen.getByText("Morning climbing session?")
    const label = screen.getByText("Needs your vote")
    const row = title.parentElement as HTMLElement
    expect(row.style.flexWrap).toBe("wrap")
    expect(row.contains(label)).toBe(true)
  })

  it("keeps the teal-when-it-is-yours rule on both a short and a long title", () => {
    const { unmount } = render(<IdeaCard item={ITEM} />)
    expect(screen.getByText("Needs your vote").style.color).toBe("var(--action)")
    unmount()

    const longVoted: IdeaItem = {
      ...ITEM,
      title: "Morning climbing session",
      chips: { ...ITEM.chips, viewerAnswer: "IN" },
    }
    render(<IdeaCard item={longVoted} />)
    expect(screen.getByText("Needs other votes").style.color).toBe("var(--text-secondary)")
  })

  it("renders no label at all when the card needs nothing from anyone", () => {
    const settled: IdeaItem = {
      ...ITEM,
      chips: { ...ITEM.chips, viewerAnswer: "NOT_THAT_DAY" },
    }
    render(<IdeaCard item={settled} />)
    expect(screen.queryByText("Needs your vote")).toBeNull()
    expect(screen.queryByText("Needs other votes")).toBeNull()
  })
})
