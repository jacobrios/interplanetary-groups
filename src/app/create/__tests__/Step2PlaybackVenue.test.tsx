// @vitest-environment jsdom
//
// Venue-on-playback slice (2026-09-04): an empty venue used to render as a
// small underlined text link, easy to miss, whose revealed input was 14px
// and force-zoomed iOS Safari permanently (spec:
// docs/superpowers/specs/2026-09-04-venue-on-playback-design.md). This
// matters more than a skipped optional field because there is nowhere to
// add a venue after group creation, anywhere in the product. These tests
// cover the three things the spec calls out as tested-in-vitest: the empty
// state renders as a full-width button (not an input), tapping it reveals
// a focused input, and a captured venue renders the input directly at a
// zoom-safe font size without stealing focus on mount.
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import Step2Playback from "../Step2Playback"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

const baseRhythm: StoredRhythm = {
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly",
  daysOfWeek: [1, 3],
  timeLocal: "08:00",
  venueName: null,
}

function renderStep2(rhythms: StoredRhythm[]) {
  render(
    <Step2Playback
      founderName="Jacob"
      groupName="Tuesday Climbers"
      onGroupNameChange={() => {}}
      rhythms={rhythms}
      onVenueNameChange={() => {}}
      timeZone="America/New_York"
      onConfirm={() => {}}
      onBack={() => {}}
      isCreating={false}
      error={null}
    />
  )
}

describe("Step2Playback — empty venue control", () => {
  it("renders the empty venue prompt as a full-width button, not a text link or an input", () => {
    renderStep2([baseRhythm])

    const control = screen.getByRole("button", { name: /add where you meet for climbing/i })
    expect(control.tagName).toBe("BUTTON")
    // The old markup was an inline underlined <a>-style link with no
    // intrinsic width; this genuinely differs from that shape rather than
    // being true of both (mutation-checked below by reverting the width).
    expect(control.style.width).toBe("100%")
    // No input exists yet for this rhythm — the empty state must not be an
    // <input>, per the 22 July editing-vs-collecting decision this slice
    // only partially reverses.
    expect(screen.queryByLabelText(/where you usually meet for climbing/i)).toBeNull()
  })

  it("reveals a focused input at a zoom-safe 16px on tap, and it is not a truncated placeholder", () => {
    renderStep2([baseRhythm])

    const control = screen.getByRole("button", { name: /add where you meet for climbing/i })
    fireEvent.click(control)

    const input = screen.getByLabelText(/where you usually meet for climbing/i) as HTMLInputElement
    expect(input.tagName).toBe("INPUT")
    expect(document.activeElement).toBe(input)
    // 16px is the documented iOS Safari force-zoom threshold: anything
    // under it zooms the whole page in on focus and never zooms back out.
    expect(input.style.fontSize).toBe("16px")
    expect(input.placeholder).toBe("Where do you meet?")
  })

  it("renders a captured venue as the input directly, at 16px, without stealing focus on mount", () => {
    renderStep2([{ ...baseRhythm, venueName: "The east wall" }])

    const input = screen.getByLabelText(/where you usually meet for climbing/i) as HTMLInputElement
    expect(input.tagName).toBe("INPUT")
    expect(input.value).toBe("The east wall")
    expect(input.style.fontSize).toBe("16px")
    expect(document.activeElement).not.toBe(input)
  })

  it("keeps a separate button per rhythm, each individually addressable (two rhythms, both empty)", () => {
    renderStep2([
      baseRhythm,
      { ...baseRhythm, activity: "beers", title: "Beers", timeLocal: "20:00", daysOfWeek: [5] },
    ])

    expect(screen.getByRole("button", { name: /add where you meet for climbing/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /add where you meet for beers/i })).toBeTruthy()
  })
})

// Task 7 (4 Sept, amended): the box must span the whole card, matching the
// group-name field's width exactly, not the rhythm row's indented value
// column (offset by the label, e.g. "CLIMBING" at up to 60% of the card).
// jsdom has no layout engine, so this can't assert a pixel width; what it
// can prove is the DOM shape that produces it — the venue control must sit
// as a sibling of the row's label/value line (both direct children of the
// row's own padding/divider wrapper), at the same nesting depth as the
// group-name row's own wrapper, rather than nested inside the value
// column's flex div alongside the schedule text.
describe("Step2Playback — venue control spans the full card width", () => {
  it("does not nest the venue button inside the schedule value's own column", () => {
    renderStep2([baseRhythm])

    const scheduleValue = screen.getByText("Mon & Wed at 8am, every week")
    const venueButton = screen.getByRole("button", { name: /add where you meet for climbing/i })

    // Before the fix, the button was appended right after this paragraph
    // inside the same flex "value column" div, offset by the label — so
    // this would have been the same element.
    expect(venueButton.parentElement).not.toBe(scheduleValue.parentElement)
  })

  it("does not nest the venue button inside the schedule value's own column for a captured (revealed) venue's input either", () => {
    renderStep2([{ ...baseRhythm, venueName: "The east wall" }])

    const scheduleValue = screen.getByText("Mon & Wed at 8am, every week")
    const venueInput = screen.getByLabelText(/where you usually meet for climbing/i)

    expect(venueInput.parentElement).not.toBe(scheduleValue.parentElement)
  })

  it("sits at the same nesting depth as the group-name row, both direct children of the card's padded content", () => {
    renderStep2([baseRhythm])

    const groupNameInput = screen.getByLabelText("Group name")
    // PlaybackNameRow's own outer wrapper div (label stacked above input).
    const nameRowWrapper = groupNameInput.parentElement
    const venueButton = screen.getByRole("button", { name: /add where you meet for climbing/i })
    // PlaybackRow's outer padding/divider shell — the venue button's direct
    // parent now that it is passed through the `venue` slot rather than
    // nested in the value column.
    const rowShell = venueButton.parentElement

    expect(rowShell?.parentElement).toBe(nameRowWrapper?.parentElement)
  })
})

// Task 8: the primary rhythm's venue is required to confirm, the same way
// an empty group name already blocks it. Secondary rhythms stay optional.
describe("Step2Playback — the primary rhythm's venue is required to confirm", () => {
  const secondary: StoredRhythm = {
    activity: "beers",
    title: "Beers",
    cadence: "monthly",
    daysOfWeek: null,
    timeLocal: null,
    venueName: null,
  }

  function confirmButton(): HTMLButtonElement {
    return screen.getByRole("button", {
      name: /looks right, set up invites/i,
    }) as HTMLButtonElement
  }

  it("disables confirm when the primary rhythm has no venue, even with a valid group name", () => {
    renderStep2([baseRhythm])
    expect(confirmButton().disabled).toBe(true)
  })

  it("disables confirm when the primary rhythm's venue is whitespace only", () => {
    renderStep2([{ ...baseRhythm, venueName: "   " }])
    expect(confirmButton().disabled).toBe(true)
  })

  it("enables confirm once the primary rhythm has a venue, with a secondary rhythm left blank", () => {
    renderStep2([{ ...baseRhythm, venueName: "The east wall" }, secondary])
    expect(confirmButton().disabled).toBe(false)
  })
})
