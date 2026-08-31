// src/components/OrbitNoteScreen.tsx
//
// A whole screen whose entire content is one labeled note from Orbit plus one
// quiet way onward. Two screens need exactly this: a bad invite token, and the
// members-only wall. A labeled note, never a bubble (CLAUDE.md): there is
// nothing on these screens to reply to.
//
// This component owns the shell and the note treatment and nothing about which
// screen is using it, the same boundary PageHeader draws: no opinion about the
// copy, so neither caller's wording can leak into the other's.

import type { ReactNode } from "react"
import Link from "next/link"
import { OrbitMark } from "@/components/OrbitMark"
import { buttonStyle } from "@/components/pill-controls"

interface Props {
  // ReactNode rather than string as of 31 Aug 2026 (owner QA on PR #91): the
  // members-only wall needs to bold one sentence inside its note (see
  // MembersOnlyWall.tsx), which a plain string cannot express. A plain
  // string is still a valid ReactNode, so the bad-invite-token screen, this
  // component's other caller, passes one unchanged and renders exactly as
  // it did before this widened.
  note: ReactNode
  linkHref: string
  linkLabel: string
  // "text" (default) is the original quiet treatment: deliberately not
  // teal, for a caller whose primary link is a consolation prize rather
  // than the thing the visitor actually wanted (the bad-invite-token
  // screen's "Start your own group"). "button" renders the same teal pill
  // the /signin screen submits with (src/components/pill-controls.ts),
  // for a caller whose primary link IS the genuinely important action
  // (the members-only wall's "Sign in": CLAUDE.md's colour rule, teal
  // marks a weight that matters, never a secondary or incidental action).
  linkVariant?: "text" | "button"
  // Optional second, quieter way onward. Added for the members-only wall,
  // which needs both a real door back in (sign-in) and a secondary option
  // for a genuine stranger (start a group of their own). The bad-invite-
  // token screen, this component's only other caller, has one link and
  // passes nothing here, so it renders exactly as it did before.
  secondaryLinkHref?: string
  secondaryLinkLabel?: string
}

export default function OrbitNoteScreen({
  note,
  linkHref,
  linkLabel,
  linkVariant = "text",
  secondaryLinkHref,
  secondaryLinkLabel,
}: Props) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        {/* Orbit speaks here, unlike on the not-found and error screens: a
            real person is looking at a real screen, and a warm voice
            genuinely helps.

            A labeled note, not a bubble. CLAUDE.md allows a bubble only
            when the user's next on-screen action responds to Orbit, and
            there is nothing to reply to here, so a bubble would promise a
            conversation that cannot happen.

            Ported from the drawn source, `.ed-slip` (walkthrough.css lines
            456-459): the mark sits absolutely positioned in the padding
            inset so the label and body run full width beside it, rather
            than stacked above it. The outer eyebrow that used to precede
            this box is deleted (owner, 21 Aug): it restated this note's
            own opening clause, so the screen said "invite-only" (or
            "invite link") twice within about fifteen words. */}
        <div
          style={{
            position: "relative",
            border: "1.6px solid var(--hairline)",
            borderRadius: "12px",
            padding: "14px 14px 12px 48px",
            backgroundColor: "var(--surface-raised)",
          }}
        >
          <div style={{ position: "absolute", left: "11px", top: "12px" }}>
            <OrbitMark size={28} label={null} />
          </div>
          <span
            style={{
              display: "block",
              fontSize: "var(--type-eyebrow)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              fontWeight: 700,
              marginBottom: "3px",
            }}
          >
            A note from Orbit
          </span>
          <p
            style={{
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {note}
          </p>
        </div>

        {/* Destination and label are entirely the caller's: the bad-invite-
            token screen points this at /create ("Start your own group"),
            since step 1 of the wizard now has its own way out, so someone
            who would rather look around first is not trapped, and stays
            on the quiet "text" variant, deliberately not teal: what this
            person wanted was something else, and teal would oversell a
            consolation prize. The members-only wall points this at
            /signin ("Sign in") on the "button" variant instead, because
            that IS the thing this visitor actually wants: the real door
            back in for a member who lost their session. */}
        {linkVariant === "button" ? (
          <Link href={linkHref} style={{ ...buttonStyle(false), marginTop: "1.25rem" }}>
            {linkLabel}
          </Link>
        ) : (
          <Link
            href={linkHref}
            style={{
              display: "block",
              width: "fit-content",
              margin: "1.25rem auto 0",
              padding: "0.25rem 0.5rem",
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              textDecoration: "underline",
            }}
          >
            {linkLabel}
          </Link>
        )}

        {/* Quieter still than the link above: a secondary way onward for
            whoever does not want the first one. Smaller, dimmer, and less
            spaced from its neighbor, so hierarchy reads from weight alone
            rather than a competing color (CLAUDE.md: teal marks a weight,
            never a count, and this is deliberately not that). */}
        {secondaryLinkHref && secondaryLinkLabel && (
          <Link
            href={secondaryLinkHref}
            style={{
              display: "block",
              width: "fit-content",
              margin: "0.5rem auto 0",
              padding: "0.25rem 0.5rem",
              color: "var(--text-faint)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              textDecoration: "underline",
            }}
          >
            {secondaryLinkLabel}
          </Link>
        )}
      </div>
    </main>
  )
}
