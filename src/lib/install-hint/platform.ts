// src/lib/install-hint/platform.ts
//
// Which phones get the "put Orbit on your home screen" how-to, and which see
// nothing. Only iPhone Safari and iPhone Chrome: the pictures and steps are
// those two browsers' own menus. Android, laptops, iPad, other iPhone browsers
// and in-app browsers get null, because showing them steps that do not match
// their screen is worse than showing nothing. The installed app gets null too.

import { useEffect, useState } from "react"

export type InstallHintBrowser = "safari" | "chrome"

// Other iPhone browsers all keep "Safari" in the string, so each has to be
// excluded by its own token. GSA is the Google app's in-app browser.
const OTHER_IPHONE_BROWSERS = ["CriOS", "FxiOS", "EdgiOS", "OPiOS", "GSA"]

/** Pure classifier: no DOM access, so it can be tested with plain strings. */
export function installHintBrowser(
  userAgent: string,
  standalone: boolean
): InstallHintBrowser | null {
  if (standalone) return null
  if (!userAgent.includes("iPhone")) return null
  if (userAgent.includes("CriOS")) return "chrome"
  if (
    userAgent.includes("Safari") &&
    !OTHER_IPHONE_BROWSERS.some((token) => userAgent.includes(token))
  ) {
    return "safari"
  }
  return null
}

/**
 * The classifier's answer for this device, or null until mounted. Null first
 * so the server render and the first client render match (no hydration
 * mismatch); the real answer arrives in an effect.
 */
export function useInstallHintBrowser(): InstallHintBrowser | null {
  const [browser, setBrowser] = useState<InstallHintBrowser | null>(null)
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    // Effect-only by design: this is reading a browser fact after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrowser(installHintBrowser(navigator.userAgent, standalone))
  }, [])
  return browser
}
