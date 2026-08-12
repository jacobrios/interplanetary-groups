// src/app/create/Step3Share.tsx
//
// Onboarding Step 3 (mockup 04): hand the founder the invite link at peak
// setup momentum. The group already exists when this renders, so there is no
// back affordance (recorded deviation from the mockup, spec decision). The
// display URL and the share button both build the link client-side from
// window.location.origin, so the server never needs to know its own host.

"use client"

import { useRouter } from "next/navigation"
import ShareInviteLink from "@/components/ShareInviteLink"
import { OrbitBubble } from "@/components/OrbitBubble"
import Chevron from "@/components/Chevron"

// Product-voice rule: no em dashes (the mockup's line carried one).
const ORBIT_COPY =
  "Here's your invite link. Send it to anyone you want. They just tap to join, and you can share it again anytime from inside your group. Ready? Head in below."

interface Props {
  groupId: string
  inviteToken: string
  groupName: string
}

export default function Step3Share({ groupId, inviteToken, groupName }: Props) {
  const router = useRouter()
  // Mounted only after confirm, so window exists; the guard keeps any future
  // SSR path from crashing rather than serving this component.
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/join/${inviteToken}`

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      <div
        style={{
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--hairline)",
          borderRadius: "0.875rem",
          padding: "0.875rem 1rem 1rem",
          marginBottom: "1.5rem",
        }}
      >
        <p
          style={{
            fontSize: "var(--type-heading)",
            lineHeight: "var(--leading-tight)",
            fontWeight: 700,
            margin: 0,
            paddingBottom: "0.5rem",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          {groupName}
        </p>
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 700,
            margin: "0.75rem 0 0.5rem",
          }}
        >
          Group invite link
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            border: "1px solid var(--hairline)",
            borderRadius: "0.625rem",
            backgroundColor: "var(--surface-base)",
            padding: "0.6875rem 0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span
            style={{
              fontSize: "var(--type-label)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {url}
          </span>
        </div>
        <ShareInviteLink inviteToken={inviteToken} groupName={groupName} />
      </div>

      <OrbitBubble>
        <p
          style={{
            fontSize: "var(--type-body)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {ORBIT_COPY}
        </p>
      </OrbitBubble>

      <button
        onClick={() => router.push(`/groups/${groupId}`)}
        style={{
          width: "100%",
          marginTop: "1.5rem",
          minHeight: "3.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          backgroundColor: "transparent",
          border: "1px solid var(--hairline)",
          borderRadius: "1.75rem",
          color: "var(--text-primary)",
          fontSize: "var(--type-body)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Take me to my group <Chevron direction="right" />
      </button>
      <p
        style={{
          textAlign: "center",
          fontSize: "var(--type-eyebrow)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text-secondary)",
          margin: "0.5rem 0 0",
        }}
      >
        You can invite people now or anytime later
      </p>
    </div>
  )
}
