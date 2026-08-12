// src/components/RsvpControls.tsx
"use client"
//
// The RSVP pair, rebuilt as an honest ask-and-answer control (spec decisions
// 1-3, closing the 12 Aug QA dark-pattern finding): while unanswered, both
// options are transparent with the action teal on BOTH borders, so the teal
// marks the question and leans toward neither answer; the chosen option
// fills teal with ink text and a checkmark, and the other drops to a quiet
// hairline. Same treatment on either side; a teal-filled "Can't make it" is
// the member's own settled answer, not a recommendation.
//
// Optimistic pattern unchanged from the original: the button flips
// instantly, useOptimistic reverts on write failure, the error line is
// surfaced, both buttons disable while a write is in flight (dimmed 0.65,
// no transition; this product ships no animation).
//
// Shared out of events/[id]/ because the group-home card renders it too;
// the old location was flagged tech debt from the day it was written.

import { useOptimistic, useTransition, useState } from "react"
import { rsvpAction } from "@/app/actions/rsvp"
import { RsvpStatus } from "@prisma/client"
import { ErrorLine, RsvpOption } from "./choice"

interface Props {
  eventId: string
  /** The viewer's current RSVP status, or null if they have not yet responded. */
  currentStatus: RsvpStatus | null
  /** Tighter padding for the compact home-screen card. */
  compact?: boolean
  /** Home-card callers pass this so the action revalidates the home route too. */
  groupId?: string
}

export default function RsvpControls({ eventId, currentStatus, compact = false, groupId }: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("status") as RsvpStatus
      setErrorMsg(null)
      setOptimisticStatus(next)
      const result = await rsvpAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  // Geometry as shipped (round5 handoff: "geometry as shipped"); only the
  // state dress changed. The 1.5px border is now part of the state grammar
  // on both surfaces, superseding the old compact-only out-border note.
  const btnPadding = compact ? "0.375rem 0.75rem" : "0.625rem 1rem"
  const btnRadius = compact ? "24px" : "0.5rem"
  const rowGap = compact ? "0.6em" : "0.625rem"

  const stateFor = (own: RsvpStatus): "ask" | "pick" | "other" => {
    if (optimisticStatus === null) return "ask"
    return optimisticStatus === own ? "pick" : "other"
  }

  return (
    <form action={handle}>
      <input type="hidden" name="eventId" value={eventId} />
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      {errorMsg && (
        <div style={{ marginBottom: "0.75rem" }}>
          <ErrorLine msg={errorMsg} />
        </div>
      )}
      <div style={{ display: "flex", gap: rowGap, flexWrap: "wrap" }}>
        <RsvpOption
          value={RsvpStatus.IN}
          label="I'm in"
          state={stateFor(RsvpStatus.IN)}
          disabled={isPending}
          padding={btnPadding}
          radius={btnRadius}
        />
        <RsvpOption
          value={RsvpStatus.OUT}
          label="Can't make it"
          state={stateFor(RsvpStatus.OUT)}
          disabled={isPending}
          padding={btnPadding}
          radius={btnRadius}
        />
      </div>
    </form>
  )
}
