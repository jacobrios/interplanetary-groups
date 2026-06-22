// src/app/groups/[id]/CopyInviteLink.tsx
"use client"

import { useState } from "react"

interface Props {
  inviteToken: string
}

export default function CopyInviteLink({ inviteToken }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = `${window.location.origin}/join/${inviteToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        width: "100%",
        padding: "0.75rem 1.5rem",
        backgroundColor: "var(--color-teal)",
        color: "#0a0a0a",
        fontSize: "var(--type-body)",
        fontWeight: 600,
        border: "none",
        borderRadius: "0.5rem",
        cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : "Copy invite link"}
    </button>
  )
}
