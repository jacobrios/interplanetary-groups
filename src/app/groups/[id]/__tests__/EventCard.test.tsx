// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
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

  // QA feedback round (spec §13): the label was missable on a real phone
  // because of POSITION, not size. It had inherited the need-label slot
  // down in the counts row; it now sits above the title, matching the
  // detail screen. A filled chip was also built and measured in the
  // browser (task-5 report): it cost 4.2px in the one case that can grow,
  // all cards on a group home called off, which breaks the owner's hard
  // constraint that this must not add a pixel to the card region's height.
  // His ruling in advance was that if the chip costs height there, the
  // chip goes and the reposition stays — so this asserts the bare label,
  // repositioned only, with no fill. The height claim itself is verified
  // separately in the browser, not by this jsdom test, which cannot lay
  // anything out.
  it("puts the label above the title, unfilled, off the counts row", () => {
    const { container } = render(
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

    const label = screen.getByText("Called off")
    const title = screen.getByText("Tennis")

    // Above the title: the label's position in the document precedes the
    // title's, so title "follows" label.
    expect(label.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // No fill: the chip was measured to cost height in the all-cancelled
    // case and was pulled per the owner's advance ruling, so the wrapper
    // above the title carries no background of its own.
    const wrapper = label.parentElement as HTMLElement
    expect(wrapper.style.backgroundColor).toBe("")

    // The counts row it left behind holds nothing else on a called-off
    // card, so it is dropped rather than left as an empty wrapper.
    expect(container.querySelector('[data-ask]')).toBeNull()
    const flexRows = Array.from(container.querySelectorAll("div")).filter(
      (el) => el.style.display === "flex" && el.style.flexWrap === "wrap"
    )
    expect(flexRows).toHaveLength(0)
  })

  it("keeps the whole-card overlay, which is the case that needed it most", () => {
    // The measured worst case: a called-off card drops both the counts row
    // and the RSVP pair, which left its bottom 43% inert with no link and no
    // button on it. Nothing about the overlay is conditional on status, and
    // this is the case that would hurt most if a future edit made it so.
    const { container } = render(
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
    const overlay = container.querySelector("[data-tap-overlay]") as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.closest("a")?.getAttribute("href")).toBe("/events/e1")
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

// Double-tap fix, 2 Sept 2026. Three separate causes made an event card take
// two taps on a phone; these guard the two of them that live in this file.
//
// STATED PLAINLY, because a guard that is read as more than it is becomes a
// liability: none of this proves a thumb lands. jsdom has no layout engine, so
// getBoundingClientRect returns zeros and there is no Playwright or headless
// browser anywhere in this repo. No test here can assert that a tap at a given
// point on the card navigates. What these cases hold is that the MECHANISM is
// still wired: the card is a positioning context, the link carries an overlay
// pinned to all four of its edges, and the RSVP buttons are raised above that
// overlay so it cannot swallow them. Same shape and same honesty as
// src/__tests__/testing-library-cleanup.test.tsx. The geometry itself was
// measured in a browser with document.elementFromPoint (task 6 report) and has
// to be re-measured by hand if anyone wants it again.
describe("EventCard, the whole card is the tap target", () => {
  it("makes the card root the positioning context the overlay resolves against", () => {
    const { container } = renderCard()
    const root = container.firstElementChild as HTMLElement
    expect(root.style.position).toBe("relative")
  })

  it("gives the link an overlay covering the card, as a child of the link", () => {
    const { container } = renderCard()
    const overlay = container.querySelector("[data-tap-overlay]") as HTMLElement
    expect(overlay).not.toBeNull()
    // A child of the anchor, never a sibling in the card's flex column. A
    // position:static sibling would add a flex row and grow the card, which
    // the owner's height budget forbids outright.
    expect(overlay.parentElement?.tagName).toBe("A")
    expect(overlay.parentElement?.getAttribute("href")).toBe("/events/e1")
    // Out of flow and pinned to all four edges, so it contributes no height.
    expect(overlay.style.position).toBe("absolute")
    expect(overlay.style.inset).toBe("0px")
  })

  it("raises the RSVP block above the overlay so its buttons still take taps", () => {
    const { container } = renderCard()
    const ask = container.querySelector("[data-ask]") as HTMLElement
    expect(ask).not.toBeNull()
    // Without both of these the stretched link paints over its own card's
    // buttons, which is a worse bug than the one it fixes.
    expect(ask.style.position).toBe("relative")
    expect(ask.style.zIndex).toBe("1")
  })

  it("carries the pressed-state class on the link itself", () => {
    const { container } = renderCard()
    const link = container.querySelector("a") as HTMLElement
    expect(link.className).toContain("tap-card")
  })
})

// The pressed state cannot be an inline style (:active is a pseudo-class), so
// it lives in globals.css beside .scrollbar-hidden and the ::placeholder rule,
// which are there for the same reason and say so in their own comments. This
// reads the stylesheet, the way no-email-address-on-screen.test.tsx reads repo
// files, and holds two things: that the rules exist at all, and that they stay
// colour-only. It cannot prove anything flashes on a real screen.
describe("the card's pressed state stays wired and stays free", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
  // Every declaration of a .tap-card rule, gathered from the selector to its
  // closing brace. Read out of the file rather than sliced to the end of it,
  // so the last case below cannot go green just because it found nothing to
  // look at: with the rules deleted this is empty, and the first assertion in
  // each case is what says so.
  const rules = [...css.matchAll(/^\.tap-card[^{]*\{[^}]*\}/gm)].map((m) => m[0])
  const block = rules.join("\n")

  it("lights the overlay while the link is held", () => {
    expect(css).toMatch(/\.tap-card:active\s+\.tap-card-veil\s*\{[^}]*background-color:/)
  })

  it("makes iOS's own tap highlight visible on a dark card", () => {
    // :active is unreliable on iOS Safari without a touch listener on the
    // element, and this product ships no such listener. The tap-highlight
    // colour is the half that fires there, so losing it would leave the fix
    // working everywhere except the device the bug was reported on.
    expect(block).toMatch(/-webkit-tap-highlight-color:/)
  })

  it("costs no height: colour only, no transform and no box metrics", () => {
    // The card region's height budget was won by a whole slice. A pressed
    // state built from box metrics would spend it, and one built from a
    // transform would fake movement the layout never agreed to.
    //
    // Two holes closed in review: `border-width` alone missed the `border`
    // shorthand, and `transform` alone missed the standalone `scale`,
    // `translate` and `rotate` properties, which do the same job under
    // different names. Word-bounded so `border` also catches `border-width`
    // and `border-radius`.
    expect(rules.length).toBeGreaterThan(0)
    expect(block).not.toMatch(
      /\bborder\b|\bpadding\b|\bmargin\b|\bwidth\b|\bheight\b|\bfont-size\b|\btransform\b|\bscale\b|\btranslate\b|\brotate\b|\binset\b/
    )
  })
})
