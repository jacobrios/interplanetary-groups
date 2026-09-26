// @vitest-environment jsdom
//
// Task 9 (group-details-editing slice): a founder on onboarding step 2 could
// fix the group name and each activity's spot, but not a day or time Orbit
// misread — the only route was going back a step and re-describing the
// group in different words. Each rhythm row now carries a quiet "Change day
// or time" link under its spot control; tapping it swaps the link for
// RhythmFields (no Place field, the spot box above already is it), seeded
// from that rhythm, and the row's own summary line updates live as the
// founder edits. A schedule the founder edits into something unschedulable
// blocks confirm and, while an editor is open, shows the reason in the
// card's existing error slot (the same slot createGroupAction's own errors
// use).
import { describe, it, expect } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import Step2Playback from "../Step2Playback"
import { DETAILS_UNSCHEDULABLE } from "@/lib/groups/details-edit"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

const baseRhythm: StoredRhythm = {
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly",
  daysOfWeek: [1, 3],
  timeLocal: "08:00",
  venueName: "The east wall",
}

// A small stateful harness: the real OnboardingWizard owns `rhythms` state
// and implements onRhythmChange by writing the edited days/time back onto
// the rhythm at that index (task-9-brief.md's own handleRhythmChange). This
// harness reproduces exactly that wiring so a chip tap's effect on the
// summary line and on canConfirm can be observed the way a founder would
// see it, without pulling in the whole wizard.
function Harness({ initial }: { initial: StoredRhythm[] }) {
  const [rhythms, setRhythms] = useState(initial)
  function handleRhythmChange(index: number, next: RhythmEdit) {
    setRhythms((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, activity: next.activity, daysOfWeek: next.daysOfWeek, timeLocal: next.timeLocal }
          : r
      )
    )
  }
  return (
    <Step2Playback
      founderName="Jacob"
      groupName="Tuesday Climbers"
      onGroupNameChange={() => {}}
      rhythms={rhythms}
      onVenueNameChange={() => {}}
      onRhythmChange={handleRhythmChange}
      timeZone="America/New_York"
      onConfirm={() => {}}
      onBack={() => {}}
      isCreating={false}
      error={null}
    />
  )
}

function renderHarness(initial: StoredRhythm[]) {
  render(<Harness initial={initial} />)
}

describe("Step2Playback — change day or time", () => {
  it("shows a Change day or time link under the spot control, and no RhythmFields yet", () => {
    renderHarness([baseRhythm])

    expect(screen.getByRole("button", { name: "Change day or time" })).toBeTruthy()
    expect(screen.queryByLabelText("Activity")).toBeNull()
  })

  it("replaces the link with a seeded block on tap, with no Place field", () => {
    renderHarness([baseRhythm])

    fireEvent.click(screen.getByRole("button", { name: "Change day or time" }))

    expect(screen.queryByRole("button", { name: "Change day or time" })).toBeNull()
    const activityInput = screen.getByLabelText("Activity") as HTMLInputElement
    expect(activityInput.value).toBe("climbing")
    const timeInput = screen.getByLabelText("Time") as HTMLInputElement
    expect(timeInput.value).toBe("08:00")
    expect(screen.getByRole("button", { name: "✓ Mon" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "✓ Wed" })).toBeTruthy()
    expect(screen.queryByLabelText("Place")).toBeNull()
  })

  it("stays open once opened, with no close control", () => {
    renderHarness([baseRhythm])
    fireEvent.click(screen.getByRole("button", { name: "Change day or time" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Mon" })) // toggle Mon off
    expect(screen.getByLabelText("Activity")).toBeTruthy()
  })

  it("updates the row's own summary line live as a day chip is toggled", () => {
    renderHarness([baseRhythm])
    expect(screen.getByText("Mon & Wed at 8am, every week")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Change day or time" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Mon" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Wed" }))

    expect(screen.queryByText("Mon & Wed at 8am, every week")).toBeNull()
  })

  it("keeps a separate editor per rhythm, each individually addressable", () => {
    const second: StoredRhythm = {
      activity: "beers",
      title: "Beers",
      cadence: "weekly",
      daysOfWeek: [5],
      timeLocal: "20:00",
      venueName: "Sam's place",
    }
    renderHarness([baseRhythm, second])

    fireEvent.click(screen.getAllByRole("button", { name: "Change day or time" })[0])

    // Only the first rhythm's link is gone; the second's is still there.
    expect(screen.getAllByRole("button", { name: "Change day or time" }).length).toBe(1)
  })

  it("blocks confirm and shows the unschedulable reason once every day is cleared, only while the editor is open", () => {
    renderHarness([baseRhythm])
    const confirmButton = () =>
      screen.getByRole("button", { name: /looks right, set up invites/i }) as HTMLButtonElement

    expect(confirmButton().disabled).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Change day or time" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Mon" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Wed" }))

    expect(confirmButton().disabled).toBe(true)
    expect(screen.getByText(DETAILS_UNSCHEDULABLE)).toBeTruthy()
  })
})
