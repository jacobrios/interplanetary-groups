// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import EditEventDetails from "../EditEventDetails"

// fireEvent, not @testing-library/user-event, matching CancelControls.test.tsx:
// that package is not a dependency of this repo.
const editEventAction = vi.fn(async (..._args: unknown[]) => ({}))
const cancelEventAction = vi.fn(async (..._args: unknown[]) => ({}))

vi.mock("@/app/actions/edit-event", () => ({
  editEventAction: (...args: unknown[]) => editEventAction(...args),
}))
// CancelControls renders inside this component now (the Edit | Call off row).
vi.mock("@/app/actions/cancel-event", () => ({
  cancelEventAction: (...args: unknown[]) => cancelEventAction(...args),
  restoreEventAction: vi.fn(async () => ({})),
}))

afterEach(() => {
  cleanup()
  editEventAction.mockClear()
  cancelEventAction.mockClear()
})

const baseProps = {
  eventId: "e1",
  groupId: "g1",
  title: "Climbing",
  place: "The climbing gym",
  dateLocal: "2099-06-05",
  timeLocal: "18:00",
  rsvp: <button type="button">the rsvp pair</button>,
  calendar: <button type="button">the calendar pill</button>,
}

function renderIt(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <EditEventDetails {...baseProps} {...overrides}>
      <p>the static view</p>
    </EditEventDetails>
  )
}

const card = () => screen.getByText("the static view").closest("[data-details-card]")!
const openForm = () => fireEvent.click(screen.getByRole("button", { name: "Edit this plan" }))

describe("EditEventDetails, at rest", () => {
  it("renders the card with the static view and the RSVP band, and no form", () => {
    renderIt()
    expect(card()).toBeTruthy()
    expect(card().contains(screen.getByRole("button", { name: "the rsvp pair" }))).toBe(true)
    expect(screen.queryByLabelText("Title")).toBeNull()
    expect(editEventAction).not.toHaveBeenCalled()
  })

  // Owner's phone QA, 24 Sept 2026: Edit left the details card so the card
  // returns to production's height, and now shares one row with Call off.
  it("keeps Edit out of the card, below the calendar pill, in one equal-width row with Call off", () => {
    renderIt()
    const edit = screen.getByRole("button", { name: "Edit this plan" })
    const off = screen.getByRole("button", { name: "Call off" })
    const calendar = screen.getByRole("button", { name: "the calendar pill" })

    expect(card().contains(edit)).toBe(false)
    expect(card().contains(calendar)).toBe(false)
    expect(edit.textContent).toBe("Edit")

    // Document order: calendar, then Edit, then Call off.
    expect(calendar.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(edit.compareDocumentPosition(off) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(edit.parentElement).toBe(off.parentElement)
    for (const el of [edit, off]) {
      expect(el.style.flexGrow).toBe("1")
      expect(el.style.flexBasis).toBe("0px")
      expect(el.style.minWidth).toBe("0px")
      expect(el.style.borderRadius).toBe("24px")
      expect(el.getAttribute("style")).not.toContain("--action")
    }
  })

  it("lets the Call off confirm take the whole row, hiding Edit", () => {
    renderIt()
    fireEvent.click(screen.getByRole("button", { name: "Call off" }))
    expect(screen.queryByRole("button", { name: "Edit this plan" })).toBeNull()
    expect(screen.getByRole("button", { name: "Yes, call it off" })).toBeTruthy()
    expect(cancelEventAction).not.toHaveBeenCalled()
  })
})

describe("EditEventDetails, editing", () => {
  it("replaces the card body with four prefilled fields and the hint line", () => {
    renderIt()
    openForm()

    expect(screen.queryByText("the static view")).toBeNull()

    const title = screen.getByLabelText("Title") as HTMLInputElement
    const place = screen.getByLabelText("Place") as HTMLInputElement
    const day = screen.getByLabelText("Day") as HTMLInputElement
    const time = screen.getByLabelText("Time") as HTMLInputElement

    expect(title.value).toBe("Climbing")
    expect(place.value).toBe("The climbing gym")
    expect(day.value).toBe("2099-06-05")
    expect(time.value).toBe("18:00")

    expect(screen.getByText("Changing the day or time asks the group first.")).toBeTruthy()
    expect(screen.queryByText(/Times in/)).toBeNull()
  })

  it("turns the RSVP band into Never mind | Save, and hides the calendar and the Edit | Call off row", () => {
    renderIt()
    openForm()

    expect(screen.queryByRole("button", { name: "the rsvp pair" })).toBeNull()
    expect(screen.queryByRole("button", { name: "the calendar pill" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit this plan" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Call off" })).toBeNull()

    const never = screen.getByRole("button", { name: "Never mind" })
    const save = screen.getByRole("button", { name: "Save" })
    const band = never.parentElement!
    expect(band).toBe(save.parentElement)
    const cardEl = document.querySelector("[data-details-card]")!
    expect(cardEl.contains(band)).toBe(true)

    // Never mind first, Save second.
    expect(never.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Same geometry as the RSVP pair: equal width, 0.5rem radius, 1.5px border.
    for (const el of [never, save]) {
      expect(el.style.flexGrow).toBe("1")
      expect(el.style.flexBasis).toBe("0px")
      expect(el.style.minWidth).toBe("0px")
      expect(el.style.borderRadius).toBe("0.5rem")
    }
    expect(save.style.backgroundColor).toBe("var(--action)")
    expect(save.style.color).toBe("var(--action-ink)")
    expect(never.getAttribute("style")).not.toContain("--action")
  })

  it("lets the day and time columns shrink so native pickers cannot push past the card", () => {
    renderIt()
    openForm()
    for (const label of ["Day", "Time"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.style.width).toBe("100%")
      expect(input.style.minWidth).toBe("0px")
      expect(input.style.boxSizing).toBe("border-box")
      expect(input.style.fontSize).toBe("1rem")
      const column = input.parentElement!
      expect(column.style.minWidth).toBe("0px")
      expect(column.style.flexGrow).toBe("1")
      expect(column.style.flexBasis).toBe("0px")
    }
  })

  // Owner's phone QA, 24 Sept 2026: iOS Safari renders a native date/time
  // input at an intrinsic minimum width and ignores width/min-width, so the
  // Time box overflowed the card's right edge and butted into Day with no
  // gap (desktop Chromium honored the CSS, which is why this passed there).
  // -webkit-appearance / appearance: none strips that native chrome so the
  // width rules above actually apply on iOS.
  it("strips native iOS appearance from the day and time pickers so width/min-width take effect", () => {
    renderIt()
    openForm()
    for (const label of ["Day", "Time"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.style.getPropertyValue("-webkit-appearance")).toBe("none")
      expect(input.style.appearance).toBe("none")
      expect(input.className).toContain("edit-picker")
    }
  })

  it("restores the card on Never mind, having called nothing", () => {
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(screen.getByText("the static view")).toBeTruthy()
    expect(screen.getByRole("button", { name: "the rsvp pair" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "the calendar pill" })).toBeTruthy()
    expect(screen.queryByLabelText("Title")).toBeNull()
    expect(editEventAction).not.toHaveBeenCalled()
  })

  it("calls the action once with all five form fields on Save", async () => {
    renderIt()
    openForm()

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

  it("disables both band buttons while a save is in flight", async () => {
    let resolve: (v: object) => void = () => {}
    editEventAction.mockImplementationOnce(() => new Promise<object>((r) => (resolve = r)))
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    )
    const never = screen.getByRole("button", { name: "Never mind" }) as HTMLButtonElement
    expect(never.disabled).toBe(true)
    expect(never.style.opacity).toBe("0.65")
    resolve({})
    await waitFor(() => expect(screen.getByText("the static view")).toBeTruthy())
  })

  it("shows an error under the form and above the band, keeping the form open", async () => {
    editEventAction.mockResolvedValueOnce({ errors: { general: "That plan is gone." } })
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("That plan is gone.")).toBeTruthy())
    const error = screen.getByText("That plan is gone.")
    const hint = screen.getByText("Changing the day or time asks the group first.")
    const never = screen.getByRole("button", { name: "Never mind" })
    expect(hint.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(error.compareDocumentPosition(never) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText("Title")).toBeTruthy()
  })

  it("closes the form and shows the card again on a successful save", async () => {
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(editEventAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("the static view")).toBeTruthy())
    expect(screen.queryByLabelText("Title")).toBeNull()
  })
})

describe("EditEventDetails, what the form was opened with", () => {
  it("sends the values it was opened with alongside the edited ones", async () => {
    const { rerender } = renderIt()
    openForm()
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
  // Owner's phone QA, 24 Sept 2026: focusing the Title input on open raised
  // the iOS keyboard, and the first tap on the date picker dismissed it,
  // shifted the layout and closed the picker. Focus lands on a heading
  // instead, so a screen reader is inside the form and no keyboard opens.
  it("moves focus to the form's heading, not a text field, when the form opens", () => {
    renderIt()
    openForm()
    const heading = screen.getByRole("heading", { name: "Editing Climbing" })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement?.tagName).not.toBe("INPUT")
  })

  it("returns focus to the Edit pill after Never mind", () => {
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit this plan" }))
  })

  it("returns focus to the Edit pill after a successful save", async () => {
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("the static view")).toBeTruthy())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit this plan" }))
  })

  it("does not take focus on first render", () => {
    renderIt()
    expect(document.activeElement).toBe(document.body)
  })
})
