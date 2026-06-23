// src/app/events/[id]/RsvpControls.tsx
"use client"

import { useActionState } from "react"
import { rsvpAction, type RsvpState } from "@/app/actions/rsvp"
import { RsvpStatus } from "@prisma/client"

interface Props {
  eventId: string
  /** The viewer's current RSVP status, or null if they have not yet responded. */
  currentStatus: RsvpStatus | null
}

const initialState: RsvpState = {}

/**
 * Two-button RSVP form colocated with the event card.
 *
 * Button treatment per CLAUDE.md §color:
 * - "I'm in": always the teal primary (one teal action per screen).  A checkmark
 *   prefix shows when IN is the current choice.
 * - "Can't make it": always outlined secondary; soft-decline copy per §copy rules.
 *   A checkmark prefix shows when OUT is the current choice.
 *
 * Active state is indicated by the checkmark prefix — never by color alone.  This
 * satisfies the accessibility rule (§7: red/green colorblind product owner).
 *
 * Both buttons are disabled while the action is pending, so a double-tap cannot
 * produce a race.  The form stays on the event page after submission; revalidatePath
 * in the action re-renders the server component with the fresh RSVP state.
 */
export default function RsvpControls({ eventId, currentStatus }: Props) {
  const [state, formAction, isPending] = useActionState(rsvpAction, initialState)

  return (
    <form action={formAction}>
      <input type="hidden" name="eventId" value={eventId} />

      {state.errors?.general && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            marginBottom: "0.75rem",
          }}
        >
          {state.errors.general}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.625rem" }}>
        {/* Primary action — teal fill, one per screen */}
        <button
          type="submit"
          name="status"
          value={RsvpStatus.IN}
          disabled={isPending}
          style={{
            flex: 1,
            padding: "0.625rem 1rem",
            backgroundColor: isPending ? "var(--color-teal-hover)" : "var(--color-teal)",
            color: "#0a0a0a",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "none",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {currentStatus === RsvpStatus.IN ? "✓ I'm in" : "I'm in"}
        </button>

        {/* Secondary action — outlined, transparent fill */}
        <button
          type="submit"
          name="status"
          value={RsvpStatus.OUT}
          disabled={isPending}
          style={{
            flex: 1,
            padding: "0.625rem 1rem",
            backgroundColor:
              currentStatus === RsvpStatus.OUT ? "var(--surface-input)" : "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-label)",
            fontWeight: currentStatus === RsvpStatus.OUT ? 600 : 400,
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {currentStatus === RsvpStatus.OUT ? "✓ Can't make it" : "Can't make it"}
        </button>
      </div>
    </form>
  )
}
