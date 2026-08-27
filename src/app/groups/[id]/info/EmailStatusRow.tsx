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
// The address itself is never printed here, not even to its own owner. The
// rule is "emails are never displayed anywhere in the UI"; reading it
// literally costs nothing and removes an argument later. What renders instead
// is a boolean's worth of state: reminders are on, or they are not.
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
  hasVerifiedEmail: boolean
}

const ADD_PROMPT = "Add an email so you can sign back in as yourself if you ever lose this session."
const CHANGE_PROMPT = "Enter the new address you'd like to use."
const CODE_SENT_MESSAGE = (address: string) => `A code was sent to ${address}. Enter it below.`
const DONE_MESSAGE = "Saved. This email can be used to sign back in any time."

const LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--text-secondary)",
  fontSize: "var(--type-meta)",
  textDecoration: "underline",
  cursor: "pointer",
} as const

export default function EmailStatusRow({ hasVerifiedEmail }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Local rather than re-read from the server prop: the page will not refetch
  // until the next full load, and a member who just attached an address
  // should see this row agree with what they were just told, not keep
  // offering to "add" one that is already saved.
  const [attached, setAttached] = useState(hasVerifiedEmail)

  if (!expanded) {
    return attached ? (
      <span style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
        Email reminders are on.{" "}
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
        promptMessage={attached ? CHANGE_PROMPT : ADD_PROMPT}
        cancelLabel="Never mind"
        onCancel={() => setExpanded(false)}
        onAttached={() => setAttached(true)}
        codeSentMessage={CODE_SENT_MESSAGE}
        doneMessage={DONE_MESSAGE}
      />
    </div>
  )
}
