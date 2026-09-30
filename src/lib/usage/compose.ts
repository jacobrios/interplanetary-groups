// src/lib/usage/compose.ts
//
// The weekly usage email itself: subject, plain text, and HTML, composed from
// a finished UsageReport. Pure, like lib/digest/compose.ts before it: numbers
// go in, a finished email comes out. Nothing here queries Prisma, calls
// Resend, or reads process.env, so the weekly cron and the hand-run CLI can
// never disagree about what the owner would have received.
//
// The HTML is deliberately the text again inside one <pre>. The only reader is
// the owner, the content is columns of numbers, and monospace keeps them
// aligned in every mail client without any styling that clients might strip.
// Group names are member-supplied, so they are HTML-escaped. No member names
// appear anywhere: the report carries counts and group names only.
//
// Dates render in America/Chicago (USAGE_REPORT_TIME_ZONE), the owner's own
// clock, so "week ending Mon Sep 28" matches the Monday the email arrives on.

import type { Count, UsageMetrics, UsageReport } from "@/lib/usage/collect"
import { USAGE_REPORT_TIME_ZONE } from "@/lib/usage/schedule"
import { formatMonthDay, formatWeekdayShort } from "@/lib/events/format"
import { getLocalParts } from "@/lib/orbit/occurrence"

const CAVEAT =
  "Counts identities, not humans: a member who lost their session and rejoined counts twice."

const LABEL_WIDTH = 34
const COLUMN_WIDTH = 10

/** "Mon Sep 28". */
function shortDate(date: Date): string {
  return `${formatWeekdayShort(date, USAGE_REPORT_TIME_ZONE)} ${formatMonthDay(date, USAGE_REPORT_TIME_ZONE)}`
}

/** "Mon Sep 28, 2026". */
function longDate(date: Date): string {
  const { year } = getLocalParts(date, USAGE_REPORT_TIME_ZONE)
  return `${shortDate(date)}, ${year}`
}

function countLine(label: string, count: Count): string {
  return label.padEnd(LABEL_WIDTH) + String(count.week).padEnd(COLUMN_WIDTH) + String(count.allTime)
}

function weekOnlyLine(label: string, value: number): string {
  return label.padEnd(LABEL_WIDTH) + String(value)
}

function headerLine(): string {
  return "".padEnd(LABEL_WIDTH) + "this week".padEnd(COLUMN_WIDTH) + "all time"
}

/**
 * Every line of a metrics block after the (overall-only) groups line. The
 * duplicate-identity caveat is printed once, under the overall People line
 * only; repeating it per group would bury the numbers.
 */
function metricsLines(m: UsageMetrics, withCaveat: boolean): string[] {
  return [
    countLine("People (new, total)", m.people),
    ...(withCaveat ? [CAVEAT] : []),
    weekOnlyLine("Active, opened (7 days)", m.openedActive),
    weekOnlyLine("Active, did something (7 days)", m.didSomethingActive),
    countLine("Member messages", m.memberMessages),
    countLine("Ideas floated", m.ideasFloated),
    countLine("Ideas that became plans", m.ideasBecamePlans),
    countLine("RSVPs", m.rsvps),
    countLine("Time changes proposed", m.timeChangesProposed),
    countLine("Time changes passed", m.timeChangesPassed),
    countLine("Calls-off", m.callsOff),
  ]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function composeUsageReport(
  report: UsageReport,
  opts: { ownerRecognised: boolean }
): { subject: string; text: string; html: string } {
  const subject = `Orbit usage, week ending ${shortDate(report.generatedAt)}`

  const exclusion = opts.ownerRecognised
    ? `Excluded ${report.excludedGroupCount} ${report.excludedGroupCount === 1 ? "group" : "groups"} you are a member of.`
    : "Excluded nothing: USAGE_REPORT_TO is not set or matches no signed-in account."

  const lines: string[] = [subject, ""]

  if (report.perGroup.length === 0) {
    lines.push("No groups to report yet.", "", exclusion)
  } else {
    lines.push(
      "OVERALL",
      headerLine(),
      countLine("Groups", report.groups),
      ...metricsLines(report.overall, true),
      "",
      exclusion
    )
    for (const g of report.perGroup) {
      lines.push("", `${g.name} (created ${longDate(g.createdAt)})`, headerLine(), ...metricsLines(g.metrics, false))
    }
  }

  const text = lines.join("\n") + "\n"
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;">${escapeHtml(text)}</pre>`
  return { subject, text, html }
}
