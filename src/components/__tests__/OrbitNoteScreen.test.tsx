// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import OrbitNoteScreen from "../OrbitNoteScreen"

describe("OrbitNoteScreen", () => {
  it("renders the labeled note and the onward link, with no outer eyebrow", () => {
    render(
      <OrbitNoteScreen
        note="Ask someone in the group for the link."
        linkHref="/create"
        linkLabel="Start your own group"
      />
    )
    expect(screen.getByText("A note from Orbit")).toBeTruthy()
    expect(screen.getByText("Ask someone in the group for the link.")).toBeTruthy()
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")

    // The outer eyebrow ("Invite only" / "Invite link") was deleted 21 Aug:
    // it restated the note's own opening clause. Only the note's own
    // internal label ("A note from Orbit") should render.
    expect(screen.queryByText("Invite only")).toBeNull()
    expect(screen.queryByText("Invite link")).toBeNull()
  })
})
