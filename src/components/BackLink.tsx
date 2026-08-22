// src/components/BackLink.tsx
//
// The child-screen header content: a left chevron and the name of the parent
// you are going back to, as drawn on walkthrough screens 09 and 10
// ("‹ Climbing Crew").
//
// The destination is a fixed parent link, never browser-history back. History
// back is unpredictable in exactly the case that matters: arrive at an event
// from a shared invite link and it throws you out of the product entirely.
//
// Type values ported from walkthrough.css .ed-back (task 3 of visual-polish-3):
// --type-label, fontWeight 600, an 18px chevron, gap 5px. This is a shared
// component (the group info page and the event detail page both render it
// through PageHeader), so the change lands everywhere BackLink appears, not
// only on the event screen this task otherwise scopes to — see
// task-3-report.md for the structural note on the design's own inline
// .ed-back (drawn in the scroll region), which PageHeader's recorded
// ownership of the bar overrides.

import Link from "next/link"
import Chevron from "./Chevron"

export default function BackLink({
  href,
  label,
}: {
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        textDecoration: "none",
        color: "var(--text-secondary)",
        fontSize: "var(--type-label)",
        fontWeight: 600,
      }}
    >
      <Chevron direction="left" size={18} />
      {label}
    </Link>
  )
}
