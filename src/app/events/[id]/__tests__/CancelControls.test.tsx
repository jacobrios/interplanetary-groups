// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react"
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
    expect(screen.getByRole("button", { name: "Call this off" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Yes, call it off" })).toBeNull()
    expect(cancelEventAction).not.toHaveBeenCalled()
  })

  it("does not cancel on the first tap", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Yes, call it off" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy()
    expect(screen.getByText(/This tells the group/)).toBeTruthy()
  })

  it("cancels on the second tap", async () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, call it off" }))

    await waitFor(() => expect(cancelEventAction).toHaveBeenCalledTimes(1))
  })

  it("returns to rest on Never mind, having called nothing", () => {
    render(<CancelControls eventId="e1" groupId="g1" isCancelled={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Call this off" }))
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }))

    expect(cancelEventAction).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Call this off" })).toBeTruthy()
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
