"use client"

import { useState, useTransition } from "react"
import { removeMemberAction } from "@/app/actions/remove-member"

interface Member {
  id: string
  name: string
}

interface Props {
  groupId: string
  founderId: string
  members: Member[] // founder first, then join order (the page orders them)
}

/**
 * The founder's view of the WHO row (spec decision 4): identical to what
 * everyone sees (dot-separated names) plus one quiet "Manage members" text
 * link. Manage mode flips to stacked rows with a soft Remove per member;
 * the founder's own row never gets one (spec decision 6's backstop is the
 * lib, this is the UI half). Removing takes a confirm naming the person
 * (spec, "The actions"); errors surface inline.
 *
 * Non-founders never receive this component; the page renders the static
 * names for them, so this file can stay purely a founder concern.
 */
export default function ManageMembers({ groupId, founderId, members }: Props) {
  const [managing, setManaging] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRemove(targetUserId: string) {
    startTransition(async () => {
      setErrorMsg(null)
      const formData = new FormData()
      formData.set("groupId", groupId)
      formData.set("targetUserId", targetUserId)
      const result = await removeMemberAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      } else {
        // Success: revalidatePath refreshes the server-rendered list; drop
        // the confirm so the refreshed row set renders clean.
        setConfirmingId(null)
      }
    })
  }

  if (!managing) {
    return (
      <span>
        {members.map((m, i) => (
          <span key={m.id}>
            {i > 0 && <span style={{ color: "var(--text-placeholder)" }}>{" · "}</span>}
            {m.name}
          </span>
        ))}
        {"  "}
        <button
          onClick={() => setManaging(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--text-secondary)",
            fontSize: "var(--type-meta)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Manage members
        </button>
      </span>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {errorMsg && (
        <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>{errorMsg}</p>
      )}

      {members.map((m) => (
        <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "var(--type-body)", color: "var(--text-primary)" }}>
              {m.name}
            </span>
            {m.id !== founderId && confirmingId !== m.id && (
              <button
                onClick={() => setConfirmingId(m.id)}
                disabled={isPending}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--text-secondary)",
                  fontSize: "var(--type-meta)",
                  textDecoration: "underline",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                Remove
              </button>
            )}
          </div>

          {confirmingId === m.id && (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <p
                style={{
                  fontSize: "var(--type-meta)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Remove {m.name} from the group?
              </p>
              <p style={{ fontSize: "var(--type-meta)", color: "var(--text-secondary)" }}>
                They can rejoin with the invite link.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={isPending}
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "transparent",
                    color: "#f87171",
                    fontSize: "var(--type-label)",
                    fontWeight: 600,
                    border: "1px solid #f87171",
                    borderRadius: "0.5rem",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={isPending}
                  style={{
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                    fontSize: "var(--type-label)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "0.5rem",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={() => {
          setManaging(false)
          setConfirmingId(null)
          setErrorMsg(null)
        }}
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
        Done
      </button>
    </div>
  )
}
