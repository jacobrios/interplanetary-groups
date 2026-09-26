// src/app/create/Step1Describe.tsx
//
// Onboarding Step 1: Orbit's tailed bubble (the single tailed-bubble
// exception, build-notes §7), founder name, free-text description, one teal
// action. The bubble carries the re-ask copy when extraction came back
// incomplete, and the pause state replaces the button area with a labeled
// thinking line in Orbit's voice — never a bare spinner.

"use client"

import Link from "next/link"
import type { ExtractGroupState } from "@/app/actions/extract-group"
import { REASK_COPY } from "@/lib/orbit/playback"
import { UNAVAILABLE_COPY } from "@/lib/orbit/unavailable-copy"
import { TailedOrbitBubble } from "@/components/TailedOrbitBubble"
import { LegalConsentLine } from "@/components/LegalFooter"
import OrbitPause from "./OrbitPause"

const INTRO_COPY =
  "Hi, I'm Orbit. Tell me about your group. What do you do together, and when do you usually meet?"

const ERROR_COPY = "Hmm, that didn't go through. Give it another try in a moment."

const PAUSE_COPY = "One sec, I'm working out your schedule."

// The design's field-label grammar, ported from walkthrough.css .s1-namelab
// (line 200): 13px eyebrow, 0.12em tracking, uppercase, weight 700, in the
// secondary ink (--ink-faint there is #A7AAB6, this project's
// --text-secondary). Steps 2 and 3 already speak it (PlaybackRow's key
// column, step 3's "GROUP INVITE LINK" eyebrow), so step 1's two field
// labels were the last sentence-case holdouts. Only the type grammar is
// ported: the rule's own `margin: 13px 4px 6px` is left out, because the
// vertical rhythm around these fields was tuned against the design's own
// containers in an earlier fix, and a 4px left inset would pull the label
// off the input's left edge.
const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--type-eyebrow)",
  lineHeight: "var(--leading-normal)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
}

interface Props {
  founderName: string
  onFounderNameChange: (v: string) => void
  /** The signed-in founder's stored `User.name`, or null for a first-time
   * founder (no session, or a session with no User row yet). Non-null means
   * we already know who this is: the name renders as fact, never an input,
   * because `provisionFounderGroup` reuses the existing User row and only
   * writes `name` on the create branch — anything typed into an editable
   * field here would be silently discarded at confirm while the playback
   * card had already shown it back as confirmed. Editable-and-saved was
   * considered and declined by the owner: `name` lives on `User`, not
   * `Membership`, so an edit here would rename the person in every group
   * they belong to, retroactively, from a screen about starting a
   * *different* group (spec: docs/superpowers/specs/2026-09-04-onboarding-nav-design.md). */
  knownName: string | null
  description: string
  onDescriptionChange: (v: string) => void
  formAction: (formData: FormData) => void
  isExtracting: boolean
  extractState: ExtractGroupState
  /** Wins over the status-derived copy; the wizard passes the exhausted-loop
   * explainer through here. */
  bubbleOverride?: string
}

export default function Step1Describe({
  founderName,
  onFounderNameChange,
  knownName,
  description,
  onDescriptionChange,
  formAction,
  isExtracting,
  extractState,
  bubbleOverride,
}: Props) {
  // "incomplete" here means the founder bailed out of the gap step back to
  // Step 1, so the description-editing phrasing of REASK_COPY is the right
  // one. "unusable" (nothing schedulable) deliberately keeps this static
  // treatment: there is no partial card to anchor a conversation.
  const bubbleCopy =
    bubbleOverride ??
    (extractState.status === "incomplete"
      ? REASK_COPY[extractState.gap.missing]
      : extractState.status === "unusable"
        ? REASK_COPY.nothing_schedulable
        : extractState.status === "unavailable"
          ? UNAVAILABLE_COPY[extractState.reason]
          : extractState.status === "error"
            ? ERROR_COPY
            : INTRO_COPY)

  // A known name is a fact, not an input, so it never gates: gating on a
  // value the founder cannot change would just be a second, silent way to
  // strand them on this screen. A first-time founder still needs to type
  // one, so the name half of the gate only applies when knownName is null.
  const canSubmit =
    (knownName !== null || founderName.trim().length > 0) && description.trim().length > 0

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* TailedOrbitBubble: the tailed, avatar-less treatment for a wizard
          bubble sitting directly under the header, so the header's Orbit
          mark reads as the speaker (§7 onboarding exception, amended 20 Aug
          2026). Step 1 and step 2's opening bubble both qualify and share
          this component; the gap-ask does not, since its bubble sits below
          the playback card rather than under the header. Only the outer
          vertical spacing is kept local to this step, since it is a layout
          decision about this screen rather than part of the bubble's own
          shape. */}
      {/* 12px below, not the 2rem it was. See the vertical-budget note above
          the Continue button: this is one of the five gaps that paid for the
          consent line being above the fold, and this spacing is explicitly
          local to this screen rather than ported from the design handoff. */}
      <div style={{ marginTop: "1rem", marginBottom: "12px" }}>
        <TailedOrbitBubble>
          <p style={{ margin: 0 }}>{bubbleCopy}</p>
        </TailedOrbitBubble>
      </div>

      {/* No flex `gap` here: the design's own containers (.s2-body,
          .s2-final-scroll, .s1-foot) contribute no gap of their own, so a
          uniform gap here would land on top of every ported margin-top
          below and double-count the spacing (round-2 review finding).
          Each child instead carries its own explicit marginTop, either a
          value ported straight from the design or, where a child has no
          design counterpart of its own (the description field, the pause
          state), the same 20px that the removed gap used to give it, so
          nothing collapses to zero and nothing un-flagged changes. */}
      <form action={formAction} style={{ display: "flex", flexDirection: "column" }}>
        <div>
          <label
            id="founderNameLabel"
            htmlFor={knownName === null ? "founderName" : undefined}
            style={fieldLabelStyle}
          >
            Your name
          </label>
          {knownName === null ? (
            <input
              id="founderName"
              name="founderName"
              type="text"
              autoComplete="given-name"
              placeholder="e.g. Taylor"
              value={founderName}
              onChange={(e) => onFounderNameChange(e.target.value)}
              disabled={isExtracting}
              style={{
                width: "100%",
                padding: "11px 14px",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--hairline)",
                borderRadius: "12px",
                color: "var(--text-primary)",
                fontSize: "var(--type-body)",
                fontWeight: 500,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            // A known founder's name is a fact, not a field: rendered in the
            // same box the input would occupy (so the layout above and below
            // it is untouched) but as plain text, never a disabled <input>.
            // A disabled input reads as "editable, just not now" and sends a
            // founder hunting for how to turn it back on; this has no such
            // affordance because it has no such capability. Nobody drew this
            // treatment — it is invented, matching the input's own type
            // scale and colors rather than a new one (spec: nothing here has
            // been seen rendered by a design).
            //
            // aria-labelledby, not htmlFor: a plain <div> is not a labelable
            // element per the HTML spec, so a label's `for` attribute cannot
            // reach it — that gap is what code review caught (2026-09-04
            // fix-on-review). Pointing this div at the label's own id gives
            // the read-only path the same accessible-name announcement a
            // returning founder's screen reader gets on the editable path:
            // "Your name, Jacob" either way.
            <div
              id="founderName"
              aria-labelledby="founderNameLabel"
              style={{
                width: "100%",
                padding: "11px 14px",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--hairline)",
                borderRadius: "12px",
                color: "var(--text-primary)",
                fontSize: "var(--type-body)",
                fontWeight: 500,
                boxSizing: "border-box",
              }}
            >
              {founderName}
            </div>
          )}
        </div>

        <div style={{ marginTop: "12px" }}>
          <label
            htmlFor="description"
            style={fieldLabelStyle}
          >
            About your group
          </label>
          <textarea
            id="description"
            name="description"
            // FIVE ROWS, which is what main had, and the review round is why
            // it is back. A first pass cut this to four to buy 25.5px for the
            // vertical budget below, and that was a real regression at an
            // accessibility text size rather than a free win: the placeholder
            // wraps to MORE lines as the text grows, because the column stays
            // the same width, so a fixed row count covers a band rather than
            // every size. Measured at 375px wide:
            //
            //   root 16-18px  placeholder needs 3 lines
            //   root 20-22px  4 lines   <- rows={4} runs out here
            //   root 24px     5 lines   <- rows={5} runs out here
            //   root 28-32px  6 to 8 lines, neither value holds it
            //
            // At 150% device text (root 24px) rows={4} clipped the last line
            // and a half of the only example teaching a founder what to
            // write, which is exactly the "layout grows with content, never
            // clips" rule. rows={5} covers up to 150% and the 25.5px was
            // found in the surrounding gaps instead. Nothing above 150% is
            // held by any row count; that is a known limit, not an oversight.
            rows={5}
            placeholder="e.g. A few of us climb at Summit Gym on Sunday mornings at 8."
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={isExtracting}
            style={{
              width: "100%",
              // Does NOT govern the rendered height; `rows` above does, at
              // every text size, so this is not the lever it looks like.
              // What it actually does is floor how small `resize: vertical`
              // below lets a founder drag the field. Kept at main's value.
              minHeight: "150px",
              // display: block removes the 6px of dead space an inline-level
              // form control leaves under itself for a text baseline that
              // nothing here sits on. Free height, no visual change.
              display: "block",
              padding: "14px 15px",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--hairline)",
              borderRadius: "14px",
              color: "var(--text-primary)",
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              outline: "none",
              boxSizing: "border-box",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {isExtracting ? (
          // The pause: a labeled thinking state in Orbit's voice. Inputs stay
          // mounted (disabled) so the founder's text is never lost. Wrapped
          // so it carries the same 20px the removed flex gap used to give
          // it from the description field above (no design source for this
          // state, so its own spacing is unchanged from before this fix).
          <div style={{ marginTop: "1.25rem" }}>
            <OrbitPause copy={PAUSE_COPY} />
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: "100%",
              minHeight: "52px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px 24px",
              backgroundColor: "var(--action)",
              color: "var(--action-ink)",
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              fontWeight: 600,
              border: "none",
              borderRadius: "30px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
              // WAS 32px, the design's .s1-foot padding-top (14) plus .cta's
              // own margin-top (18), combined here because our button is a
              // direct flex child rather than nested in a .s1-foot wrapper
              // (round-2 review finding). Now 12px.
              //
              // THE VERTICAL BUDGET, 2 September 2026, owner QA, and the
              // whole point of it: the consent line under this button was
              // BELOW THE FOLD on his phone (iPhone 13 Pro in Chrome, which
              // gives the page 661 CSS pixels, not the 844 the device
              // advertises). A person agreeing to terms they cannot see is
              // the worst version of a consent line. Measured before: the
              // line ran 696px to 735px, so it started 35px past the fold.
              // It now runs 613.5px to 653px, entirely above it.
              //
              // WHERE THE HEIGHT CAME FROM, and the second version of this
              // list is the one that matters, because the first was wrong.
              // The first attempt took most of it from the description field
              // (5 rows to 4), which read as free and was not: it clipped
              // that field's placeholder at 150% device text. So the field
              // was put back and the same 25.5px was taken from the five
              // gaps around it instead, none of which carries content:
              //
              //   this gap                     32 -> 12
              //   hint line's own top gap      11 -> 8
              //   bubble's bottom margin     2rem -> 12px
              //   gap above the description  1.25rem -> 12px
              //   consent line's top gap       14 -> 12
              //
              // plus display: block on the field (6px of inline-baseline
              // dead space) and the hint line losing its second sentence.
              // Nothing here gained a fixed height and nothing clips.
              marginTop: "12px",
            }}
          >
            Continue
          </button>
        )}

        {/* Hint line below the primary action (mockup screen 01 position).
            Reference text: meta scale, secondary color, never an action.
            Rendered in the pause state too, since it explains what Orbit is
            doing with the description either way.

            "Mention your usual spot too, if you have one." was deleted
            2 September 2026 at the owner's ask: it cost a whole rendered
            row on his phone, and the venue it asks for never gates anything
            (CLAUDE.md, venue never gates), so nothing is lost by a founder
            who does not read it. */}
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textAlign: "center",
            marginTop: "8px",
            marginBottom: 0,
          }}
        >
          Orbit reads this to set your days, send reminders, and build a shared group page.
        </p>

        {/* The same consent line the join screen carries, beside the same
            kind of moment. The founder is creating an account too, and the
            join screen is not their path, so without this the one person
            who never sees those two links is the person who starts the
            group. Step 1 only: it belongs with the first commitment, not
            repeated on every step of the wizard. */}
        <div style={{ marginTop: "12px" }}>
          <LegalConsentLine action="starting a group" />
        </div>
      </form>

      {/* The only exit from onboarding, and it is on step 1 only.
          Steps 2 and 3 already have "Edit my description" for going
          backwards inside the flow; a leave-the-flow link there would
          silently discard everything a founder had entered, which is worse
          than no exit. Because this lives in Step1Describe, which only
          renders on step 1, that constraint is structural rather than a
          conditional somebody can later get wrong.

          Bottom-anchored underlined text, matching this flow's own idiom
          for backwards controls, rather than a bar at the top: the top of
          /create is spoken for by Orbit's avatar and "STEP N OF 3", which
          the onboarding-share-moment slice has to build.

          Goes to /groups, the fixed parent, never "/": "/" is the
          session-aware front door (resolveFrontDoor), which sends a member
          of exactly one group straight INTO that group. /create is only
          ever reached from /groups (a member starting a second group) or
          from "/" (nobody with a group yet), and /groups itself redirects a
          zero-group visitor back to "/" on its own — so /groups is correct
          in every reachable case, while "/" would guess, and guess wrong,
          for the member who actually got here by tapping "Start a new
          group" and is now backing out
          (docs/superpowers/specs/2026-09-04-onboarding-nav-design.md). */}
      <Link
        href="/groups"
        style={{
          display: "block",
          width: "fit-content",
          margin: "1rem auto 0",
          padding: "0.25rem 0.5rem",
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          textDecoration: "underline",
        }}
      >
        Never mind, take me back
      </Link>
    </div>
  )
}
