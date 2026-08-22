"use client"

import { useState, useTransition } from "react"
import { resetInviteLinkAction } from "@/app/actions/reset-invite-link"

interface Props {
  groupId: string
}

/**
 * The quiet founder-only affordance under the invite block (spec decision 4).
 * Reset kills the old link everywhere immediately (spec decision 9), so the
 * confirm names exactly that consequence before anything happens. On success
 * revalidatePath re-renders the page and the pill shows the new URL; this
 * component only handles asking and errors.
 */
export default function ResetInviteLink({ groupId }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleReset() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      const result = await resetInviteLinkAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      } else {
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Reset link
      </button>
    )
  }

  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <p style={{ fontSize: "var(--type-meta)", fontWeight: 600, color: "var(--text-primary)" }}>
        Reset the invite link?
      </p>
      <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
        The old link will stop working everywhere it's been shared.
      </p>

      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "var(--danger)" }}>{errorMsg}</p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          onClick={handleReset}
          disabled={isPending}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "transparent",
            color: "var(--danger)",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "1px solid var(--danger)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Resetting…" : "Yes, reset it"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: "var(--type-label)",
            border: "1px solid var(--hairline)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
