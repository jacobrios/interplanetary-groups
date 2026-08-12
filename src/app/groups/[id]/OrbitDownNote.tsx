// src/app/groups/[id]/OrbitDownNote.tsx
//
// The quiet line only the sender sees when their message posted but Orbit
// could not read it (spec decision 7). Not a bubble (nothing to reply to),
// not an error color (the send succeeded), nothing stored: it lives in the
// sender's own client state and vanishes on reload, which matches what it
// describes, a service condition rather than a fact about the group.

import { CHAT_NOTE_COPY } from "@/lib/orbit/unavailable-copy"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"

export default function OrbitDownNote({ reason }: { reason: ModelFailureReason }) {
  return (
    <p
      role="status"
      style={{
        fontSize: "var(--type-meta)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        textAlign: "center",
        margin: "0 1rem 0.5rem",
      }}
    >
      {CHAT_NOTE_COPY[reason]}
    </p>
  )
}
