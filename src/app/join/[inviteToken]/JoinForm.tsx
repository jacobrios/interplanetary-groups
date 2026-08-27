// src/app/join/[inviteToken]/JoinForm.tsx
//
// The join screen (visual-polish slice, task 2; walkthrough screens 05-06,
// jn- block in docs/design/design-polish-rd-2/walkthrough.css lines 208-265
// plus the override passes at 548, 552-553, 569-573, 575-578, 628-632,
// 637-639). Headerless, same reasoning as the front door: nothing to
// navigate back to.
//
// Behaviour is unchanged from the pre-visual build: joinGroupAction, the
// hidden inviteToken/hasSession fields, the error states, and the pending
// state (Joining…, opacity 0.65, disabled, no transition) all work exactly
// as before.
//
// The email-sign-in slice added one thing to this screen and changed nothing
// else: a second door, for a visitor the product does not recognise but may
// already know. A door rather than a second form, on purpose. Most taps on an
// invite link really are new people, this screen is the product's activation
// point, and joining stays exactly one step for them; the second path appears
// only once somebody says the ordinary one is not theirs. What sits behind it
// is JoinSignIn, and it is the fix for the bug the slice exists for: without
// it, a member who lost their session taps the link they still have and is
// silently made into a second member of their own group.
"use client"

import { useActionState, useState } from "react"
import type { CSSProperties } from "react"
import { joinGroupAction, type JoinGroupState } from "@/app/actions/join-group"
import { OrbitBubble } from "@/components/OrbitBubble"
import { ArrowRight } from "@/components/glyphs"
import { visuallyHiddenStyle } from "@/components/visually-hidden"
import { inputStyle, buttonStyle } from "./join-controls"
import JoinSignIn from "./JoinSignIn"

interface RhythmRow {
  label: string
  value: string
}

interface Props {
  groupName: string
  inviteToken: string
  currentName: string | null // null = new visitor; non-null = returning session
  memberCount: number
  rhythmRows: RhythmRow[]
}

const initialState: JoinGroupState = {}

// Standard clip-rect technique: present to the accessibility tree and to
// screen readers, invisible on screen. `display: none` was ruled out
// (task brief, resolution C) because it removes the label from the tree
// entirely rather than just hiding it visually. Shared with the
// event-detail meta rows as of task 3's fix round 1 — see
// src/components/visually-hidden.ts.

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--type-eyebrow)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  fontWeight: 700,
  padding: "6px 2px 14px",
}

const cardStyle: CSSProperties = {
  marginTop: "18px",
  backgroundColor: "var(--surface-raised)",
  border: "1.7px solid var(--hairline)",
  borderRadius: "14px",
  // The dark-override shadow (line 569-573), matching EventCard — not the
  // screen block's light-mode "4px 5px 0" value at line 227.
  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  padding: "16px 17px 15px",
}

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--type-title)",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--text-primary)",
  lineHeight: "var(--leading-tight)",
  overflowWrap: "break-word",
}

const rowsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  marginTop: "12px",
}

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  padding: "9px 0",
  borderTop: "1.4px solid var(--hairline)",
}

const rowKeyStyle: CSSProperties = {
  margin: 0,
  // General rule 3: the design's 58px key column assumed short labels
  // ("CLIMBS"); real extraction yields the founder's own word ("CLIMBING",
  // "PICKLEBALL"). Content sizing with a 58px floor and a 60% ceiling, the
  // pattern PlaybackCard's PlaybackRow already uses, so a long label wraps
  // inside its own column instead of breaking mid-word or clipping the
  // value beside it.
  width: "min-content",
  minWidth: "58px",
  maxWidth: "60%",
  flex: "0 0 auto",
  fontSize: "var(--type-eyebrow)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  fontWeight: 700,
  paddingTop: "2.5px",
  overflowWrap: "break-word",
}

const rowValueStyle: CSSProperties = {
  margin: 0,
  flex: "1 1 auto",
  minWidth: 0,
  fontSize: "var(--type-meta)",
  color: "var(--text-primary)",
  fontWeight: 500,
  lineHeight: "var(--leading-normal)",
  overflowWrap: "break-word",
}

const fieldWrapStyle: CSSProperties = { marginTop: "22px" }

// The returning-session pill ("Joining as Name"). Not in the design source
// at all (task brief, resolution E) — our own treatment, built from values
// already on this screen: the name field's own pill radius and padding,
// the card's raised surface and hairline border. Same spirit as the
// Manage-members state on the group-info page: a real product state the
// mockup never drew, dressed consistently rather than left bare.
const returningStateStyle: CSSProperties = {
  borderRadius: "26px",
  padding: "14px 18px",
  backgroundColor: "var(--surface-raised)",
  border: "1px solid var(--hairline)",
  fontSize: "var(--type-body)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-secondary)",
  margin: 0,
}

const generalErrorStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "var(--type-meta)",
  color: "var(--danger)",
}

const fieldErrorStyle: CSSProperties = {
  marginTop: "0.375rem",
  fontSize: "var(--type-meta)",
  color: "var(--danger)",
}

const reassureStyle: CSSProperties = {
  marginTop: "13px",
  padding: "0 16px",
  textAlign: "center",
  fontSize: "var(--type-eyebrow)",
  color: "var(--text-secondary)",
  fontWeight: 500,
  lineHeight: "var(--leading-normal)",
}

// The second door, and it is deliberately the quietest thing on the screen:
// a text link under the reassurance line, centred with it, never teal. Teal
// is a weight rather than a count, and the weight on this screen belongs to
// joining. Somebody who needs this door is looking for it.
const secondDoorStyle: CSSProperties = {
  marginTop: "10px",
  // min-height plus padding rather than a fixed height, so an enlarged device
  // text size grows it instead of clipping it. 44px is also the tap-target
  // floor the card-region-height slice set.
  minHeight: "44px",
  padding: "4px 8px",
  alignSelf: "center",
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  fontSize: "var(--type-eyebrow)",
  fontWeight: 500,
  lineHeight: "var(--leading-normal)",
  textDecoration: "underline",
  cursor: "pointer",
}

function Row({ label, value }: RhythmRow) {
  return (
    <div style={rowStyle}>
      <p style={rowKeyStyle}>{label}</p>
      <p style={rowValueStyle}>{value}</p>
    </div>
  )
}

export default function JoinForm({
  groupName,
  inviteToken,
  currentName,
  memberCount,
  rhythmRows,
}: Props) {
  const [state, formAction, isPending] = useActionState(joinGroupAction, initialState)
  // Only ever meaningful for a visitor with no session: a person the product
  // has already resolved to a name is themselves already and has nothing to
  // sign in for.
  const [signingIn, setSigningIn] = useState(false)
  const memberLabel = `${memberCount} ${memberCount === 1 ? "member" : "members"}`

  // Shared by both branches so that what somebody is joining stays on screen
  // whichever door they took. Held in one place rather than written twice: the
  // ordinary join's markup has to stay exactly what it was, and a second copy
  // is how that quietly stops being true.
  const identityBlock = (
    <>
      <p style={eyebrowStyle}>You&apos;re invited</p>

      <OrbitBubble>
        Hey! I&apos;m Orbit. I keep {groupName} running so nobody has to
        be the organizer.
      </OrbitBubble>

      <div style={cardStyle}>
        <h1 style={cardTitleStyle}>{groupName}</h1>
        <div style={rowsStyle}>
          <Row label="WHO" value={memberLabel} />
          {rhythmRows.map((row, i) => (
            <Row key={i} label={row.label} value={row.value} />
          ))}
        </div>
      </div>
    </>
  )

  return (
    <main
      style={{
        minHeight: "100dvh",
        // The .jn-body source also carries `flex: 1 1 auto`. It's inert
        // here (this <main> is body's sole flex child, so there is no
        // sibling to grow past and no free space to claim beyond what
        // minHeight already reserves — see the fix-round-1 postscript in
        // the task report for the measurements that confirm it), but it's
        // a distinct property from min-height so it's added anyway with
        // no cost. `min-height: 0` from the same source rule is NOT
        // ported: it is the same CSS property as the minHeight: 100dvh
        // below and would silently replace it, and 100dvh is the
        // established, load-bearing convention behind every other
        // headerless screen in this codebase (front door, OrbitNoteScreen,
        // group info). Kept the value that renders correctly.
        flex: "1 1 auto",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        padding: "10px 24px 18px",
      }}
    >
      {/* 28rem content wrapper, centred the same way as the group-info
          page (`width: 100%; maxWidth: 28rem; margin: 0 auto`) and the
          onboarding wizard screens, so the card and pill controls don't
          stretch full-bleed on desktop/tablet. <main> keeps owning the
          full-bleed background and the page's own padding. */}
      <div style={{ width: "100%", maxWidth: "28rem", margin: "0 auto" }}>
        {signingIn ? (
          // The join form is unmounted rather than hidden beside the panel.
          // Two reasons, and the second is not cosmetic: one primary action at
          // a time is the whole point of the teal rule, and a form cannot be
          // nested inside another form, so a sign-in field living inside the
          // join form would send Enter to the wrong action.
          <div style={{ display: "flex", flexDirection: "column" }}>
            {identityBlock}
            <JoinSignIn inviteToken={inviteToken} onCancel={() => setSigningIn(false)} />
          </div>
        ) : (
          <form action={formAction} style={{ display: "flex", flexDirection: "column" }}>
            {/* Always include hidden inviteToken and hasSession flags */}
            <input type="hidden" name="inviteToken" value={inviteToken} />
            <input type="hidden" name="hasSession" value={currentName ? "1" : ""} />

            {identityBlock}

            {state.errors?.general && <p style={generalErrorStyle}>{state.errors.general}</p>}

            <div style={fieldWrapStyle}>
              {currentName === null ? (
                <>
                  {/* The design shows no visible label, only placeholder text.
                      A placeholder is not an accessible name (task brief,
                      resolution C), so a visually hidden label carries it. */}
                  <label htmlFor="memberName" style={visuallyHiddenStyle}>
                    Your name
                  </label>
                  <input
                    id="memberName"
                    name="memberName"
                    type="text"
                    autoComplete="given-name"
                    placeholder="What should the crew call you?"
                    style={inputStyle}
                  />
                  {state.errors?.memberName && (
                    <p style={fieldErrorStyle}>{state.errors.memberName}</p>
                  )}
                </>
              ) : (
                /* RETURNING SESSION — read-only "Joining as {name}" */
                <p style={returningStateStyle}>
                  Joining as{" "}
                  <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                    {currentName}
                  </span>
                </p>
              )}
            </div>

            <button type="submit" disabled={isPending} style={buttonStyle(isPending)}>
              {isPending ? "Joining…" : `Join ${groupName}`}
              <ArrowRight size={17} strokeWidth={2.6} stroke="var(--action-ink)" />
            </button>

            <p style={reassureStyle}>
              No app to download, no password. You&apos;ll land right in the group.
            </p>

            {currentName === null && (
              <button
                type="button"
                onClick={() => setSigningIn(true)}
                style={secondDoorStyle}
              >
                I&apos;ve been here before
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
