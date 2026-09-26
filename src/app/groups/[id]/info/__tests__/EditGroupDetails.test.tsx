// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import EditGroupDetails from "../EditGroupDetails"
import type { StoredRhythm } from "@/lib/orbit/rhythm"

// Mocked exactly as EditEventDetails' test mocks its own action
// (implementer-common.md / task-8-brief.md).
const updateGroupDetailsAction = vi.fn(async (..._args: unknown[]) => ({}))

vi.mock("@/app/actions/update-group-details", () => ({
  updateGroupDetailsAction: (...args: unknown[]) => updateGroupDetailsAction(...args),
}))

// jsdom has no native scrollIntoView; give it a no-op so vi.spyOn has a real
// method to wrap (a spy needs the property to exist first).
if (!("scrollIntoView" in HTMLElement.prototype)) {
  ;(HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {}
}
let scrollIntoViewSpy: ReturnType<typeof vi.spyOn> | null = null

afterEach(() => {
  cleanup()
  updateGroupDetailsAction.mockClear()
  scrollIntoViewSpy?.mockRestore()
  scrollIntoViewSpy = null
})

const climbing: StoredRhythm = {
  activity: "climbing",
  title: "Climbing",
  cadence: "weekly",
  daysOfWeek: [2, 4],
  timeLocal: "18:00",
  venueName: "The climbing gym",
}

const beers: StoredRhythm = {
  activity: "beers",
  title: "Beers",
  cadence: "monthly",
  daysOfWeek: [5],
  timeLocal: "20:00",
  venueName: null,
}

const baseProps = {
  groupId: "g1",
  groupName: "Tuesday Climbers",
  rhythms: [climbing],
  nextPlan: null as { eventId: string; startsAt: string; question: string } | null,
}

function renderIt(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <EditGroupDetails {...baseProps} {...overrides}>
      <p>the static rows</p>
    </EditGroupDetails>
  )
}

const card = () => screen.getByText("the static rows").closest("[data-info-card]")!
const openForm = () => fireEvent.click(screen.getByRole("button", { name: "Edit group details" }))

describe("EditGroupDetails, at rest", () => {
  it("renders the children inside the info card, then the Edit group details link", () => {
    renderIt()
    expect(card()).toBeTruthy()
    const link = screen.getByRole("button", { name: "Edit group details" })
    expect(link.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(screen.queryByLabelText("Group name")).toBeNull()
    expect(updateGroupDetailsAction).not.toHaveBeenCalled()
  })

  it("styles the link like ResetInviteLink, 12px above the card", () => {
    renderIt()
    const link = screen.getByRole("button", { name: "Edit group details" }) as HTMLButtonElement
    expect(link.style.background).toBe("none")
    expect(link.style.padding).toBe("0px")
    expect(link.style.color).toBe("var(--text-secondary)")
    expect(link.style.textDecoration).toBe("underline")
    expect(link.style.alignSelf).toBe("flex-start")
    expect(link.style.marginTop).toBe("12px")
  })
})

describe("EditGroupDetails, opening the form", () => {
  it("replaces the card with the form: padding 0, group name, rhythm fields, and the Never mind | Save band", () => {
    renderIt()
    openForm()

    expect(screen.queryByText("the static rows")).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit group details" })).toBeNull()

    const cardEl = document.querySelector("[data-info-card]") as HTMLElement
    expect(cardEl.style.padding).toBe("0px")
    // "clip" rather than "hidden" (owner's phone QA, PR #140): "hidden" makes
    // this element its own scroll container, and the sticky band below can
    // never stick inside a scroll container it isn't the one scrolling.
    expect(cardEl.style.overflow).toBe("clip")

    const name = screen.getByLabelText("Group name") as HTMLInputElement
    expect(name.value).toBe("Tuesday Climbers")
    expect(name.maxLength).toBe(50)

    expect((screen.getByLabelText("Activity") as HTMLInputElement).value).toBe("climbing")
    expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe("18:00")
    expect((screen.getByLabelText("Place") as HTMLInputElement).value).toBe("The climbing gym")

    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
  })

  // Owner's phone QA, PR #140: the band (Never mind | Save, later the plan
  // question) must stay visible at the bottom of the screen however tall the
  // form grows. Checked on both bands below (this one and the asking one),
  // since they are two separate elements swapped in and out.
  it("keeps the Never mind | Save band pinned to the bottom of the screen while editing", () => {
    renderIt()
    openForm()
    // Save -> the flex row of two buttons -> the band itself.
    const band = (screen.getByRole("button", { name: "Save" }) as HTMLElement).parentElement
      ?.parentElement as HTMLElement
    expect(band.style.position).toBe("sticky")
    expect(band.style.bottom).toBe("0px")
    expect(band.style.zIndex).toBe("1")
    expect(band.style.backgroundColor).toBe("var(--surface-raised)")
  })

  it("moves focus to a visually hidden 'Editing group details' heading, not a text field, without scrolling the page via focus itself", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    renderIt()
    openForm()
    const heading = screen.getByRole("heading", { name: "Editing group details" })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement?.tagName).not.toBe("INPUT")
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    focusSpy.mockRestore()
  })

  // Owner's phone QA, PR #140: scrolling the card's END into view and then
  // focusing the heading meant the focus call scrolled the page back up (an
  // off-top element pulls back into view when focused), so the owner saw the
  // TOP of the form with Save below the fold. Scrolling the START into view
  // instead is what the phone-width mock approved.
  it("scrolls the card's START into view on open", () => {
    scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {})
    renderIt()
    openForm()
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "start" })
  })

  it("separates two rhythms with a hairline and puts a Place field on each", () => {
    renderIt({ rhythms: [climbing, beers] })
    openForm()

    const activities = screen.getAllByLabelText("Activity") as HTMLInputElement[]
    expect(activities.map((el) => el.value)).toEqual(["climbing", "beers"])
    const places = screen.getAllByLabelText("Place") as HTMLInputElement[]
    expect(places.map((el) => el.value)).toEqual(["The climbing gym", ""])

    // The second rhythm's own block carries the separator.
    const secondActivityRow = activities[1].closest("div[style*='border-top']") as HTMLElement | null
    expect(secondActivityRow).toBeTruthy()
  })
})

describe("EditGroupDetails, Never mind", () => {
  it("returns to rest and discards typing; the next open is re-seeded from props", () => {
    renderIt()
    openForm()
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Wednesday Climbers" } })
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(screen.getByText("the static rows")).toBeTruthy()
    expect(screen.queryByLabelText("Group name")).toBeNull()
    expect(updateGroupDetailsAction).not.toHaveBeenCalled()

    openForm()
    expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("Tuesday Climbers")
  })
})

describe("EditGroupDetails, Save validation", () => {
  it("shows a refusal above the band and calls no action when the primary rhythm loses its days", () => {
    renderIt()
    openForm()

    // Untoggle both days on the primary rhythm (climbing starts Tue & Thu,
    // so they render checked, "✓ Tue" / "✓ Thu", and clicking clears them).
    fireEvent.click(screen.getByRole("button", { name: "✓ Tue" }))
    fireEvent.click(screen.getByRole("button", { name: "✓ Thu" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      screen.getByText("I need at least one day and a time to keep your schedule going.")
    ).toBeTruthy()
    expect(updateGroupDetailsAction).not.toHaveBeenCalled()
    // Still on the form, not rest.
    expect(screen.getByLabelText("Group name")).toBeTruthy()
  })
})

describe("EditGroupDetails, Save with no next plan or no first-activity change", () => {
  it("submits with planChoice '' when nothing changed on the first activity", async () => {
    renderIt()
    openForm()
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Wednesday Climbers" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
    const [, formData] = updateGroupDetailsAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("groupId")).toBe("g1")
    expect(formData.get("planChoice")).toBe("")
    const payload = JSON.parse(formData.get("payload") as string)
    expect(payload.name).toBe("Wednesday Climbers")
    expect(payload.rhythms[0].activity).toBe("climbing")
  })

  it("submits with planChoice '' when the first activity changed but there is no next plan", async () => {
    renderIt({ nextPlan: null })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
    const [, formData] = updateGroupDetailsAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("planChoice")).toBe("")
  })

  it("closes the form and returns to rest on a successful save", async () => {
    renderIt()
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("the static rows")).toBeTruthy())
    expect(screen.queryByLabelText("Group name")).toBeNull()
  })
})

describe("EditGroupDetails, Save with a changed first activity and a next plan", () => {
  const nextPlan = {
    eventId: "e1",
    startsAt: "2026-10-03T18:00:00.000Z",
    question: "Your next plan is Sat, Oct 3. Update that one too, or leave it?",
  }

  it("asks the question instead of calling the action, over an equal-weight pair", () => {
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(updateGroupDetailsAction).not.toHaveBeenCalled()
    expect(screen.getByText(nextPlan.question)).toBeTruthy()
    // Fields stay.
    expect(screen.getByLabelText("Group name")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Never mind" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()

    const leave = screen.getByRole("button", { name: "Leave it" })
    const update = screen.getByRole("button", { name: "Update it too" })
    expect(leave.parentElement).toBe(update.parentElement)
    expect(leave.style.color).toBe("var(--text-primary)")
    expect(update.style.color).toBe("var(--text-primary)")
    expect(leave.style.flexGrow).toBe("1")
    expect(update.style.flexGrow).toBe("1")
  })

  // Teal question, no separate label (owner's call, PR #140): weight and
  // color alone say this needs an answer.
  it("shows the plan question in teal with weight 600, centered, meta size", () => {
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const question = screen.getByText(nextPlan.question)
    expect(question.style.color).toBe("var(--action)")
    expect(question.style.fontWeight).toBe("600")
    expect(question.style.textAlign).toBe("center")
    expect(question.style.fontSize).toBe("var(--type-meta)")
  })

  it("keeps the question's Leave it | Update it too band pinned to the bottom of the screen too", () => {
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Leave it -> the pair row -> the band itself.
    const band = (screen.getByRole("button", { name: "Leave it" }) as HTMLElement).parentElement
      ?.parentElement as HTMLElement
    expect(band.style.position).toBe("sticky")
    expect(band.style.bottom).toBe("0px")
    expect(band.style.zIndex).toBe("1")
    expect(band.style.backgroundColor).toBe("var(--surface-raised)")
  })

  // Owner's phone QA, PR #140: entering the question no longer re-scrolls
  // (the pinned band already keeps the answers visible); it still moves
  // focus onto the first answer, now with preventScroll so the focus call
  // cannot itself scroll the page.
  it("focuses Leave it with preventScroll when entering the question, without a second scroll", () => {
    scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {})
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    renderIt({ nextPlan })
    openForm()
    // Clear the open-time calls so this only asserts the asking-transition ones.
    scrollIntoViewSpy.mockClear()
    focusSpy.mockClear()

    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
    const leave = screen.getByRole("button", { name: "Leave it" })
    expect(document.activeElement).toBe(leave)
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    focusSpy.mockRestore()
  })

  it("submits planChoice 'leave' on Leave it, carrying the plan's eventId and startsAt", async () => {
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Leave it" }))

    await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
    const [, formData] = updateGroupDetailsAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("planChoice")).toBe("leave")
    expect(formData.get("planEventId")).toBe("e1")
    expect(formData.get("planStartsAt")).toBe(nextPlan.startsAt)
  })

  it("submits planChoice 'update' on Update it too", async () => {
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Update it too" }))

    await waitFor(() => expect(updateGroupDetailsAction).toHaveBeenCalledTimes(1))
    const [, formData] = updateGroupDetailsAction.mock.calls[0] as [unknown, FormData]
    expect(formData.get("planChoice")).toBe("update")
  })

  it("returns to the form (not the question) with the message shown, on a server error", async () => {
    updateGroupDetailsAction.mockResolvedValueOnce({ errors: { general: "Someone just changed the next plan. Take another look." } })
    renderIt({ nextPlan })
    openForm()
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "bouldering" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Update it too" }))

    await waitFor(() =>
      expect(screen.getByText("Someone just changed the next plan. Take another look.")).toBeTruthy()
    )
    // Back on the form band, not the question.
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(screen.queryByText(nextPlan.question)).toBeNull()
  })
})

describe("EditGroupDetails, pending state", () => {
  it("disables the band buttons and dims them to 0.65 opacity while a save is in flight", async () => {
    let resolve: (v: object) => void = () => {}
    updateGroupDetailsAction.mockImplementationOnce(() => new Promise<object>((r) => (resolve = r)))
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
    await waitFor(() => expect(screen.getByText("the static rows")).toBeTruthy())
  })
})
