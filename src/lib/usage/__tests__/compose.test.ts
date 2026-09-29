import { describe, expect, it } from "vitest"
import { composeUsageReport } from "@/lib/usage/compose"
import type { GroupUsage, UsageMetrics, UsageReport } from "@/lib/usage/collect"

function metrics(over: Partial<UsageMetrics> = {}): UsageMetrics {
  return {
    people: { week: 1, allTime: 4 },
    openedActive: 3,
    didSomethingActive: 2,
    memberMessages: { week: 10, allTime: 40 },
    ideasFloated: { week: 2, allTime: 5 },
    ideasBecamePlans: { week: 1, allTime: 3 },
    rsvps: { week: 6, allTime: 20 },
    timeChangesProposed: { week: 0, allTime: 2 },
    timeChangesPassed: { week: 0, allTime: 1 },
    callsOff: { week: 1, allTime: 1 },
    ...over,
  }
}

function group(name: string, over: Partial<UsageMetrics> = {}): GroupUsage {
  return {
    id: name,
    name,
    createdAt: new Date("2026-09-01T15:00:00Z"),
    metrics: metrics(over),
  }
}

function report(over: Partial<UsageReport> = {}): UsageReport {
  return {
    generatedAt: new Date("2026-09-28T13:00:00Z"),
    windowStart: new Date("2026-09-21T13:00:00Z"),
    groups: { week: 1, allTime: 2 },
    overall: metrics(),
    perGroup: [group("Tennis"), group("Climbing")],
    excludedGroupCount: 1,
    ...over,
  }
}

const CAVEAT =
  "Counts identities, not humans: a member who lost their session and rejoined counts twice."

describe("composeUsageReport", () => {
  it("dates the subject in America/Chicago", () => {
    expect(composeUsageReport(report(), { ownerRecognised: true }).subject).toBe(
      "Orbit usage, week ending Mon Sep 28"
    )
    // 03:00 UTC Tuesday is still Monday evening in Chicago.
    const late = report({ generatedAt: new Date("2026-09-29T03:00:00Z") })
    expect(composeUsageReport(late, { ownerRecognised: true }).subject).toContain("Mon Sep 28")
  })

  it("puts the caveat directly under the people line", () => {
    const lines = composeUsageReport(report(), { ownerRecognised: true }).text.split("\n")
    const i = lines.findIndex((l) => l.startsWith("People"))
    expect(i).toBeGreaterThan(-1)
    expect(lines[i + 1]).toBe(CAVEAT)
  })

  it("words the exclusion line both ways", () => {
    const yes = composeUsageReport(report({ excludedGroupCount: 2 }), { ownerRecognised: true })
    expect(yes.text).toContain("Excluded 2 groups you are a member of.")
    const no = composeUsageReport(report(), { ownerRecognised: false })
    expect(no.text).toContain(
      "Excluded nothing: USAGE_REPORT_TO is not set or matches no signed-in account."
    )
  })

  it("prints one block per group in the order given, without a groups line", () => {
    const { text } = composeUsageReport(report(), { ownerRecognised: true })
    const tennis = text.indexOf("Tennis (created")
    const climbing = text.indexOf("Climbing (created")
    expect(tennis).toBeGreaterThan(-1)
    expect(climbing).toBeGreaterThan(tennis)
    expect(text.slice(tennis)).not.toMatch(/^Groups/m)
    expect(text).toContain("Tennis (created Tue Sep 1, 2026)")
  })

  it("shows this week and all time columns, and active lines as 7 days", () => {
    const { text } = composeUsageReport(report(), { ownerRecognised: true })
    expect(text).toMatch(/this week\s+all time/)
    expect(text).toMatch(/Member messages\s+10\s+40/)
    expect(text).toMatch(/Active, opened \(7 days\)\s+3/)
    expect(text).toMatch(/Active, did something \(7 days\)\s+2/)
  })

  it("says so for an empty report instead of a block of zeros", () => {
    const { text } = composeUsageReport(
      report({ perGroup: [], groups: { week: 0, allTime: 0 }, excludedGroupCount: 3 }),
      { ownerRecognised: true }
    )
    expect(text).toContain("No groups to report yet.")
    expect(text).toContain("Excluded 3 groups you are a member of.")
    expect(text).not.toContain("Member messages")
  })

  it("escapes group names in the html", () => {
    const r = report({ perGroup: [group("<script>alert(1)</script>")] })
    const { html, text } = composeUsageReport(r, { ownerRecognised: true })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("<pre")
    expect(text).toContain("<script>")
  })

  it("never uses an em or en dash", () => {
    for (const owner of [true, false]) {
      for (const r of [report(), report({ perGroup: [] })]) {
        const out = composeUsageReport(r, { ownerRecognised: owner })
        expect(out.subject + out.text + out.html).not.toMatch(/[—–]/)
      }
    }
  })
})
