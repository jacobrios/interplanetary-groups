"use client"

// src/app/groups/[id]/InstallHintOnArrival.tsx
//
// The one-time "use Orbit like an app?" sheet, shown once per device to a
// member (never the founder, who met the same line on onboarding step 3) on
// iPhone Safari or iPhone Chrome outside the installed app.
//
// DECIDE ONCE. LiveRefresh re-renders the group home every ten seconds with
// fresh props, and the email ask's offer can flip between renders. So the
// decision is made in a single effect, the first time the platform hook has an
// answer, and held in state: a later render can neither open a skipped sheet
// nor close an open one. (Same lesson as the shown-latch in EmailAskNote.)
//
// The flag is written the moment the sheet opens, so every way out (button,
// scrim, Escape, navigating away) ends it for good and closing writes
// nothing. Storage that throws on read or write means we stay silent: this is
// a nudge, and a nudge that could repeat forever is worse than none.
//
// If the email sheet will open this visit we do nothing and leave the flag
// unset, so the install hint gets its turn on a later visit rather than
// stacking two sheets. DeployWatch already refuses to reload under any
// [role="dialog"], so this sheet is covered without wiring.

import { useEffect, useState } from "react"
import { useInstallHintBrowser } from "@/lib/install-hint/platform"
import InstallHintSheet from "@/components/InstallHintSheet"
import { emailAskWillOpen } from "@/lib/auth/email-offer"
import { emailAskCookieIsFresh } from "@/lib/auth/email-ask-cooldown"
import type { EmailAskNoteProps } from "./EmailAskNote"

const FLAG = "orbit.installHintShown"

interface Props {
  /** The email sheet's own inputs (null when there is no viewer to ask). The
   * page hands these to every signed-in viewer, so their presence says nothing
   * about whether the sheet will open; emailAskWillOpen decides that. */
  emailAsk: EmailAskNoteProps | null
  viewerIsFounder: boolean
}

export default function InstallHintOnArrival({ emailAsk, viewerIsFounder }: Props) {
  const browser = useInstallHintBrowser()
  // Whether the email sheet will open on this mount, asked ONCE during the first
  // render: EmailAskNote reads the same cooldown cookie in its own state
  // initializer, and rewrites it in an effect once it shows. Reading in an
  // effect here could see that rewrite and wrongly conclude the ask was
  // snoozed, opening two sheets at once.
  const [emailSheetWillOpen] = useState(
    () =>
      emailAsk !== null &&
      typeof document !== "undefined" &&
      emailAskWillOpen(
        {
          user: emailAsk.askState,
          latestContributionAt: emailAsk.latestContributionAt,
          hasVerifiedEmail: emailAsk.hasVerifiedEmail,
          lastShownAt: emailAsk.lastShownAt,
          now: emailAsk.now,
        },
        emailAskCookieIsFresh()
      )
  )
  const [decision, setDecision] = useState<"pending" | "open" | "closed" | "skipped">("pending")

  useEffect(() => {
    if (decision !== "pending" || browser === null) return
    let next: "open" | "skipped" = "skipped"
    if (!viewerIsFounder && !emailSheetWillOpen) {
      try {
        if (window.localStorage.getItem(FLAG) === null) {
          window.localStorage.setItem(FLAG, "1")
          next = "open"
        }
      } catch {
        next = "skipped"
      }
    }
    // Effect-only by design: reads a browser fact (storage) after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecision(next)
  }, [browser, decision, emailSheetWillOpen, viewerIsFounder])

  if (decision !== "open" || browser === null) return null

  return (
    <InstallHintSheet
      browser={browser}
      heading="Use Orbit like an app?"
      subline="Put it on your home screen. It opens full screen, one tap away."
      buttonLabel="Not now"
      onClose={() => setDecision("closed")}
    />
  )
}
