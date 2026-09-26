// @vitest-environment jsdom
//
// Onboarding step 2 as read-only playback (Task 9, onboarding-step2-cleanup
// slice, decision 5): everything Orbit understood is changed only through
// "Edit details", which opens group info's own editor in place with a
// "Never mind | Done" band. The real wizard handler is covered by
// OnboardingWizard.test.tsx; here a small Harness holds the state.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import Step2Playback from "../Step2Playback"

// jsdom has no native scrollIntoView (EditGroupDetails.test.tsx:16-19).
if (!("scrollIntoView" in HTMLElement.prototype)) {
  ;(HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {}
}

const climbing: StoredRhythm = {
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly",
  daysOfWeek: [2, 4],
  timeLocal: "19:00",
  venueName: "Movement Gowanus",
}

const beers: StoredRhythm = {
  activity: "beers",
  title: "Beers",
  cadence: "monthly",
  daysOfWeek: null,
  timeLocal: null,
  venueName: null,
}

const spy = vi.fn()

afterEach(() => {
  cleanup()
  spy.mockClear()
})

function Harness({
  initialRhythms = [climbing, beers],
  isCreating = false,
}: {
  initialRhythms?: StoredRhythm[]
  isCreating?: boolean
}) {
  const [groupName, setGroupName] = useState("Climbing Crew")
  const [rhythms, setRhythms] = useState<StoredRhythm[]>(initialRhythms)
  return (
    <Step2Playback
      founderName="Jacob"
      groupName={groupName}
      rhythms={rhythms}
      onDetailsChange={(name, next) => {
        spy(name, next)
        setGroupName(name)
        setRhythms(next)
      }}
      timeZone="America/New_York"
      onConfirm={() => {}}
      isCreating={isCreating}
      error={null}
    />
  )
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Edit details" }))
}

describe("Step2Playback, read-only with Edit details", () => {
  it("is read-only at rest", () => {
    render(<Harness />)
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
    expect(screen.getByText("Climbing Crew")).toBeTruthy()
    expect(screen.getByText("Tue & Thu at 7pm, every week · Movement Gowanus")).toBeTruthy()
    const beersRow = screen.getByText("Once a month, we'll pick a day later")
    expect(beersRow.textContent).not.toContain(" · ")
    expect(screen.getByText(/Times in/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Change day or time" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit my description" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Add where you meet/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy()
  })

  it("Edit details opens the editor in place", () => {
    render(<Harness />)
    openEditor()
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("Climbing Crew")
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    const done = screen.getByRole("button", { name: "Done" })
    expect(screen.queryByRole("button", { name: /looks right, set up invites/i })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull()
    expect(screen.queryByText(/Times in/)).toBeNull()
    expect(done.style.backgroundColor).toBe("var(--action)")
  })

  it("Done applies the edit", () => {
    render(<Harness />)
    openEditor()
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Tuesday Crew" } })
    const [climbingPlace] = screen.getAllByLabelText("Place")
    fireEvent.change(climbingPlace, { target: { value: " Brooklyn Boulders " } })
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("Tuesday Crew", [
      { ...climbing, venueName: "Brooklyn Boulders" },
      beers,
    ])
    expect(screen.getByText("Tuesday Crew")).toBeTruthy()
    expect(screen.getByText(/· Brooklyn Boulders/)).toBeTruthy()
  })

  it("Never mind discards the edit", () => {
    render(<Harness />)
    openEditor()
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Something Else" } })
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText("Climbing Crew")).toBeTruthy()
    openEditor()
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("Climbing Crew")
  })

  it("the main spot is required", () => {
    render(<Harness />)
    openEditor()
    const [climbingPlace] = screen.getAllByLabelText("Place")
    fireEvent.change(climbingPlace, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByText("Add where you meet for climbing.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })

  it("a non-weekly activity shows only its name and spot", () => {
    render(<Harness />)
    openEditor()
    expect(screen.getAllByLabelText("Time")).toHaveLength(1)
    expect(screen.getAllByLabelText("Place")).toHaveLength(2)
    expect(screen.getAllByRole("group", { name: "Days" })).toHaveLength(1)
  })

  it("disables the confirm band when what is on screen would not validate", () => {
    render(<Harness initialRhythms={[{ ...climbing, venueName: null }, beers]} />)
    const confirm = screen.getByRole("button", { name: /looks right, set up invites/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it("disables Edit details while creating", () => {
    render(<Harness isCreating />)
    const edit = screen.getByRole("button", { name: "Edit details" }) as HTMLButtonElement
    expect(edit.disabled).toBe(true)
  })

  it("returns focus to Edit details after Done or Never mind", () => {
    render(<Harness />)
    openEditor()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit details" }))
    openEditor()
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit details" }))
  })
})
