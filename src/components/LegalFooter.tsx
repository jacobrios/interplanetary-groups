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
import { visuallyHiddenStyle } from "@/components/visually-hidden"

const linkStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  textDecoration: "underline",
}

/**
 * A consent link, and the one thing that separates the two shapes in this
 * file: it opens in a new tab.
 *
 * WHY, and it is a real bug rather than a convention borrowed for its own
 * sake (owner QA, 2 September 2026). He tapped Terms from create step 1,
 * then the back control, and landed on his groups list rather than back in
 * the wizard. Had he already typed a group description it would have been
 * gone. Reading the terms before agreeing to them must never cost somebody
 * their work.
 *
 * WHY NOT router.back(): back links in this product are fixed parent links
 * and never browser history (CLAUDE.md, navigation), because somebody
 * arriving from a shared link has no history behind them. That rule is not
 * bent here; the tab is simply never left in the first place.
 *
 * The footer shape deliberately does NOT do this. Nothing is lost by leaving
 * the front door or the group info page, and a footer that spawned tabs
 * would be the annoying version of the same convention.
 *
 * The "(opens in a new tab)" text is visually hidden rather than absent: a
 * sighted person gets the new tab itself as feedback, and somebody on a
 * screen reader gets nothing at all unless the link's own name says so.
 */
function ConsentLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {children}
      <span style={visuallyHiddenStyle}> (opens in a new tab)</span>
    </Link>
  )
}

/**
 * The line both shapes are set in, shared rather than written twice.
 *
 * The whole reason these two live in one file is that they cannot be allowed
 * to drift; two byte-identical style objects with nothing joining them was
 * exactly the drift this module exists to prevent, one level down from the
 * routes (review, fix round 1). Eyebrow floor, --text-faint, centred.
 */
const lineStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: "var(--type-eyebrow)",
  lineHeight: "var(--leading-normal)",
  color: "var(--text-faint)",
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
    <p style={lineStyle}>
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
    <p style={lineStyle}>
      By {action} you agree to the <ConsentLink href="/terms">Terms</ConsentLink> and
      the <ConsentLink href="/privacy">Privacy notice</ConsentLink>.
    </p>
  )
}
