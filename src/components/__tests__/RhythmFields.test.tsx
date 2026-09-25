// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import RhythmFields from "../RhythmFields"

const base = { activity: "tennis", daysOfWeek: [6], timeLocal: "09:00", venueName: "Court 3" }

describe("RhythmFields", () => {
  it("toggles a day on, reporting sorted day numbers", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Mon/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: [1, 6] })
  })
  it("toggles a picked day off", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={{ ...base, daysOfWeek: [1, 6] }} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Sat/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: [1] })
  })
  it("turning the last day off reports null, which validation later refuses", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /Sat/ }))
    expect(onChange).toHaveBeenCalledWith({ ...base, daysOfWeek: null })
  })
  it("marks picked days for assistive tech and shows the tick", () => {
    render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    const sat = screen.getByRole("button", { name: /Sat/ })
    expect(sat.getAttribute("aria-pressed")).toBe("true")
    expect(sat.textContent).toBe("✓ Sat")
  })
  it("round-trips HH:mm through the native time input", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:30" } })
    expect(onChange).toHaveBeenCalledWith({ ...base, timeLocal: "20:30" })
  })
  it("an emptied time reports null", () => {
    const onChange = vi.fn()
    render(<RhythmFields idPrefix="r0" value={base} onChange={onChange} showPlace disabled={false} />)
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "" } })
    expect(onChange).toHaveBeenCalledWith({ ...base, timeLocal: null })
  })
  it("caps the place at VENUE_NAME_MAX and hides it on step 2", () => {
    const { rerender } = render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    expect(screen.getByLabelText("Place").getAttribute("maxLength")).toBe("80")
    rerender(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace={false} disabled={false} />)
    expect(screen.queryByLabelText("Place")).toBeNull()
  })
  it("the day chips are type=button so they never submit a surrounding form", () => {
    render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    expect(screen.getByRole("button", { name: /Sun/ }).getAttribute("type")).toBe("button")
  })

  // Owner's phone QA, PR #140: Time used to share a flex row with an empty
  // spacer column, halving its width; at the owner's larger device text the
  // value clipped to "07:00 A". Time now takes the full row.
  it("gives Time the full row width, with no leftover flex row or spacer column", () => {
    render(<RhythmFields idPrefix="r0" value={base} onChange={() => {}} showPlace disabled={false} />)
    const time = screen.getByLabelText("Time")
    expect(time.closest('div[style*="display: flex"]')).toBeNull()
  })
})
