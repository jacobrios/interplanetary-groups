// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import CancelControls from "../CancelControls"

// fireEvent, not @testing-library/user-event: that package is NOT a
// dependency of this repo, and every existing component test here drives
// clicks with fireEvent. Do not add the dependency for this one file.
const cancelEventAction = vi.fn(async (..._args: unknown[]) => ({}))
const restoreEventAction = vi.fn(async (..._args: unknown[]) => ({}))

vi.mock("@/app/actions/cancel-event", () => ({
  cancelEventAction: (...args: unknown[]) => cancelEventAction(...args),
  restoreEventAction: (...args: unknown[]) => restoreEventAction(...args),
}))

afterEach(() => {
  cleanup()
  cancelEventAction.mockClear()
  restoreEventAction.mockClear()
})

describe("CancelControls, live plan", () => {
  it("shows one quiet control at rest and calls nothing", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    expect(screen.getByRole("button", { name: "Call off" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Yes, call it off" })).toBeNull()
    expect(cancelEventAction).not.toHaveBeenCalled()
  })

  it("does not cancel on the first tap", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Yes, call it off" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    expect(screen.getByText(/This tells the group/)).toBeTruthy()
  })

  it("cancels on the second tap", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, call it off" }))

    await waitFor(() => expect(cancelEventAction).toHaveBeenCalledTimes(1))
  })

  it("returns to rest on Never mind, having called nothing", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Call off" })).toBeTruthy()
  })

  // Owner's phone QA, 3 Sept 2026: the cancel consequence shouts the state
  // word, matching Orbit's own announcements. The restore consequence is
  // deliberately untouched, so it is pinned here too, as the negative case.
  it("shouts OFF in the cancel consequence line, and leaves the restore one alone", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    expect(
      screen.getByText("This tells the group the plan is OFF. Anyone can undo it.")
    ).toBeTruthy()

    cleanup()
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    fireEvent.click(screen.getByRole("button", { name: "Put this back on" }))
    expect(
      screen.getByText(
        "This tells the group the plan is back on, with everyone's RSVPs as they were."
      )
    ).toBeTruthy()
  })
})

describe("CancelControls, cancelled plan", () => {
  it("offers the restore, also behind two taps", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    fireEvent.click(screen.getByRole("button", { name: "Put this back on" }))
    expect(restoreEventAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes, put it back" }))
    await waitFor(() => expect(restoreEventAction).toHaveBeenCalledTimes(1))
  })
})

// ── Shape, after the 2 Sept 2026 QA feedback round (spec §13) ──────────────
// These pin the decisions the owner settled after his phone pass, not a
// stylist's preference: the control is a full-width pill outside the details
// card rather than a small button inside it, restore is the only teal, and
// the safe confirm control is the brighter of the two.
describe("CancelControls, shape", () => {
  it("rests as a full-width pill in both states", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    const off = screen.getByRole("button", { name: "Call off" })
    expect(off.style.width).toBe("100%")
    expect(off.style.borderRadius).toBe("24px")
    expect(off.style.minHeight).toBe("44px")

    cleanup()
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    const back = screen.getByRole("button", { name: "Put this back on" })
    expect(back.style.width).toBe("100%")
    expect(back.style.borderRadius).toBe("24px")
    expect(back.style.minHeight).toBe("44px")
  })

  it("puts teal on the restore and never on the cancel", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    const back = screen.getByRole("button", { name: "Put this back on" })
    expect(back.style.backgroundColor).toBe("var(--action)")
    expect(back.style.color).toBe("var(--action-ink)")

    cleanup()
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    const off = screen.getByRole("button", { name: "Call off" })
    expect(off.getAttribute("style")).not.toContain("--action")
  })

  // Owner's phone QA, 3 Sept 2026: the brightness asymmetry from the 2 Sept
  // round is reversed. Both confirm controls now carry the same ink weight,
  // per the product's own "an open question does not lean" rule; the
  // safe-first position is still what protects against an accidental tap.
  it("gives both confirm controls equal weight, and neither teal", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))

    const safe = screen.getByRole("button", { name: "Never mind" })
    const destructive = screen.getByRole("button", { name: "Yes, call it off" })
    expect(safe.style.color).toBe("var(--text-primary)")
    expect(destructive.style.color).toBe("var(--text-primary)")
    for (const el of [safe, destructive]) {
      expect(el.getAttribute("style")).not.toContain("--action")
    }
  })

  it("gives the two confirm controls the resting pill's full width between them", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))

    const safe = screen.getByRole("button", { name: "Never mind" })
    const destructive = screen.getByRole("button", { name: "Yes, call it off" })
    const row = safe.parentElement!
    expect(row).toBe(destructive.parentElement)
    expect(row.style.display).toBe("flex")
    for (const el of [safe, destructive]) {
      expect(el.style.flexGrow).toBe("1")
      expect(el.style.flexBasis).toBe("0px")
      expect(el.style.borderRadius).toBe("24px")
    }
  })
})

// ── The Edit | Call off row (owner's phone QA, 24 Sept 2026) ──────────────
// "Edit" left the details card and now shares a row with "Call off": two
// equal-width outlined pills, neither teal. CancelControls owns the row
// because its confirm step has to take the whole row over, Edit included.
describe("CancelControls, sharing its row with a leading control", () => {
  const edit = <button type="button">Edit</button>

  it("puts the leading control and Call off side by side, equal width", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} leading={edit} />)
    const editBtn = screen.getByRole("button", { name: "Edit" })
    const off = screen.getByRole("button", { name: "Call off" })
    const row = off.parentElement!
    expect(row).toBe(editBtn.parentElement)
    expect(row.style.display).toBe("flex")
    expect(row.style.gap).toBe("0.625rem")
    expect(off.style.flexGrow).toBe("1")
    expect(off.style.flexBasis).toBe("0px")
    expect(off.style.minWidth).toBe("0px")
    expect(off.style.borderRadius).toBe("24px")
    expect(off.getAttribute("style")).not.toContain("--action")
  })

  it("hides the leading control while the confirm row is open, and brings it back", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} leading={edit} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
    expect(screen.getByRole("button", { name: "Yes, call it off" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy()
  })

  it("stays a full-width pill when there is no leading control", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    const off = screen.getByRole("button", { name: "Call off" })
    expect(off.style.width).toBe("100%")
    expect(off.style.flexGrow).toBe("")
  })
})

// ── The bug found driving the real app: confirming survived a success ──────
// The component instance is not remounted between renders, only its props
// change (isCancelled flips after the server action revalidates), so any
// local state the component fails to reset on success survives into the
// re-render for the OPPOSITE action. Before the fix, `confirming` was reset
// to false only on the error branch, so a successful cancel or restore left
// the confirm row open, now describing the action that was just undone.
describe("CancelControls, confirm row closes after a successful action", () => {
  it("closes the confirm row and shows the resting control again after a successful cancel", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, call it off" }))

    await waitFor(() => expect(cancelEventAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Yes, call it off" })).toBeNull())
    expect(screen.queryByRole("button", { name: "Never mind" })).toBeNull()
    expect(screen.queryByText(/This tells the group the plan is OFF/)).toBeNull()
    expect(screen.getByRole("button", { name: "Call off" })).toBeTruthy()
  })

  it("closes the confirm row and shows the resting control again after a successful restore", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled />)
    fireEvent.click(screen.getByRole("button", { name: "Put this back on" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, put it back" }))

    await waitFor(() => expect(restoreEventAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Yes, put it back" })).toBeNull())
    expect(screen.queryByRole("button", { name: "Never mind" })).toBeNull()
    expect(screen.queryByText(/This tells the group the plan is back on/)).toBeNull()
    expect(screen.getByRole("button", { name: "Put this back on" })).toBeTruthy()
  })
})

// The event page is a server component that reads the database, so this suite
// cannot render it and cannot assert the placement from the DOM. This reads
// the source instead, which is an honest but weaker instrument: it proves the
// control is not written inside the details card's JSX, not that it renders
// outside it. It is worth having because "inside the card's footer band" is
// the exact mistake the owner's three complaints all came from, and nothing
// else in this repo would notice it coming back.
describe("event page places the control outside the details card", () => {
  const source = readFileSync(join(process.cwd(), "src/app/events/[id]/page.tsx"), "utf8")

  it("has the details card, then the calendar button, then the cancel control", () => {
    const cardStart = source.indexOf("── Event details card ──")
    const calendar = source.indexOf("── Add to calendar ──")
    const control = source.indexOf("<CancelControls")
    expect(cardStart).toBeGreaterThan(-1)
    expect(calendar).toBeGreaterThan(-1)
    expect(control).toBeGreaterThan(-1)
    expect(control).toBeGreaterThan(calendar)
  })

  // Owner's phone QA, 24 Sept 2026: an editable plan's card, calendar pill
  // and Edit | Call off row are drawn by EditEventDetails (which renders
  // CancelControls itself, outside the card; its own suite renders that and
  // checks it from the DOM). The page hands it the RSVP pair and the
  // calendar pill as slots, and never nests a cancel control in either.
  it("hands an editable plan's card to EditEventDetails, with the RSVP pair and calendar as slots", () => {
    const start = source.indexOf("<EditEventDetails")
    const end = source.indexOf("</EditEventDetails>")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = source.slice(start, end)
    expect(block).toContain("rsvp={")
    expect(block).toContain("<RsvpControls")
    expect(block).toContain("calendar={<AddToCalendarButton")
    expect(block).not.toContain("<CancelControls")
    expect(block).not.toContain("zoneLabel")
  })

  it("writes no cancel control inside the details card's own block", () => {
    const cardStart = source.indexOf("── Event details card ──")
    const calendar = source.indexOf("── Add to calendar ──")
    const card = source.slice(cardStart, calendar)
    expect(card).toContain("<RsvpControls")
    expect(card).not.toContain("<CancelControls")
  })
})

// Same instrument as above, same reason: the detail screen's called-off
// label cannot be rendered by this suite. This pins that it goes through
// CancelledLabel (bright --text-primary) rather than plain NeedLabel
// (grey), matching the group home card's treatment (owner's phone QA,
// 3 Sept 2026).
describe("event page renders the called-off label bright, not through NeedLabel's grey", () => {
  const source = readFileSync(join(process.cwd(), "src/app/events/[id]/page.tsx"), "utf8")

  it("imports and renders CancelledLabel for the status, and never renders plain NeedLabel", () => {
    expect(source).toContain('import { CancelledLabel } from "@/components/NeedLabel"')
    expect(source).toContain("<CancelledLabel value={eventCardLabel(true, null)} />")
    expect(source).not.toContain("<NeedLabel")
  })
})
