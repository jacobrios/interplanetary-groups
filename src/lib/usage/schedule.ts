// src/lib/usage/schedule.ts
//
// When the weekly usage report goes out: Monday, 8am, America/Chicago.
//
// Once a week is guaranteed by the hour alone. The hourly cron enters this
// hour exactly once a week, so no marker is stored and no migration exists.
// The accepted costs, both rare: a duplicate email if Vercel delivers the same
// hour twice, and a skipped week if that hour fails.

import { getLocalParts } from "@/lib/orbit/occurrence"

/**
 * The owner's own zone. A product constant rather than an env var, for the
 * same reason `FROM` in src/lib/email/send.ts is one: it is a decision about
 * this product, not something that differs between deployments.
 */
export const USAGE_REPORT_TIME_ZONE = "America/Chicago"
export const USAGE_REPORT_LOCAL_HOUR = 8

/** True exactly when the wall clock in Chicago reads Monday, hour 8. */
export function isUsageReportHour(now: Date): boolean {
  const { year, month, day, hour } = getLocalParts(now, USAGE_REPORT_TIME_ZONE)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 1 && hour === USAGE_REPORT_LOCAL_HOUR
}
