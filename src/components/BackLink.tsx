// src/components/BackLink.tsx
//
// The child-screen header content: a left chevron and the name of the parent
// you are going back to, as drawn on walkthrough screens 09 and 10
// ("‹ Climbing Crew").
//
// The destination is a fixed parent link, never browser-history back. History
// back is unpredictable in exactly the case that matters: arrive at an event
// from a shared invite link and it throws you out of the product entirely.

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
        gap: "0.375rem",
        textDecoration: "none",
        color: "var(--text-secondary)",
        fontSize: "var(--type-body)",
      }}
    >
      <Chevron direction="left" />
      {label}
    </Link>
  )
}
