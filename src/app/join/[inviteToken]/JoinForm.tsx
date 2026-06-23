// src/app/join/[inviteToken]/JoinForm.tsx
"use client"

import { useActionState } from "react"
import { joinGroupAction, type JoinGroupState } from "@/app/actions/join-group"

interface Props {
  groupName: string
  inviteToken: string
  currentName: string | null // null = new visitor; non-null = returning session
}

const initialState: JoinGroupState = {}

export default function JoinForm({ groupName, inviteToken, currentName }: Props) {
  const [state, formAction, isPending] = useActionState(joinGroupAction, initialState)

  return (
    <main
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--surface-page)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "28rem" }}>
        <h1
          style={{
            fontSize: "var(--type-display)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          Join {groupName}
        </h1>
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "2rem",
          }}
        >
          No sign-up needed. You can add an email later to keep access.
        </p>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Always include hidden inviteToken and hasSession flags */}
          <input type="hidden" name="inviteToken" value={inviteToken} />
          <input type="hidden" name="hasSession" value={currentName ? "1" : ""} />

          {state.errors?.general && (
            <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>
              {state.errors.general}
            </p>
          )}

          {/* NEW VISITOR — show editable name field */}
          {currentName === null ? (
            <div>
              <label
                htmlFor="memberName"
                style={{
                  display: "block",
                  fontSize: "var(--type-label)",
                  lineHeight: "var(--leading-normal)",
                  color: "var(--text-secondary)",
                  marginBottom: "0.375rem",
                }}
              >
                Your name
              </label>
              <input
                id="memberName"
                name="memberName"
                type="text"
                autoComplete="given-name"
                placeholder="e.g. Jordan"
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  backgroundColor: "var(--surface-input)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "0.5rem",
                  color: "var(--text-primary)",
                  fontSize: "var(--type-body)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {state.errors?.memberName && (
                <p
                  style={{
                    fontSize: "var(--type-meta)",
                    color: "#f87171",
                    marginTop: "0.25rem",
                  }}
                >
                  {state.errors.memberName}
                </p>
              )}
            </div>
          ) : (
            /* RETURNING SESSION — read-only "Joining as {name}" */
            <p
              style={{
                fontSize: "var(--type-body)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
              }}
            >
              Joining as{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                {currentName}
              </span>
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: "100%",
              padding: "0.75rem 1.5rem",
              backgroundColor: isPending ? "var(--color-teal-hover)" : "var(--color-teal)",
              color: "#0a0a0a",
              fontSize: "var(--type-body)",
              fontWeight: 600,
              border: "none",
              borderRadius: "0.5rem",
              cursor: isPending ? "not-allowed" : "pointer",
              marginTop: "0.5rem",
            }}
          >
            {isPending ? "Joining…" : `Join ${groupName}`}
          </button>
        </form>
      </div>
    </main>
  )
}
