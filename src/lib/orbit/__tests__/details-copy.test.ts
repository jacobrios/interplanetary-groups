// Pure-function tests for buildDetailsAnnouncement / buildPlanQuestion.
// No database: fixtures are plain StoredRhythm objects, diffed with Task 3's
// diffDetails so the clause inputs match what the real save path produces.

import { describe, it, expect } from "vitest"
import { diffDetails } from "@/lib/groups/details-edit"
import { formatRhythmRow } from "@/lib/orbit/playback"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import { buildDetailsAnnouncement, buildPlanQuestion, type PlanOutcome } from "../details-copy"

const TZ = "America/Chicago"
const NOW = new Date("2099-06-10T12:00:00Z") // Wednesday
const SAT = new Date("2099-06-13T14:00:00Z") // Sat 9am America/Chicago
const SUN8 = new Date("2099-06-14T13:00:00Z") // Sun 8am America/Chicago
const FAR_SUN8 = new Date("2099-06-21T13:00:00Z") // Sun 8am America/Chicago, 11 days out

const BEFORE: StoredRhythm[] = [
  {
    activity: "tennis",
    title: "Tennis",
    cadence: "weekly",
    daysOfWeek: [6],
    timeLocal: "09:00",
    venueName: "Court 3",
  },
]

function afterWith(changes: Partial<StoredRhythm>): StoredRhythm[] {
  return [{ ...BEFORE[0], ...changes }]
}

describe("buildDetailsAnnouncement", () => {
  it("schedule change with a 'left' plan outcome", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00" })
    // Pin the formatter's real output first, so drift there fails loudly here
    // rather than as a baffling string mismatch in the assertion below.
    expect(formatRhythmRow(after[0]).value).toBe("Sun at 8am, every week")

    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = { kind: "left", startsAt: SAT }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe("Casey changed tennis to Sun at 8am, every week. The plan this Sat stays as it was.")
  })

  it("spot change with an 'updated' plan outcome", () => {
    const after = afterWith({ venueName: "Court 5" })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = { kind: "updated", startsAt: SAT }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe(
      "Casey changed the spot for tennis to Court 5. The plan this Sat is updated too."
    )
  })

  it("spot cleared (venue set to null), no plan (none)", () => {
    const after = afterWith({ venueName: null })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    expect(diff.rhythms).toEqual([
      { index: 0, activity: null, schedule: false, spot: { from: "Court 3", to: null } },
    ])

    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan: { kind: "none" },
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe("Casey removed the spot for tennis.")
  })

  it("schedule + spot change with a 'vote' plan outcome, details already updated", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00", venueName: "Court 5" })
    expect(formatRhythmRow(after[0]).value).toBe("Sun at 8am, every week")

    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = {
      kind: "vote",
      startsAt: SAT,
      proposedStartsAt: SUN8,
      detailsUpdated: true,
    }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe(
      "Casey changed tennis to Sun at 8am, every week, and changed the spot for tennis to Court 5. The plan this Sat is updated too. Move it to Sun 8am as well?"
    )
  })

  it("schedule change with a 'vote' plan outcome, details not updated", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00" })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = {
      kind: "vote",
      startsAt: SAT,
      proposedStartsAt: SUN8,
      detailsUpdated: false,
    }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe("Casey changed tennis to Sun at 8am, every week. Move the plan this Sat to Sun 8am too?")
  })

  it("vote proposed time a week or more away carries the date, so 'Move it to Fri 8pm' cannot mean the wrong Friday", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00", venueName: "Court 5" })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = {
      kind: "vote",
      startsAt: SAT,
      proposedStartsAt: FAR_SUN8,
      detailsUpdated: true,
    }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe(
      "Casey changed tennis to Sun at 8am, every week, and changed the spot for tennis to Court 5. The plan this Sat is updated too. Move it to Sun, Jun 21 8am as well?"
    )
  })

  it("vote proposed time a week or more away, details not updated: same dated form on the plain ask", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00" })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = {
      kind: "vote",
      startsAt: SAT,
      proposedStartsAt: FAR_SUN8,
      detailsUpdated: false,
    }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe(
      "Casey changed tennis to Sun at 8am, every week. Move the plan this Sat to Sun, Jun 21 8am too?"
    )
  })

  it("rename + schedule + spot, no plan (none)", () => {
    const after = afterWith({
      activity: "padel",
      title: "Padel",
      daysOfWeek: [0],
      timeLocal: "08:00",
      venueName: "Court 5",
    })
    expect(formatRhythmRow(after[0]).value).toBe("Sun at 8am, every week")

    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = { kind: "none" }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe(
      "Casey renamed tennis to padel, changed padel to Sun at 8am, every week, and changed the spot for padel to Court 5."
    )
  })

  it("every-day schedule change, no plan (none)", () => {
    const after = afterWith({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeLocal: "09:00" })
    expect(formatRhythmRow(after[0]).value).toBe("Every day at 9am")

    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const plan: PlanOutcome = { kind: "none" }
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan,
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBe("Casey changed tennis to every day at 9am.")
  })

  it("founder alone in the group: silence", () => {
    const after = afterWith({ daysOfWeek: [0], timeLocal: "08:00" })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 1,
      plan: { kind: "none" },
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBeNull()
  })

  it("a rename-only group-name diff (no rhythm changes): silence", () => {
    const after = BEFORE // no rhythm changed
    const diff = diffDetails(BEFORE, after, "Group", "New Group Name")
    expect(diff.nameChanged).toBe(true)
    expect(diff.rhythms).toHaveLength(0)
    const result = buildDetailsAnnouncement({
      founderName: "Casey",
      after,
      before: BEFORE,
      diff,
      memberCount: 3,
      plan: { kind: "none" },
      timeZone: TZ,
      now: NOW,
    })
    expect(result).toBeNull()
  })

  it("no output anywhere contains an em dash or en dash", () => {
    const after = afterWith({
      activity: "padel",
      title: "Padel",
      daysOfWeek: [0],
      timeLocal: "08:00",
      venueName: "Court 5",
    })
    const diff = diffDetails(BEFORE, after, "Group", "Group")
    const outcomes: PlanOutcome[] = [
      { kind: "none" },
      { kind: "left", startsAt: SAT },
      { kind: "updated", startsAt: SAT },
      { kind: "vote", startsAt: SAT, proposedStartsAt: SUN8, detailsUpdated: true },
      { kind: "vote", startsAt: SAT, proposedStartsAt: SUN8, detailsUpdated: false },
    ]
    for (const plan of outcomes) {
      const result = buildDetailsAnnouncement({
        founderName: "Casey",
        after,
        before: BEFORE,
        diff,
        memberCount: 3,
        plan,
        timeZone: TZ,
        now: NOW,
      })
      expect(result).not.toBeNull()
      expect(result).not.toContain("—") // em dash
      expect(result).not.toContain("–") // en dash
    }
  })
})

describe("buildPlanQuestion", () => {
  it("names the day and month, asks to update or leave it", () => {
    expect(buildPlanQuestion(SAT, TZ)).toBe(
      "Your next plan is Sat, Jun 13. Update that one too, or leave it?"
    )
  })
})
