// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import AddToCalendarButton from "../AddToCalendarButton"

afterEach(cleanup)

describe("AddToCalendarButton", () => {
  it("is a real link to the event's calendar file, teal, exact label", () => {
    render(<AddToCalendarButton eventId="evt42" />)
    const link = screen.getByRole("link", { name: "Add to calendar" })
    expect(link.getAttribute("href")).toBe("/events/evt42/calendar.ics")
    expect((link as HTMLElement).style.backgroundColor).toBe("var(--color-teal)")
  })
})
