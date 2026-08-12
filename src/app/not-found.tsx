// src/app/not-found.tsx
//
// Catches all three notFound() calls in the app: an unknown group id
// (groups/[id] and groups/[id]/info) and an unknown event id (events/[id]).
//
// One generic page rather than per-segment ones, decided rather than
// defaulted: the copy is honest about all three cases and it is one file
// instead of three. A later slice can split it without wondering whether the
// single page was an oversight.
//
// Known limit, recorded in the spec: this page cannot tell "that event was
// cancelled" from "that URL is wrong", because the product does not keep
// cancelled events. Hence the neutral wording.

import Link from "next/link"
import DeadEndScreen from "@/components/DeadEndScreen"

export default function NotFound() {
  return (
    <DeadEndScreen
      heading="That page isn't here."
      body="It might have been removed, or the link might have a typo in it."
    >
      <Link
        href="/"
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "var(--action)",
          color: "var(--action-ink)",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          borderRadius: "0.5rem",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Take me home
      </Link>
    </DeadEndScreen>
  )
}
