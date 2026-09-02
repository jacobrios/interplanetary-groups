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

  const canSubmit = founderName.trim().length > 0 && description.trim().length > 0

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
      {/* 1.25rem below, not the 2rem it was. See the vertical-budget note
          above the Continue button: this is one of the five cuts that got
          the consent line above the fold on the owner's phone, and this
          spacing is explicitly local to this screen rather than ported. */}
      <div style={{ marginTop: "1rem", marginBottom: "1.25rem" }}>
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
            htmlFor="founderName"
            style={fieldLabelStyle}
          >
            Your name
          </label>
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
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label
            htmlFor="description"
            style={fieldLabelStyle}
          >
            About your group
          </label>
          <textarea
            id="description"
            name="description"
            // FOUR ROWS, NOT FIVE, and minHeight rather than height, so this
            // stays a floor the field can grow past rather than a fixed box
            // (CLAUDE.md: layout grows with content, never clips). Measured
            // rather than guessed: the placeholder wraps to three lines and
            // needs 106.5px including padding and border, so 118px shows it
            // whole with room over, and resize: vertical below still lets a
            // founder drag it taller. This was the largest single cut in the
            // vertical budget described above the Continue button.
            rows={4}
            placeholder="e.g. A few of us climb at Summit Gym on Sunday mornings at 8, and we grab beers once a month."
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={isExtracting}
            style={{
              width: "100%",
              minHeight: "118px",
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
              // (round-2 review finding). Now 20px.
              //
              // THE VERTICAL BUDGET, 2 September 2026, owner QA, and the
              // whole point of it: the consent line under this button was
              // BELOW THE FOLD on his phone (iPhone 13 Pro in Chrome, which
              // gives the page 661 CSS pixels, not the 844 the device
              // advertises). A person agreeing to terms they cannot see is
              // the worst version of a consent line. Measured before: the
              // line ran 696px to 735px, so it started 35px past the fold.
              //
              // Five cuts got it to 613.5px to 652.5px, entirely above:
              // this gap 32 to 20, the description field 5 rows to 4 with a
              // 118px floor, display: block on that field to drop its 6px
              // inline-baseline gap, the gap above the description field
              // 1.25rem to 1rem, the bubble's own bottom margin 2rem to
              // 1.25rem, and the hint line losing its second sentence.
              // Nothing gained a fixed height and nothing clips.
              marginTop: "20px",
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
            marginTop: "11px",
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
        <div style={{ marginTop: "14px" }}>
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
          the onboarding-share-moment slice has to build. */}
      <Link
        href="/"
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
