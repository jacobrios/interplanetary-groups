"use client"

import { useState } from "react"

interface Props {
  inviteToken: string
  groupName: string
}

/**
 * One teal button, two behaviors (spec decision 10): the native share sheet
 * where the browser has one (phones), clipboard copy with "Copied!" feedback
 * where it does not (desktop). Successor to CopyInviteLink, whose copy
 * behavior this absorbs; the full URL is built client-side from
 * window.location.origin, same as before, so the server never needs to know
 * its own host.
 */
export default function ShareInviteLink({ inviteToken, groupName }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = `${window.location.origin}/join/${inviteToken}`
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: groupName, url })
      } catch {
        // Dismissed the sheet or share failed; nothing to clean up.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (permissions or non-secure context). The link text
      // is visible on the page to copy manually; same accepted fallback as
      // the old CopyInviteLink.
    }
  }

  return (
    <button
      onClick={handleShare}
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
      {copied ? "Copied!" : "Share invite link"}
    </button>
  )
}
