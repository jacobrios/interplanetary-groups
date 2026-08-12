// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import OrbitNoteScreen from "../OrbitNoteScreen"

describe("OrbitNoteScreen", () => {
  it("renders the eyebrow, the labeled note, and the onward link", () => {
    render(
      <OrbitNoteScreen
        eyebrow="Invite only"
        note="Ask someone in the group for the link."
        linkHref="/create"
        linkLabel="Start your own group"
      />
    )
    expect(screen.getByText("Invite only")).toBeTruthy()
    expect(screen.getByText("A note from Orbit")).toBeTruthy()
    expect(screen.getByText("Ask someone in the group for the link.")).toBeTruthy()
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")
  })
})
