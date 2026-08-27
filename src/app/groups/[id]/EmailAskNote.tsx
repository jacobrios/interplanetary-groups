"use client"

// src/app/groups/[id]/EmailAskNote.tsx
//
// Orbit asking for a way to remember this member, pinned just above the
// composer. It is the only part of the email slice most members will ever see.
//
// Why it is here at all: without an email, a member who loses their session
// taps the invite link again and joins as a SECOND person. The group holds two
// of them, their earlier answers belong to an identity nobody can reach, and
// every attendance count is quietly wrong, in the one product whose whole
// claim is accurate attendance.
//
// Placement is the owner's, settled 26 Aug 2026 from three options with the
// screen cost of each measured: just above the message composer, in the slot
// OrbitDownNote already uses. The recorded reservation is accepted with it, an
// undecided member has a slightly smaller chat for as long as they stay
// undecided, which is why this stays one line of copy plus the field.
//
// A NOTE, not a chat bubble. The bubble rule would allow one here, since the
// member's next action does answer Orbit, but a bubble only one viewer can see
// sitting at the bottom of a shared feed would read as a message everyone else
// can see. That is worse than the rule it satisfies, so this takes the labeled
// note treatment instead (the same grammar as OrbitNoteScreen).
//
// Nothing here is ever posted to the feed and nothing about it is stored except
// the answer: a dismissal advances the counter, an attach creates the contact
// method, and simply being shown writes nothing at all.
//
// The actual field-state, request/confirm calls, and error copy live in
// EmailAttachFlow (task 6), lifted out of this file so the group info page's
// permanent row runs the same mechanism instead of a second copy of it. What
// stays here: the note box, the Orbit mark, which of the two settled asks to
// show, and what "Not now" / "No thanks" mean (a real dismissal that counts).

import { useState, useTransition } from "react"
import { shouldOfferEmail, type EmailAskState } from "@/lib/auth/email-offer"
import { dismissEmailOfferAction } from "@/app/actions/email-ask"
import { OrbitMark } from "@/components/OrbitMark"
import EmailAttachFlow from "./EmailAttachFlow"

// The owner settled this copy over four rounds and overruled two objections on
// the record: that "log back in" is system language for someone who never
// knowingly made an account (logging in is universally understood), and that
// "lose access to this group" is inaccurate because a member keeps the invite
// link and loses their identity rather than their access (the two readings are
// the same thing from the member's side). Do not re-voice it.
const FIRST_ASK =
  "I haven't asked for a way to remember you. Add your email so you can log back in if necessary. This way you don't lose access to this group."

/** Appended to the first ask for the founder alone. */
const FOUNDER_EXTRA = "It also means you won't lose the group you started."

/**
 * The second and last ask. It points at the group name at the top of the
 * screen rather than naming a page, so it sends the member somewhere they can
 * already see. No expiry is named anywhere in this copy, deliberately: storage
 * does expire, but what applies to this app's setup was never verified, and a
 * number nobody can stand behind is worse than staying general.
 */
function secondAsk(groupName: string): string {
  return `You're still a temporary member. Without your email, you can't log back in if something happens. If now is not a good time, no worries. Just tap ${groupName} at the top of the screen whenever you're ready. I won't bother you like this again.`
}

export interface EmailAskNoteProps {
  groupId: string
  groupName: string
  viewerIsFounder: boolean
  askState: EmailAskState
  latestContributionAt: Date | null
  hasVerifiedEmail: boolean
  /** Injected rather than read here, so a test's outcome never depends on the clock. */
  now: Date
}

export default function EmailAskNote({
  groupId,
  groupName,
  viewerIsFounder,
  askState,
  latestContributionAt,
  hasVerifiedEmail,
  now,
}: EmailAskNoteProps) {
  const [answered, setAnswered] = useState(false)
  const [, startTransition] = useTransition()

  // The gate lives in the component rather than in the page, because this repo
  // can test a component and cannot test a server-rendered screen. The page
  // gathers the facts; the one decision about whether a member is asked is made
  // here, where a test can hold it to it.
  const offer = shouldOfferEmail({ user: askState, latestContributionAt, hasVerifiedEmail, now })

  if (answered || offer === null) return null

  function handleDismiss() {
    // Off the screen either way. The member said no; refusing to go away
    // because a write failed would be the worst possible reading of that.
    setAnswered(true)
    startTransition(async () => {
      await dismissEmailOfferAction()
    })
  }

  const dismissLabel = offer === "first" ? "Not now" : "No thanks"
  const promptMessage =
    offer === "first"
      ? viewerIsFounder
        ? `${FIRST_ASK} ${FOUNDER_EXTRA}`
        : FIRST_ASK
      : secondAsk(groupName)

  return (
    <div style={{ padding: "0 16px 4px", flexShrink: 0 }} data-group-id={groupId}>
      {/* The labeled-note treatment, ported from OrbitNoteScreen: the mark sits
          in the padding inset so the copy runs full width beside it rather than
          stacked under it. No eyebrow here, unlike that screen: this note sits
          under a feed the member has been reading Orbit in all along, and a
          "A NOTE FROM ORBIT" band would cost a line to say what the mark
          already says. */}
      <div
        style={{
          position: "relative",
          border: "1px solid var(--hairline)",
          borderRadius: 12,
          padding: "10px 12px 10px 44px",
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <div style={{ position: "absolute", left: 10, top: 10 }}>
          <OrbitMark size={26} label={null} />
        </div>

        <EmailAttachFlow
          promptMessage={promptMessage}
          cancelLabel={dismissLabel}
          onCancel={handleDismiss}
        />
      </div>
    </div>
  )
}
