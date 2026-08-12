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
import OrbitPause from "./OrbitPause"

const INTRO_COPY =
  "Hi, I'm Orbit. Tell me about your group. What do you do together, and when do you usually meet?"

const ERROR_COPY = "Hmm, that didn't go through. Give it another try in a moment."

const PAUSE_COPY = "One sec, I'm working out your schedule."

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
      {/* The one tailed bubble in the product: no avatar, left margin, small
          tail pointing up at the header (§7 onboarding exception). */}
      <div style={{ position: "relative", marginTop: "1rem", marginBottom: "2rem" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -9,
            left: 20,
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: "10px solid var(--surface-raised)",
          }}
        />
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            borderRadius: "16px",
            padding: "0.75rem 1rem",
          }}
        >
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {bubbleCopy}
          </p>
        </div>
      </div>

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label
            htmlFor="founderName"
            style={{
              display: "block",
              fontSize: "var(--type-label)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              marginBottom: "0.375rem",
            }}
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
              padding: "0.625rem 0.75rem",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--hairline)",
              borderRadius: "0.5rem",
              color: "var(--text-primary)",
              fontSize: "var(--type-body)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="description"
            style={{
              display: "block",
              fontSize: "var(--type-label)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              marginBottom: "0.375rem",
            }}
          >
            About your group
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            placeholder="e.g. A few of us climb at Summit Gym on Sunday mornings at 8, and we grab beers once a month."
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={isExtracting}
            style={{
              width: "100%",
              padding: "0.625rem 0.75rem",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--hairline)",
              borderRadius: "0.5rem",
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
          // mounted (disabled) so the founder's text is never lost.
          <OrbitPause copy={PAUSE_COPY} />
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "0.75rem 1.5rem",
              backgroundColor: "var(--action)",
              color: "#0a0a0a",
              fontSize: "var(--type-body)",
              fontWeight: 600,
              border: "none",
              borderRadius: "0.5rem",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
              marginTop: "0.5rem",
            }}
          >
            Continue
          </button>
        )}

        {/* Hint line below the primary action (mockup screen 01 position).
            Reference text: meta scale, secondary color, never an action.
            Rendered in the pause state too — it explains what Orbit is
            doing with the description either way. */}
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Orbit reads this to set your days, send reminders, and build a shared group page.
          Mention your usual spot too, if you have one.
        </p>
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
