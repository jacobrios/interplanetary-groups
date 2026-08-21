"use client"

import { useState, useTransition } from "react"
import { leaveGroupAction } from "@/app/actions/leave-group"

interface Props {
  groupId: string
  groupName: string
}

/**
 * The outlined Leave button at the bottom of the info page, members only
 * (the page never renders it for the founder or a non-member).
 *
 * Leaving takes two taps by design (spec, "The actions"): the first opens a
 * warm confirm in place ("You can always rejoin with the invite link", the
 * settled §4 copy), never a browser confirm() and never an instant delete.
 * The destructive confirm is outlined in the error red already used for
 * error text, with its label carrying the meaning (never color alone).
 *
 * On success the action redirects to "/" server-side, so this component
 * only handles the error return.
 */
export default function LeaveGroupButton({ groupId, groupName }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      const result = await leaveGroupAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
      // On success the action redirected; nothing to do here.
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          width: "100%",
          // Floor, not a fixed height (CLAUDE.md: layout grows with
          // content, never clips) — 46px per .gi-leave at default text.
          minHeight: "46px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.75rem 1.5rem",
          backgroundColor: "transparent",
          color: "var(--text-primary)",
          fontSize: "var(--type-label)",
          fontWeight: 600,
          border: "1.7px solid var(--hairline)",
          borderRadius: "24px",
          cursor: "pointer",
        }}
      >
        Leave group
      </button>
    )
  }

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--hairline)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <p
        style={{
          fontSize: "var(--type-body)",
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: "var(--leading-tight)",
        }}
      >
        Leave {groupName}?
      </p>
      <p
        style={{
          fontSize: "var(--type-meta)",
          color: "var(--text-secondary)",
          lineHeight: "var(--leading-normal)",
        }}
      >
        You can always rejoin with the invite link.
      </p>

      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "var(--danger)" }}>{errorMsg}</p>
      )}

      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        <button
          onClick={handleConfirm}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: "8rem",
            padding: "0.625rem 1rem",
            backgroundColor: "transparent",
            color: "var(--danger)",
            fontSize: "var(--type-label)",
            fontWeight: 600,
            border: "1px solid var(--danger)",
            borderRadius: "0.5rem",
            cursor: isPending ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Leaving…" : "Leave group"}
        </button>
        <button
          onClick={() => {
            setConfirming(false)
            setErrorMsg(null)
          }}
          disabled={isPending}
          style={{
            flex: 1,
            minWidth: "8rem",
            padding: "0.625rem 1rem",
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
