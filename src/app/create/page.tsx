// src/app/create/page.tsx
"use client"

import { useActionState } from "react"
import { createGroupAction } from "@/app/actions/create-group"
import type { CreateGroupState } from "@/app/actions/create-group"

const initialState: CreateGroupState = {}

export default function CreateGroupPage() {
  const [state, formAction, isPending] = useActionState(createGroupAction, initialState)

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
          Start your group
        </h1>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            marginBottom: "2rem",
          }}
        >
          No sign-up needed. You can add an email later to keep access.
        </p>

        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {state.errors?.general && (
            <p style={{ fontSize: "var(--type-meta)", color: "#f87171" }}>
              {state.errors.general}
            </p>
          )}

          <div>
            <label
              htmlFor="founderName"
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
              id="founderName"
              name="founderName"
              type="text"
              autoComplete="given-name"
              placeholder="e.g. Taylor"
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
            {state.errors?.founderName && (
              <p style={{ fontSize: "var(--type-meta)", color: "#f87171", marginTop: "0.25rem" }}>
                {state.errors.founderName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="groupName"
              style={{
                display: "block",
                fontSize: "var(--type-label)",
                lineHeight: "var(--leading-normal)",
                color: "var(--text-secondary)",
                marginBottom: "0.375rem",
              }}
            >
              Group name
            </label>
            <input
              id="groupName"
              name="groupName"
              type="text"
              placeholder="e.g. Thursday Climbers"
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
            {state.errors?.groupName && (
              <p style={{ fontSize: "var(--type-meta)", color: "#f87171", marginTop: "0.25rem" }}>
                {state.errors.groupName}
              </p>
            )}
          </div>

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
            {isPending ? "Creating…" : "Create group"}
          </button>
        </form>
      </div>
    </main>
  )
}
