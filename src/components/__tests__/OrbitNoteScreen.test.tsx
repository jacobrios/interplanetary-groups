// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import OrbitNoteScreen from "../OrbitNoteScreen"

describe("OrbitNoteScreen", () => {
  it("renders the labeled note and the onward link", () => {
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
  })

  it("renders exactly one eyebrow-styled label: the note's own internal one", () => {
    // The outer eyebrow ("Invite only" / "Invite link") that used to precede
    // this component's note box was deleted 21 Aug: it restated the note's
    // own opening clause. This component now has no `eyebrow` prop at all,
    // so a caller-string assertion (getByText("Invite only")) can never
    // catch a regression here, since this render never passes that prop in
    // the first place. What CAN come back is a second eyebrow-styled block,
    // whether hardcoded or reintroduced as an optional prop with a default,
    // so assert on the styling that makes something read as an eyebrow
    // (uppercase + letter-spacing) rather than on any one string.
    const { container } = render(
      <OrbitNoteScreen
        note="Ask someone in the group for the link."
        linkHref="/create"
        linkLabel="Start your own group"
      />
    )
    const eyebrowStyled = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.style.textTransform === "uppercase" && el.style.letterSpacing !== ""
    )
    expect(eyebrowStyled).toHaveLength(1)
    expect(eyebrowStyled[0].textContent).toBe("A note from Orbit")
  })
})
