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
//
// Amended 3 Sept 2026, owner's phone QA: "Add your email" was a quiet
// underlined text link and he found it too hard to see. That matters more
// here than it would on a merely convenient control, because a member with
// no address attached is the one who comes back as a duplicate person after
// losing a session, which is the exact failure this whole row exists to
// prevent. It is now a full-width outlined pill; the expanded flow lost the
// hairline box it used to sit inside so a tap reads as text-then-two-controls
// appearing in place, the way CancelControls' own confirm step on the event
// screen already does. "Change email" is deliberately untouched; see the
// note beside it below for why the two controls are no longer meant to look
// alike.
//
// Corrected the same day, second pass of the owner's QA: the pill's shape
// (full width, rounded ends) still nods at CancelControls, but its label
// color and border weight are matched to LeaveGroupButton's own "Leave
// group" pill on this same page instead, not to CancelControls. See the
// comment beside the pill style below for why.

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
//
// As of 3 Sept 2026 this style is used for "Change email" alone. "Add your
// email" moved to the full-width pill below it, by the owner's explicit
// choice on his phone QA, and this is not an oversight left half-finished:
// prominence follows what is at stake, not what the control does. A member
// with no address attached risks coming back as a stranger the next time
// their session drops, so that control has to be easy to find. A member
// changing an address already has one on file and is already protected, so
// "Change email" stays exactly this quiet link, along with "Manage members"
// and "Reset link" below on this same page, which the owner confirmed should
// stay quiet links for the identical reason: nothing is at risk if they go
// unnoticed a little longer.
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

// Geometry matched to LeaveGroupButton's own collapsed-state button
// (src/app/groups/[id]/info/LeaveGroupButton.tsx, the "Leave group" pill),
// not to CancelControls on the event screen, corrected 3 Sept 2026 after the
// owner's phone QA. LeaveGroupButton is this page's own drawn control: its
// comment says its minHeight is "46px per .gi-leave at default text", meaning
// its values trace to the design handoff for this screen, which makes it the
// right sibling to match here rather than a control borrowed from a different
// screen with a different reason for looking the way it does.
//
// The event screen's outlinedPill is deliberately NOT the reference any
// more. There, "Call this off" sits directly under the RSVP pair, and that
// context is what earns the dimmer --text-secondary label color: cancelling
// is meant to read as the quieter option next to the primary RSVP ask sitting
// right above it. Nothing on the group info page plays that role next to
// "Add your email". Reusing the event screen's dimmed text here just because
// the two pills share a shape carried a hierarchy decision that belonged to a
// different screen's layout, and it produced the exact thing the owner
// flagged: "Add your email" reading dimmer than "Leave group" directly below
// it, when adding an email is the more important control of the two. It is
// what stops a member coming back after a lost session as a duplicate person
// and silently corrupting every attendance count in the group; leaving a
// group is rare and destructive by comparison. The brighter, full-strength
// text color is carrying that hierarchy on purpose, matching LeaveGroupButton
// rather than sitting a shade behind it.
//
// minHeight is a floor, never a fixed height, per the layout-grows rule: it
// has to survive enlarged device text without clipping. Outlined rather than
// teal, on purpose: this is still one control among several on the page
// ("Leave group", "Manage members", "Reset link"), and CLAUDE.md's colour
// rule reserves teal for an action that genuinely matters, never a default
// weight for "important enough to be a button." Brightness, not colour, is
// what carries this control's own relative importance.
const pill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  width: "100%",
  minHeight: "46px",
  padding: "0.75rem 1.5rem",
  borderRadius: "24px",
  fontSize: "var(--type-label)",
  fontWeight: 600,
  lineHeight: "var(--leading-normal)",
  cursor: "pointer",
}

const outlinedPill: React.CSSProperties = {
  ...pill,
  background: "transparent",
  border: "1.7px solid var(--hairline)",
  color: "var(--text-primary)",
}

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
      <button type="button" onClick={() => setExpanded(true)} style={outlinedPill}>
        Add your email
      </button>
    )
  }

  return (
    // This used to be the quiet expand-box pattern ManageMembers' remove
    // confirm and ResetInviteLink's confirm both still use: a hairline
    // border, no fill, reading as an inline state change rather than a card
    // of its own. The owner asked this row to depart from that, in his own
    // words: "similar to what it already looks like, just without the little
    // box border. Kind of like what happens when you click the Call this off
    // button and text and two new buttons appear." A boxed flow sitting right
    // under a real pill button read as a control nested inside a control,
    // where CancelControls' own confirm step on the event screen just lets
    // its text and buttons appear in place with nothing drawn around them.
    // flexDirection: column and the gap survive the border's removal because
    // they are doing real layout work independent of it, spacing the flow's
    // message paragraph from its form; the padding that existed only to hold
    // content off the border is gone with the border it was measured against.
    <div
      style={{
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
