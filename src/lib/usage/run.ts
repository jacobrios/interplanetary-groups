// src/lib/usage/run.ts
//
// The weekly usage report step: decide whether this is the hour, work out who
// the owner is so his own groups are left out, collect, compose, send. It is
// the fifth step of the hourly cron (src/app/api/cron/orbit/route.ts) and runs
// fail-soft there, like the digest.
//
// No address is ever logged. USAGE_REPORT_TO is the owner's own setting and
// the recipient, and the same rule as src/lib/email/send.ts applies: an
// address does not go in a log line.

import { prisma } from "@/lib/prisma"
import { sendEmail, type SendResult } from "@/lib/email/send"
import { isUsageReportHour } from "./schedule"
import { collectUsage } from "./collect"
import { composeUsageReport } from "./compose"

export type UsageRunResult =
  | { status: "not_report_hour" }
  | { status: "no_recipient" }
  | { status: "sent"; result: SendResult }

/**
 * The ids of whoever signed in with this one address. It can never return an
 * address, only ids, and the address is the one the owner put in his own
 * setting. Deliberately a User query filtered through the relation and not a
 * ContactMethod read: the privacy guard in
 * src/app/__tests__/no-email-address-on-screen.test.tsx pins exactly three
 * ContactMethod read sites. Stored addresses are trimmed and lowercased
 * (src/lib/auth/email.ts), so the lookup value is too.
 */
export async function findOwnerUserIds(email: string): Promise<string[]> {
  const value = email.trim().toLowerCase()
  const users = await prisma.user.findMany({
    where: { contactMethods: { some: { value, isVerified: true } } },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

export async function runWeeklyUsageReport(
  now: Date,
  // force skips the hour check and exists for tests only. groupIds scopes the
  // report to the groups a test built, as the digest's run does.
  opts: { groupIds?: string[]; force?: boolean } = {}
): Promise<UsageRunResult> {
  if (!opts.force && !isUsageReportHour(now)) return { status: "not_report_hour" }

  const to = process.env.USAGE_REPORT_TO?.trim()
  if (!to) {
    console.log("[usage-report] USAGE_REPORT_TO is not set; nothing sent.")
    return { status: "no_recipient" }
  }

  const excludeUserIds = await findOwnerUserIds(to)
  const report = await collectUsage(now, { excludeUserIds, groupIds: opts.groupIds })
  const { subject, text, html } = composeUsageReport(report, {
    ownerRecognised: excludeUserIds.length > 0,
  })
  const result = await sendEmail({ to, subject, text, html })
  return { status: "sent", result }
}
