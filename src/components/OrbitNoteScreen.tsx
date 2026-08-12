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

import Link from "next/link"
import { OrbitMark } from "@/components/OrbitMark"

interface Props {
  eyebrow: string
  note: string
  linkHref: string
  linkLabel: string
}

export default function OrbitNoteScreen({ eyebrow, note, linkHref, linkLabel }: Props) {
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
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "0.75rem",
          }}
        >
          {eyebrow}
        </p>

        {/* Orbit speaks here, unlike on the not-found and error screens: a
            real person is looking at a real screen, and a warm voice
            genuinely helps.

            A labeled note, not a bubble. CLAUDE.md allows a bubble only
            when the user's next on-screen action responds to Orbit, and
            there is nothing to reply to here, so a bubble would promise a
            conversation that cannot happen. Same treatment as the note on
            walkthrough screen 09. */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.625rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <OrbitMark size={20} label={null} />
            <span
              style={{
                fontSize: "var(--type-eyebrow)",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              A note from Orbit
            </span>
          </div>
          <p
            style={{
              fontSize: "var(--type-body)",
              lineHeight: "var(--leading-normal)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {note}
          </p>
        </div>

        {/* Points at /create rather than "/" so the label does exactly what
            it says. Step 1 of the wizard now has its own way out, so
            someone who would rather look around first is not trapped.
            Deliberately not teal: what this person wanted was something
            else, and teal would oversell a consolation prize. */}
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
      </div>
    </main>
  )
}
