// src/app/create/OrbitPause.tsx
//
// The labeled model-call pause: Orbit's avatar plus a status line in its
// voice, never a bare spinner. Used by Step 1 (extraction) and the gap step
// (answer merge), each with copy naming what Orbit is actually doing.
//
// Task 8 tune-up (18 Aug 2026): no drawn design exists for this state, so
// the product owner ruled the shape stays exactly as-is (mark plus one
// status line, role="status" preserved) and only spacing and text voice get
// harvested from the wizard's own established idioms. The avatar-to-text
// gap now matches OrbitBubble's avatar-to-content gap (the only other
// mark-plus-text row in the wizard), and the line now sits at the meta
// scale the wizard already uses for its own quiet/reference text (Step1's
// hint line, Step2's timezone line), rather than full body scale.

"use client"

import { OrbitMark } from "@/components/OrbitMark"

interface Props {
  copy: string
}

export default function OrbitPause({ copy }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px", minHeight: "2.75rem" }}>
      <OrbitMark size={28} label={null} />
      <p
        role="status"
        style={{
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        {copy}
      </p>
    </div>
  )
}
