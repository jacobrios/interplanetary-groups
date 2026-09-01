// src/lib/health/heartbeat.ts
//
// The one place the app talks to Better Stack, and the deliberate sibling of
// src/lib/email/send.ts: one seam per external service, and the product
// decides what the service's reply means exactly once, here.
//
// Why an outside service rather than an email from Orbit. Two reasons, both
// load-bearing. An alarm that runs inside the thing it is watching goes
// quiet exactly when the thing dies, and quiet is indistinguishable from
// healthy: that is the four-day outage repeated one level up. And the noise
// budget the owner asked for (immediate, then every six hours, then an
// automatic all-clear) needs somewhere to remember what it already said,
// which this app has nowhere to keep without a migration. Better Stack owns
// both problems, so neither one lives in this codebase.
//
// The missing ping IS the alarm. Better Stack raises an incident when no
// heartbeat arrives within the configured period plus grace, which is why
// failing to reach it is safe rather than a hole.

import type { HealthVerdict } from "./check"

export type HeartbeatOutcome =
  | "reported_ok"
  | "reported_failure"
  /** No URL configured. A success, never an error: local and preview builds
   *  are meant to be silent. */
  | "not_configured"
  | "unreachable"

/**
 * The sweeps above this call in the cron have already done their work and
 * their results are owed to the response, so a monitor that stops answering
 * must never hold them up.
 */
const TIMEOUT_MS = 5_000

export async function reportHealth(verdict: HealthVerdict): Promise<HeartbeatOutcome> {
  const configured = process.env.HEALTH_HEARTBEAT_URL?.trim()
  if (!configured) {
    console.info("[health] HEALTH_HEARTBEAT_URL is not set, so no heartbeat was sent.")
    return "not_configured"
  }

  const base = configured.replace(/\/+$/, "")
  const url = verdict.ok ? base : `${base}/fail`
  const body = verdict.ok ? undefined : `${verdict.failedStep}: ${verdict.detail}`

  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.error("[health] the heartbeat was refused:", response.status)
      return "unreachable"
    }

    return verdict.ok ? "reported_ok" : "reported_failure"
  } catch (err) {
    // Deliberately not rethrown. Not reaching Better Stack is safe by
    // construction: the absent ping raises the incident on its own.
    console.error("[health] the heartbeat could not be sent:", err)
    return "unreachable"
  }
}
