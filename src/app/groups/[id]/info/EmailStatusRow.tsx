"use client"

// src/app/groups/[id]/info/EmailStatusRow.tsx
//
// The permanent way in that task 5's second ask promises: "Just tap [group
// name] at the top of the screen whenever you're ready." Whoever taps through
// lands here and finds a way to add or change an email, whether they declined
// Orbit's ask twice, want to switch addresses, or came looking on their own.
// Unlike EmailAskNote this never goes away and nothing about using it counts
// toward the two-ask limit; showing it costs nothing because a member has to
// go looking for it rather than being interrupted by it.
//
// THE ONE SURFACE IN THE PRODUCT THAT PRINTS A STORED ADDRESS, and it prints
// it only to the person it belongs to. CLAUDE.md's data-model rule, amended
// 27 August 2026: never shown to the group or to any other member, always
// shown to its owner, on this page, and nowhere else. What the page hands down
// is the VIEWER's address, fetched for the viewer alone, never over the member
// list this same page renders (see page.tsx, and the guard at
// src/app/__tests__/no-email-address-on-screen.test.tsx).
//
// ~~The address itself is never printed here, not even to its own owner.~~
// That is what shipped first, on a literal reading of the older rule, and the
// owner found the cost on his phone: this row offers "Change email", and a
// member holding more than one address cannot answer "change it from what?".
// The rule's stated reasoning is entirely about the GROUP seeing an address,
// and a row only its owner can see is not that.
//
// Two other things went with that change, both his findings. "Email reminders
// are on." is gone rather than reworded: it read as a setting with a switch
// behind it, and there is no switch anywhere in the product. And it repeated
// the eyebrow directly above it word for word. The address is the fact; the
// eyebrow on the page says what it is for.
//
// Reuses EmailAttachFlow (lifted out of EmailAskNote for task 6) for the
// actual request/confirm mechanics, with its own framing: a plain quiet link
// rather than a note from Orbit. The group info page has no Orbit presence
// anywhere else on it, so the flow's default first-person copy ("I sent a
// code...") is overridden here with plain third-person lines instead.
//
// Any member sees this row, including the founder: a lost session is not a
// founder-specific problem, and "everyone can lose a session" is exactly the
// finding that made this slice a priority (CLAUDE.md, "Identity, auth, and
// known gaps").

import { useState } from "react"
import EmailAttachFlow from "../EmailAttachFlow"

interface Props {
  /**
   * The viewer's OWN verified address, or null when they have none.
   *
   * Never anybody else's: the page reads it for the session's user alone. The
   * prop is the address rather than a boolean because this row's control is
   * "Change email", and that question cannot be answered without knowing what
   * is being changed.
   */
  emailAddress: string | null
}

const ADD_PROMPT = "Add an email so you can sign back in as yourself if you ever lose this session."
const CHANGE_PROMPT = "Enter the new address you'd like to use."
const CODE_SENT_MESSAGE = (address: string) => `A code was sent to ${address}. Enter it below.`
const DONE_MESSAGE = "Saved. This email can be used to sign back in any time."

// Neutral counterparts to EmailAttachFlow's own error copy. Two of the
// defaults are unambiguously Orbit's first person ("on my end", the "Mind
// checking it?" aside); the others carry no pronoun but would be the
// only Orbit-voiced lines left on this page if left as is, which would be
// its own kind of inconsistency. Three of the four below are rewritten here
// for the same reason codeSentMessage and doneMessage are: nothing on this
// page says Orbit is the one talking. email_taken is the exception, and the
// note on it says why.
//
// The bad-code sentence is deliberately not overridden at all. It carries no
// Orbit voice to neutralise, so a copy of it here would be a fourth identical
// copy of the one sentence in this slice that must never drift into claiming a
// code expired: the service answers a wrong code and an expired one the same
// way, and the seam collapses both into bad_code. This page inherits
// DEFAULT_BAD_CODE_MESSAGE instead, which removes the drift risk rather than
// guarding it.
const REQUEST_ERROR_MESSAGES = {
  invalid_email: "That address doesn't look right. Check it and try again.",
  // Same rewrite as EmailAttachFlow's default, 27 Aug 2026, and it had to
  // happen here too: this is a separately worded copy of the same idea, and
  // fixing only the other one would have left this path dead-ending the very
  // people it was rewritten for, a member typing their own address after a
  // lost session made a second copy of them. Kept word for word identical to
  // the default here, unlike the four around it: it carries no pronoun, no
  // Orbit voice to neutralise, and the owner settled this exact sentence.
  // Shortened with the default, 27 Aug 2026, and kept word for word identical
  // to it for the same reason as before: it carries no pronoun and no Orbit
  // voice to neutralise. The instruction it used to carry now lives in the
  // control the shared flow renders under it, on both surfaces.
  email_taken: "That email is already on an account.",
  rate_limited: "That was quick. Wait a minute before asking for another code.",
  service_error: "Something went wrong. Give it another try in a bit.",
} as const

// alignSelf: "flex-start" matters here in a way it would not in a row of its
// own: the info page's wrapper is a flex column with no alignItems, which
// defaults to stretch, and there is no button reset anywhere in this repo's
// globals.css. Without this a bare <button> stretches to the column's full
// width and the user-agent stylesheet centers its text, which is exactly
// what ManageMembers and ResetInviteLink already set this same property to
// avoid on this same page.
const LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  alignSelf: "flex-start",
  color: "var(--text-secondary)",
  fontSize: "var(--type-meta)",
  textDecoration: "underline",
  cursor: "pointer",
} as const

export default function EmailStatusRow({ emailAddress }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Local rather than re-read from the server prop: the page will not refetch
  // until the next full load, and a member who just attached or changed an
  // address should see this row agree with what they were just told, not keep
  // offering to "add" one that is already saved, and not keep showing the
  // address they just replaced.
  const [address, setAddress] = useState(emailAddress)

  if (!expanded) {
    return address !== null ? (
      // A column, so the address gets a line of its own. Addresses run long,
      // this sits inside a 28rem page column, and the address plus the control
      // on one line was cramped before the address was even in it.
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "3px",
        }}
      >
        <span
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-primary)",
            fontWeight: 500,
            // An address has no spaces to break at, so a long one has to be
            // allowed to break mid-string or it widens the page. Same reason
            // the info card's key column carries overflowWrap.
            overflowWrap: "anywhere",
            maxWidth: "100%",
          }}
        >
          {address}
        </span>
        <button type="button" onClick={() => setExpanded(true)} style={LINK_STYLE}>
          Change email
        </button>
      </span>
    ) : (
      <button type="button" onClick={() => setExpanded(true)} style={LINK_STYLE}>
        Add your email
      </button>
    )
  }

  return (
    // The quiet expand-box pattern already used by ManageMembers' remove
    // confirm and ResetInviteLink's confirm: a hairline border, no fill, so it
    // reads as an inline state change rather than a card of its own.
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <EmailAttachFlow
        promptMessage={address !== null ? CHANGE_PROMPT : ADD_PROMPT}
        cancelLabel="Never mind"
        onCancel={() => setExpanded(false)}
        // Collapsing here, not just flipping `attached`, is what keeps this
        // row usable the moment after it succeeds. Without it a successful
        // save left the box parked on one sentence with no control at all:
        // the flow hides its own form and cancel link once step is "done",
        // and that state has no way back to "Email reminders are on." /
        // "Change email" short of navigating away and returning. This row
        // is permanent, so it has to stay a place a member can act, not just
        // a place a member once acted.
        //
        // The saved address comes back from the flow rather than from a
        // refetch, because there is no refetch until the next full page load.
        // It is the member's own keystrokes, confirmed by the service one call
        // earlier, so it is the same address storage now holds.
        onAttached={(saved) => {
          setAddress(saved)
          setExpanded(false)
        }}
        codeSentMessage={CODE_SENT_MESSAGE}
        doneMessage={DONE_MESSAGE}
        requestErrorMessages={REQUEST_ERROR_MESSAGES}
      />
    </div>
  )
}
