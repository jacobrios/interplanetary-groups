// src/components/LegalFooter.tsx
//
// The one pair of links to /privacy and /terms, and the two shapes those
// links take. Four screens need them and none of them should be writing
// their own copy of a route, which is exactly what src/components/ is for.
//
// TWO EXPORTS IN ONE FILE, on purpose. The pair of links is the shared
// thing; the surrounding sentence is not. A footer on a screen somebody is
// only reading (the front door, the group info page) is a quiet way to find
// the pages. A consent line on a screen where somebody is about to hand
// something over (joining a group, starting one) has to say what agreeing
// means, and it sits beside the action rather than at the bottom of the
// page. Splitting them into two files would let the two drift onto two
// different routes, which is the failure this module exists to prevent.
//
// NEITHER SHAPE CARRIES TEAL. Teal marks an action that genuinely matters
// (CLAUDE.md, colour rules), and reading a policy is not one. The links are
// --text-secondary against --text-faint prose, the same brighter-half signal
// the front door's "Been here before?" note already uses, with an underline
// doing the rest.
//
// This component owns the links and nothing about its surroundings: no
// outer margin, no width, no alignment beyond centring its own text. Every
// caller wraps it in whatever spacing that screen's rhythm asks for.

import Link from "next/link"

const linkStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  textDecoration: "underline",
}

/**
 * The quiet footer: two links, centred, at the eyebrow floor.
 *
 * The separator dot binds to the end of the first link rather than sitting
 * loose between them (CLAUDE.md, separator dots), so a wrapped line always
 * starts with a word instead of a dot. It is hidden from assistive
 * technology, which reads the two links as two links regardless.
 */
export default function LegalFooter() {
  return (
    <p
      style={{
        margin: 0,
        textAlign: "center",
        fontSize: "var(--type-eyebrow)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-faint)",
      }}
    >
      <span style={{ whiteSpace: "nowrap" }}>
        <Link href="/privacy" style={linkStyle}>
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
      </span>
      <Link href="/terms" style={linkStyle}>
        Terms
      </Link>
    </p>
  )
}

/**
 * The consent line, for the two screens where somebody is about to hand
 * something over. `action` is the caller's own verb phrase ("joining",
 * "starting a group"), because the sentence has to name the thing the
 * person is actually doing and only the screen knows that.
 *
 * "the Terms" and "the Privacy notice", not "our": this is one person's
 * project rather than a company, and the pages themselves say so.
 */
export function LegalConsentLine({ action }: { action: string }) {
  return (
    <p
      style={{
        margin: 0,
        textAlign: "center",
        fontSize: "var(--type-eyebrow)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-faint)",
      }}
    >
      By {action} you agree to the{" "}
      <Link href="/terms" style={linkStyle}>
        Terms
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" style={linkStyle}>
        Privacy notice
      </Link>
      .
    </p>
  )
}
