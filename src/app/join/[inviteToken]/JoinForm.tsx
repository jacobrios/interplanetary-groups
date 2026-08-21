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
// as before. This is a visual + copy pass only.
"use client"

import { useActionState } from "react"
import type { CSSProperties } from "react"
import { joinGroupAction, type JoinGroupState } from "@/app/actions/join-group"
import { OrbitBubble } from "@/components/OrbitBubble"
import { ArrowRight } from "@/components/glyphs"

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
// entirely rather than just hiding it visually.
const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
}

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

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "26px",
  padding: "14px 18px",
  backgroundColor: "var(--surface-raised)",
  // The 575-578 override (1px solid --hairline) replaces the screen block's
  // 2px solid --ink border and its shadow.
  border: "1px solid var(--hairline)",
  fontSize: "var(--type-body)",
  color: "var(--text-primary)",
  outline: "none",
}

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

function buttonStyle(isPending: boolean): CSSProperties {
  return {
    width: "100%",
    marginTop: "14px",
    minHeight: "52px",
    borderRadius: "28px",
    backgroundColor: "var(--action)",
    color: "var(--action-ink)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "var(--type-body)",
    lineHeight: "var(--leading-normal)",
    fontWeight: 700,
    border: "none",
    // In-flight feedback: the old palette shifted the fill to a second
    // teal while pending; the new palette has no second teal, so this dims
    // instead, matching MessageFeed's optimistic-message idiom (0.65,
    // greyscale-safe, no new token). No transition: this slice is
    // no-animation, so the change is instant.
    opacity: isPending ? 0.65 : 1,
    cursor: isPending ? "not-allowed" : "pointer",
  }
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
  const memberLabel = `${memberCount} ${memberCount === 1 ? "member" : "members"}`

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
        <form action={formAction} style={{ display: "flex", flexDirection: "column" }}>
          {/* Always include hidden inviteToken and hasSession flags */}
          <input type="hidden" name="inviteToken" value={inviteToken} />
          <input type="hidden" name="hasSession" value={currentName ? "1" : ""} />

          <p style={eyebrowStyle}>You&apos;re invited</p>

          <OrbitBubble>
            Hey! I&apos;m Orbit. I keep {groupName} running so nobody has to
            be the organizer.
          </OrbitBubble>

          <div style={cardStyle}>
            <p style={cardTitleStyle}>{groupName}</p>
            <div style={rowsStyle}>
              <Row label="WHO" value={memberLabel} />
              {rhythmRows.map((row, i) => (
                <Row key={i} label={row.label} value={row.value} />
              ))}
            </div>
          </div>

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
        </form>
      </div>
    </main>
  )
}
