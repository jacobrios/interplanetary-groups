// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import MembersOnlyWall from "../MembersOnlyWall"

// Testing Library only auto-cleans between tests when Vitest globals are on,
// and this project's config does not enable them (see BackLink.test.tsx).
// Without this, a second render leaves duplicate "Sign in" / "Start your own
// group" links in the document and getByRole throws on finding multiple
// matches.
afterEach(cleanup)

describe("MembersOnlyWall", () => {
  it("explains the invite link, names no group, and offers a way onward", () => {
    render(<MembersOnlyWall />)
    expect(screen.getByText("A note from Orbit")).toBeTruthy()

    // The note now splits across two elements (the sign-in sentence is
    // bolded into its own span, below), so the old single getByText(fullString)
    // no longer finds a single node whose own text equals the whole thing.
    // Assert the two halves separately, then assert the concatenated text
    // content of the note paragraph still equals the full original wording,
    // so a wording change anywhere in the note is still caught.
    expect(
      screen.getByText(
        "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in."
      )
    ).toBeTruthy()
    const signInSentence = screen.getByText("Been here before? You can sign in with your email.")
    expect(signInSentence).toBeTruthy()

    const notePara = signInSentence.closest("p")
    expect(notePara?.textContent).toBe(
      "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in. Been here before? You can sign in with your email."
    )

    // The outer "Invite only" eyebrow was deleted 21 Aug: it restated this
    // note's own opening clause ("This group is invite-only...").
    expect(screen.queryByText("Invite only")).toBeNull()
  })

  // Owner QA on PR #91: as one flat paragraph, this sentence (the actual
  // door back in for a returning member) was easy to skim past. It must
  // render visually distinct from the rest of the note. Matches the
  // treatment JoinForm.tsx already uses for "Joining as {name}": brighter
  // --text-primary plus fontWeight 700, not a bare <strong>.
  //
  // Break-it-once evidence (MembersOnlyWall.tsx reverted to a plain string
  // note with no span, then restored):
  //   FAIL  src/components/__tests__/MembersOnlyWall.test.tsx > MembersOnlyWall > bolds the sign-in sentence, distinct from the rest of the note
  //   TestingLibraryElementError: Unable to find an element with the text: Been here before? You can sign in with your email.
  it("bolds the sign-in sentence, distinct from the rest of the note", () => {
    render(<MembersOnlyWall />)
    const signInSentence = screen.getByText("Been here before? You can sign in with your email.")
    expect(signInSentence.tagName).toBe("SPAN")
    expect(signInSentence.style.fontWeight).toBe("700")
    expect(signInSentence.style.color).toBe("var(--text-primary)")

    // The rest of the note stays in the quieter, unbolded body color, so
    // only the one sentence stands out.
    const restOfNote = screen.getByText(
      "This group is invite-only. If you know someone in it, ask them for the invite link, it'll bring you right in."
    )
    expect(restOfNote.style.fontWeight).not.toBe("700")
  })

  // The actual defect this task fixes: a member who lost their session used
  // to be offered only "Start your own group", which invites them to
  // duplicate themselves into a second group instead of coming back as
  // themselves. This test would have failed against the old component,
  // which had no /signin link at all.
  it("points the sign-in door at /signin", () => {
    render(<MembersOnlyWall />)
    const link = screen.getByRole("link", { name: "Sign in" })
    expect(link.getAttribute("href")).toBe("/signin")
  })

  // Owner QA on PR #91: both links used to be equal-weight text, which told
  // a returning member both options weighed the same. "Sign in" is now a
  // real teal button, matching the /signin screen's own submit button
  // (src/components/pill-controls.ts buttonStyle), per CLAUDE.md's rule
  // that teal marks a weight that genuinely matters.
  //
  // Break-it-once evidence (MembersOnlyWall.tsx reverted to omit
  // linkVariant="button", so OrbitNoteScreen fell back to its default
  // quiet text-link treatment):
  //   FAIL  src/components/__tests__/MembersOnlyWall.test.tsx > MembersOnlyWall > renders Sign in as a teal button, not a text link
  //   AssertionError: expected '' to be 'var(--action)' // Object.is equality
  it("renders Sign in as a teal button, not a text link", () => {
    render(<MembersOnlyWall />)
    const link = screen.getByRole("link", { name: "Sign in" })
    expect(link.style.backgroundColor).toBe("var(--action)")
    expect(link.style.color).toBe("var(--action-ink)")
    expect(link.style.width).toBe("100%")
    // The old quiet treatment underlined the label; the button does not.
    expect(link.style.textDecoration).not.toBe("underline")
  })

  // "Start your own group" is still offered, deliberately, for a genuine
  // stranger who never belonged to this group (see MembersOnlyWall.tsx for
  // the reasoning). It must stay the quiet secondary option, not pick up
  // the teal treatment "Sign in" just gained.
  //
  // Break-it-once evidence (temporarily passed linkVariant="button" through
  // to the secondaryLink render in OrbitNoteScreen.tsx as well):
  //   FAIL  src/components/__tests__/MembersOnlyWall.test.tsx > MembersOnlyWall > still offers starting a new group, as a secondary, non-teal option
  //   AssertionError: expected 'var(--action)' not to be 'var(--action)' // Object.is equality
  it("still offers starting a new group, as a secondary, non-teal option", () => {
    render(<MembersOnlyWall />)
    const link = screen.getByRole("link", { name: "Start your own group" })
    expect(link.getAttribute("href")).toBe("/create")
    expect(link.style.backgroundColor).not.toBe("var(--action)")
  })

  it("still reveals nothing about the group: no name, no member count", () => {
    render(<MembersOnlyWall />)
    // Nothing in the rendered note or links is group-specific; this is a
    // regression guard on the "reveals nothing" contract, not a claim that
    // this list of strings is exhaustive.
    expect(screen.queryByText(/members?/i)).toBeNull()
  })
})
