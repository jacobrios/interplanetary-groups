// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import EditEventDetails from "../EditEventDetails"

// fireEvent, not @testing-library/user-event, matching CancelControls.test.tsx:
// that package is not a dependency of this repo.
const editEventAction = vi.fn(async (..._args: unknown[]) => ({}))

vi.mock("@/app/actions/edit-event", () => ({
  editEventAction: (...args: unknown[]) => editEventAction(...args),
}))

afterEach(() => {
  cleanup()
  editEventAction.mockClear()
})

const baseProps = {
  eventId: "e1",
  title: "Climbing",
  place: "The climbing gym",
  dateLocal: "2099-06-05",
  timeLocal: "18:00",
  zoneLabel: "Eastern Time",
}

describe("EditEventDetails, at rest", () => {
  it("renders the children and an Edit control, no form", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    expect(screen.getByText("the static view")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit this plan" })).toBeTruthy()
    expect(screen.queryByLabelText("Title")).toBeNull()
    expect(editEventAction).not.toHaveBeenCalled()
  })
})

describe("EditEventDetails, editing", () => {
  it("shows four prefilled fields and the hint text with the zone label, replacing the children", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))

    expect(screen.queryByText("the static view")).toBeNull()

    const title = screen.getByLabelText("Title") as HTMLInputElement
    const place = screen.getByLabelText("Place") as HTMLInputElement
    const day = screen.getByLabelText("Day") as HTMLInputElement
    const time = screen.getByLabelText("Time") as HTMLInputElement

    expect(title.value).toBe("Climbing")
    expect(place.value).toBe("The climbing gym")
    expect(day.value).toBe("2099-06-05")
    expect(time.value).toBe("18:00")

    expect(
      screen.getByText("Changing the day or time asks the group first. Times in Eastern Time.")
    ).toBeTruthy()
  })

  it("restores the children on Never mind, having called nothing", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(screen.getByText("the static view")).toBeTruthy()
    expect(screen.queryByLabelText("Title")).toBeNull()
    expect(editEventAction).not.toHaveBeenCalled()
  })

  it("calls the action once with all five form fields on Save", async () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bouldering" } })
    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "New gym" } })
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2099-06-06" } })
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "19:30" } })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(editEventAction).toHaveBeenCalledTimes(1))
    const [, formData] = editEventAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("eventId")).toBe("e1")
    expect(formData.get("title")).toBe("Bouldering")
    expect(formData.get("place")).toBe("New gym")
    expect(formData.get("dateLocal")).toBe("2099-06-06")
    expect(formData.get("timeLocal")).toBe("19:30")
  })

  it("renders the error message and keeps the form open when the action errors", async () => {
    editEventAction.mockResolvedValueOnce({ errors: { general: "That plan is gone." } })
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(editEventAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("That plan is gone.")).toBeTruthy())
    expect(screen.getByLabelText("Title")).toBeTruthy()
  })

  it("closes the form and shows the static view again on a successful save", async () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(editEventAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("the static view")).toBeTruthy())
    expect(screen.queryByLabelText("Title")).toBeNull()
  })
})

describe("EditEventDetails, what the form was opened with", () => {
  it("sends the values it was opened with alongside the edited ones", async () => {
    const { rerender } = render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bouldering" } })

    // The page re-renders underneath an open form (a refresh landing): the
    // baseline is still what the member was looking at when they opened it.
    rerender(
      <EditEventDetails {...baseProps} title="Renamed elsewhere" timeLocal="19:00">
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(editEventAction).toHaveBeenCalledTimes(1))
    const [, formData] = editEventAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("title")).toBe("Bouldering")
    expect(formData.get("origTitle")).toBe("Climbing")
    expect(formData.get("origPlace")).toBe("The climbing gym")
    expect(formData.get("origDateLocal")).toBe("2099-06-05")
    expect(formData.get("origTimeLocal")).toBe("18:00")
  })
})

describe("EditEventDetails, focus", () => {
  it("moves focus to the Title field when the form opens", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    expect(document.activeElement).toBe(screen.getByLabelText("Title"))
  })

  it("returns focus to the Edit control after Never mind", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit this plan" }))
  })

  it("returns focus to the Edit control after a successful save", async () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("the static view")).toBeTruthy())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit this plan" }))
  })

  it("does not take focus on first render", () => {
    render(
      <EditEventDetails {...baseProps}>
        <p>the static view</p>
      </EditEventDetails>
    )
    expect(document.activeElement).toBe(document.body)
  })
})

