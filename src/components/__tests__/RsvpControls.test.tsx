// @vitest-environment jsdom
//
// The action is mocked; under test is the ask-and-answer grammar itself,
// the correctness fix this slice exists for: nothing pre-selected, both
// options equal while open, the chosen answer and only the chosen answer
// filled after.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
import RsvpControls from "../RsvpControls"

const rsvpMock = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock("@/app/actions/rsvp", () => ({
  rsvpAction: (...args: unknown[]) => rsvpMock(...args),
}))

afterEach(() => {
  cleanup()
  rsvpMock.mockClear()
})

describe("RsvpControls", () => {
  it("unanswered: both options equal, teal borders, no fill, no checkmark", () => {
    render(<RsvpControls eventId="e1" currentStatus={null} compact />)
    const inBtn = screen.getByRole("button", { name: "I'm in" })
    const outBtn = screen.getByRole("button", { name: "Can't make it" })
    for (const btn of [inBtn, outBtn]) {
      expect(btn.style.border).toBe("1.5px solid var(--action)")
      expect(btn.style.backgroundColor).toBe("transparent")
    }
    expect(screen.queryByText(/✓/)).toBeNull()
  })

  it("answered IN: the yes fills teal with a checkmark, the no goes quiet", () => {
    render(<RsvpControls eventId="e1" currentStatus="IN" compact />)
    const pick = screen.getByRole("button", { name: "✓ I'm in" })
    const other = screen.getByRole("button", { name: "Can't make it" })
    expect(pick.style.backgroundColor).toBe("var(--action)")
    expect(pick.style.color).toBe("var(--action-ink)")
    expect(other.style.border).toBe("1.5px solid var(--hairline)")
  })

  it("answered OUT: the exact mirror, never red or green", () => {
    render(<RsvpControls eventId="e1" currentStatus="OUT" compact />)
    const pick = screen.getByRole("button", { name: "✓ Can't make it" })
    expect(pick.style.backgroundColor).toBe("var(--action)")
    expect(screen.getByRole("button", { name: "I'm in" }).style.backgroundColor).toBe("transparent")
  })

  it("submits the tapped answer with the ids the action needs", async () => {
    render(<RsvpControls eventId="e1" currentStatus={null} compact groupId="g1" />)
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }))
    await waitFor(() => expect(rsvpMock).toHaveBeenCalledTimes(1))
    const formData = rsvpMock.mock.calls[0][1] as FormData
    expect(formData.get("status")).toBe("IN")
    expect(formData.get("eventId")).toBe("e1")
    expect(formData.get("groupId")).toBe("g1")
  })

  it("disables both options while a write is in flight", async () => {
    let release: (v: {}) => void = () => {}
    rsvpMock.mockImplementationOnce(() => new Promise<{}>((r) => { release = r }))
    render(<RsvpControls eventId="e1" currentStatus={null} compact />)
    fireEvent.click(screen.getByRole("button", { name: "I'm in" }))
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "✓ I'm in" }) as HTMLButtonElement).disabled).toBe(true)
    )
    expect((screen.getByRole("button", { name: "Can't make it" }) as HTMLButtonElement).disabled).toBe(true)
    release({})
  })

  it("surfaces the action's error line", async () => {
    rsvpMock.mockResolvedValueOnce({ errors: { general: "That event already ended." } })
    render(<RsvpControls eventId="e1" currentStatus={null} compact />)
    fireEvent.click(screen.getByRole("button", { name: "Can't make it" }))
    await waitFor(() => expect(screen.getByText("That event already ended.")).toBeDefined())
  })
})
