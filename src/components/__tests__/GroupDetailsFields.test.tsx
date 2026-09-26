// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import GroupDetailsFields from "../GroupDetailsFields"
import type { RhythmEdit } from "@/lib/groups/rhythm-edit"

const climbing: RhythmEdit = { activity: "climbing", daysOfWeek: [2, 4], timeLocal: "18:00", venueName: "The gym" }
const beers: RhythmEdit = { activity: "beers", daysOfWeek: [5], timeLocal: "20:00", venueName: null }

describe("GroupDetailsFields", () => {
  it("renders Group name with the given id and maxLength 50", () => {
    render(
      <GroupDetailsFields
        nameInputId="group-details-name"
        rhythmIdPrefix="rhythm"
        name="Tuesday Climbers"
        onNameChange={() => {}}
        rhythms={[climbing]}
        cadences={["weekly"]}
        onRhythmChange={() => {}}
        disabled={false}
      />
    )
    const name = screen.getByLabelText("Group name") as HTMLInputElement
    expect(name.id).toBe("group-details-name")
    expect(name.maxLength).toBe(50)
    expect(name.value).toBe("Tuesday Climbers")
  })

  it("renders one block per rhythm, the second carrying a hairline border-top", () => {
    render(
      <GroupDetailsFields
        nameInputId="group-details-name"
        rhythmIdPrefix="rhythm"
        name="Tuesday Climbers"
        onNameChange={() => {}}
        rhythms={[climbing, beers]}
        cadences={["weekly", "monthly"]}
        onRhythmChange={() => {}}
        disabled={false}
      />
    )
    const activities = screen.getAllByLabelText("Activity") as HTMLInputElement[]
    expect(activities.map((el) => el.value)).toEqual(["climbing", "beers"])
    const secondRow = activities[1].closest("div[style*='border-top']") as HTMLElement | null
    expect(secondRow).toBeTruthy()
    expect(secondRow!.style.borderTop).toBe("1.4px solid var(--hairline)")
  })

  it("a weekly and a monthly rhythm render one Time and two Place fields", () => {
    render(
      <GroupDetailsFields
        nameInputId="group-details-name"
        rhythmIdPrefix="rhythm"
        name="Tuesday Climbers"
        onNameChange={() => {}}
        rhythms={[climbing, beers]}
        cadences={["weekly", "monthly"]}
        onRhythmChange={() => {}}
        disabled={false}
      />
    )
    expect(screen.getAllByLabelText("Time")).toHaveLength(1)
    expect(screen.getAllByLabelText("Place")).toHaveLength(2)
  })

  it("typing in the second block's Place calls onRhythmChange(1, { ...rhythm, venueName })", () => {
    const onRhythmChange = vi.fn()
    render(
      <GroupDetailsFields
        nameInputId="group-details-name"
        rhythmIdPrefix="rhythm"
        name="Tuesday Climbers"
        onNameChange={() => {}}
        rhythms={[climbing, beers]}
        cadences={["weekly", "monthly"]}
        onRhythmChange={onRhythmChange}
        disabled={false}
      />
    )
    const places = screen.getAllByLabelText("Place") as HTMLInputElement[]
    fireEvent.change(places[1], { target: { value: "Rusty Anchor" } })
    expect(onRhythmChange).toHaveBeenCalledWith(1, { ...beers, venueName: "Rusty Anchor" })
  })

  it("typing in Group name calls onNameChange", () => {
    const onNameChange = vi.fn()
    render(
      <GroupDetailsFields
        nameInputId="group-details-name"
        rhythmIdPrefix="rhythm"
        name="Tuesday Climbers"
        onNameChange={onNameChange}
        rhythms={[climbing]}
        cadences={["weekly"]}
        onRhythmChange={() => {}}
        disabled={false}
      />
    )
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Wednesday Climbers" } })
    expect(onNameChange).toHaveBeenCalledWith("Wednesday Climbers")
  })
})
