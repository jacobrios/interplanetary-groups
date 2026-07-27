// src/app/error.tsx
//
// Catches any render error below the root layout. Next requires this to be a
// client component, because it receives a reset() callback.
//
// No global-error.tsx: that would additionally cover a crash inside the root
// layout itself, which is a few lines of font wiring, so the uncovered case
// is close to theoretical. Recorded in the spec rather than covered.

"use client"

import Link from "next/link"
import DeadEndScreen from "@/components/DeadEndScreen"

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <DeadEndScreen
      heading="Something broke on our end."
      body="Not your fault. Try again, and if it keeps happening, give it a minute."
    >
      <button
        type="button"
        onClick={reset}
        style={{
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "var(--color-teal)",
          color: "#0a0a0a",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
      <Link
        href="/"
        style={{
          display: "block",
          width: "100%",
          padding: "0.75rem 1.5rem",
          backgroundColor: "transparent",
          color: "var(--text-primary)",
          fontSize: "var(--type-body)",
          border: "1px solid var(--border-subtle)",
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
