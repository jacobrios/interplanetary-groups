"use client"

import { useEffect, useRef, useState } from "react"

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
  // The "Copied!" reset used to be a bare setTimeout with no cleanup, which
  // is fine while the browser tab stays open but not inside a test: the
  // component can unmount (or the whole jsdom window can be torn down at the
  // end of a test file) before the 2s elapses, and the callback firing after
  // that crashes with "window is not defined" from inside React's scheduler
  // — surfaced by the full-suite run, attributed to whichever file happened
  // to be executing when the stray timer fired minutes later, nothing to do
  // with that file. Tracking the id and clearing it on unmount (and before
  // starting a new one) removes the dangling callback entirely.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

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
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 2000)
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
        // 46px at the default text size (walkthrough.css .s3-sharebtn), as a
        // floor rather than a fixed height: 17px body text at 1.5 leading is
        // 25.5px, plus 10px of real padding top and bottom, so the resting
        // pill is the design's 46px and an enlarged device text size grows
        // the pill instead of spilling the label out of it ("layout grows
        // with content, never clips"). Same correction already made to
        // step 1's Continue button.
        minHeight: "2.875rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.625rem 1.5rem",
        backgroundColor: "var(--action)",
        color: "var(--action-ink)",
        fontSize: "var(--type-body)",
        lineHeight: "var(--leading-normal)",
        fontWeight: 700,
        border: "none",
        borderRadius: "1.5rem", // 24px pill
        cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : "Share invite link"}
    </button>
  )
}
