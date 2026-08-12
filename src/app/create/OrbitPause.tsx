// src/app/create/OrbitPause.tsx
//
// The labeled model-call pause: Orbit's avatar plus a status line in its
// voice, never a bare spinner. Used by Step 1 (extraction) and the gap step
// (answer merge), each with copy naming what Orbit is actually doing.

"use client"

import { OrbitMark } from "@/components/OrbitMark"

interface Props {
  copy: string
}

export default function OrbitPause({ copy }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "2.75rem" }}>
      <OrbitMark size={28} label={null} />
      <p
        role="status"
        style={{
          fontSize: "var(--type-body)",
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
