"use client"

// src/components/InstallHintLink.tsx
//
// The quiet way into the "put Orbit on your home screen" how-to: one
// underlined text button, shown only on iPhone Safari and iPhone Chrome
// outside the installed app (see useInstallHintBrowser). Everywhere else, and
// before mount, it renders nothing at all.
//
// Optional eyebrow: group info labels this link's section, and a label with
// nothing under it is an orphan heading. So the eyebrow lives here and the
// two appear and disappear together. Its style matches the "Email for sign-in
// and reminders" heading on the same page.

import { useState, type CSSProperties } from "react"
import { useInstallHintBrowser } from "@/lib/install-hint/platform"
import InstallHintSheet from "./InstallHintSheet"

interface Props {
  eyebrow?: string
  /** Layout for the whole block (spacing, alignment), applied to its root so
   *  nothing is left behind when the block renders nothing. */
  style?: CSSProperties
}

export default function InstallHintLink({ eyebrow, style }: Props) {
  const browser = useInstallHintBrowser()
  const [open, setOpen] = useState(false)

  if (browser === null) return null

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...style,
      }}
    >
      {eyebrow && (
        <p
          style={{
            fontSize: "var(--type-eyebrow)",
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: 700,
            margin: "18px 2px 7px",
          }}
        >
          {eyebrow}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          minHeight: "44px",
          color: "var(--text-secondary)",
          fontSize: "var(--type-meta)",
          lineHeight: "var(--leading-normal)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Use Orbit like an app
      </button>
      {open && (
        <InstallHintSheet
          browser={browser}
          buttonLabel="Got it"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
