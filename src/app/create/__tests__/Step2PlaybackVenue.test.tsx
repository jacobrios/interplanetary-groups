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
