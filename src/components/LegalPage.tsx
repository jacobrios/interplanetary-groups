// src/components/LegalPage.tsx
//
// The shell and the type grammar the privacy notice and the terms page both
// wear, so the two screens cannot drift apart and so each page file is
// almost entirely its own words. The copy is the deliverable on these two
// screens; the layout is not, and it should not be sitting in front of it
// twice.
//
// Nobody drew these screens. The shell is composed from pieces that were
// drawn, the same way /signin was: the group info page's sticky PageHeader
// with a BackLink, and the 28rem content column every screen in this
// product uses.
//
// NO TEAL ANYWHERE, deliberately. Teal marks an action that genuinely
// matters (CLAUDE.md, colour rules) and reading a policy is not one, so
// every link and every control on these two screens is a quiet text link.
//
// TWO WAYS BACK, which is one more than the rest of the product gives a
// screen, and the reason is the length of these pages rather than a lapse.
// The header's back link is the app's standard idiom and is the first thing
// on the page; it is also sticky, so it stays reachable while scrolling.
// The one at the very bottom exists for the person who actually read to the
// end on a phone, whose alternative is scrolling a policy page back to the
// top to leave it. Both point at the same place, so neither is a second
// destination to reason about.
//
// The destination is `/`, a fixed parent link and never browser history
// (CLAUDE.md, navigation), which is correct for the case that matters:
// somebody who arrived here from a texted link has no history to go back
// to. `/` is session-aware, so a member with a group lands in their group
// and a stranger lands on the pitch, which is the right answer for each.

import type { ReactNode } from "react"
import Link from "next/link"
import PageHeader from "@/components/PageHeader"
import BackLink from "@/components/BackLink"

export default function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-base)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PageHeader>
        <BackLink href="/" label="Interplanetary Groups" />
      </PageHeader>

      <div
        style={{
          padding: "0 24px 8px",
          width: "100%",
          maxWidth: "28rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--type-title)",
            fontWeight: 800,
            letterSpacing: "-0.01em",
            lineHeight: "var(--leading-tight)",
            color: "var(--text-primary)",
            textWrap: "balance",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--text-faint)",
          }}
        >
          Last updated {lastUpdated}
        </p>

        {children}

        <div style={{ marginTop: "auto", paddingTop: "32px", paddingBottom: "20px" }}>
          <Link
            href="/"
            style={{
              display: "block",
              width: "fit-content",
              margin: "0 auto",
              padding: "0.25rem 0.5rem",
              color: "var(--text-secondary)",
              fontSize: "var(--type-meta)",
              lineHeight: "var(--leading-normal)",
              textDecoration: "underline",
            }}
          >
            Back to Interplanetary Groups
          </Link>
        </div>
      </div>
    </main>
  )
}

/** A section heading plus its body. Headings are the page's only structure. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section style={{ marginTop: "26px" }}>
      <h2
        style={{
          margin: 0,
          fontSize: "var(--type-heading)",
          fontWeight: 700,
          lineHeight: "var(--leading-tight)",
          letterSpacing: "-0.005em",
          color: "var(--text-primary)",
          textWrap: "balance",
        }}
      >
        {heading}
      </h2>
      {children}
    </section>
  )
}

/**
 * Body copy. --type-body rather than --type-meta: this is the one thing on
 * the screen and it is long, so it gets the reading size the chat feed gets
 * and is never shrunk to fit more in.
 */
export function LegalText({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "11px 0 0",
        fontSize: "var(--type-body)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        textWrap: "pretty",
      }}
    >
      {children}
    </p>
  )
}

/** A list of points. Same size and colour as LegalText; the markers are the difference. */
export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        margin: "11px 0 0",
        paddingLeft: "1.15em",
        fontSize: "var(--type-body)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        listStyleType: "disc",
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        textWrap: "pretty",
      }}
    >
      {children}
    </ul>
  )
}

/** Emphasis inside body copy: brighter, not a different size and never a colour. */
export function LegalStrong({ children }: { children: ReactNode }) {
  return <strong style={{ color: "var(--text-primary)", fontWeight: 700 }}>{children}</strong>
}
