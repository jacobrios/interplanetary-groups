// src/app/events/[id]/RsvpControls.tsx
"use client"
import { useOptimistic, useTransition, useState } from "react"
import { rsvpAction } from "@/app/actions/rsvp"
import { RsvpStatus } from "@prisma/client"

interface Props {
  eventId: string
  /** The viewer's current RSVP status, or null if they have not yet responded. */
  currentStatus: RsvpStatus | null
  /**
   * When true, renders tighter padding suitable for the compact home-screen
   * card.  Default false renders the full detail-page sizing.
   */
  compact?: boolean
  /**
   * When provided (home-screen card), triggers an additional revalidatePath
   * for the group home route on successful write so that the card's counts
   * reflect the change on hard reload.  Omit from the event-detail caller.
   */
  groupId?: string
}

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
 * Optimistic update: the button flips instantly on tap, before the server responds.
 * useOptimistic reverts to currentStatus (the server-derived prop) automatically if
 * the transition settles without a matching revalidatePath — i.e. on write failure.
 * The error message from the action is surfaced; a silently-wrong button is never left.
 *
 * Both buttons are disabled while the action is pending, preventing a double-tap from
 * starting a conflicting in-flight write.
 */
export default function RsvpControls({ eventId, currentStatus, compact = false, groupId }: Props) {
  // Displayed status: flips instantly on tap; reverts to currentStatus on write failure.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("status") as RsvpStatus
      // Clear any prior error and flip the button immediately — before the round trip.
      setErrorMsg(null)
      setOptimisticStatus(next)
      // Await the server action directly so optimisticStatus persists for the whole
      // round trip (the documented useOptimistic + useTransition pattern from the
      // Next.js forms guide).  On success, revalidatePath re-renders the page and
      // currentStatus updates to match; optimistic and real values agree with no
      // flicker.  On failure, the action returns errors and skips revalidatePath, so
      // currentStatus stays unchanged; useOptimistic reverts automatically and
      // errorMsg is shown.  A silently-wrong button is never left.
      const result = await rsvpAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  // Padding scales between compact (home card) and full (event detail).
  const btnPadding = compact ? "0.375rem 0.75rem" : "0.625rem 1rem"

  return (
    <form action={handle}>
      <input type="hidden" name="eventId" value={eventId} />
      {/* groupId is optional — present only when RSVPing from the home card.
          The action uses it to also revalidate the home route on success. */}
      {groupId && <input type="hidden" name="groupId" value={groupId} />}

      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            marginBottom: "0.75rem",
          }}
        >
          {errorMsg}
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
            padding: btnPadding,
            backgroundColor: isPending ? "var(--color-teal-hover)" : "var(--color-teal)",
            color: "#0a0a0a",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "none",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {optimisticStatus === RsvpStatus.IN ? "✓ I'm in" : "I'm in"}
        </button>

        {/* Secondary action — outlined, transparent fill */}
        <button
          type="submit"
          name="status"
          value={RsvpStatus.OUT}
          disabled={isPending}
          style={{
            flex: 1,
            padding: btnPadding,
            backgroundColor:
              optimisticStatus === RsvpStatus.OUT ? "var(--surface-input)" : "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-label)",
            fontWeight: optimisticStatus === RsvpStatus.OUT ? 600 : 400,
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {optimisticStatus === RsvpStatus.OUT ? "✓ Can't make it" : "Can't make it"}
        </button>
      </div>
    </form>
  )
}
