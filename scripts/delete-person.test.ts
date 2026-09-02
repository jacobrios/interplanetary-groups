// scripts/delete-person.test.ts
//
// Tests for the deletion script's decidable parts: argument parsing, the
// database guard, person lookup, and plan/receipt-to-text formatting. The
// one thing the task brief exempts from testing is the interactive
// confirmation prompt's own I/O (reading an answer off stdin); everything
// that answer feeds into (parseYesNo, confirmsName, defaultConfirmationFor)
// is tested here on fixture input instead.
//
// Fixtures are stamped and cleanup is scoped to ids this file created, same
// discipline as src/lib/people/__tests__/deletion-plan.test.ts: this runs
// against a shared, non-empty dev-test database, so an assertion has to be
// structurally isolated to the rows a test made, never merely improbable to
// collide with something already there.

import { describe, it, expect, afterEach } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { prisma } from "../src/lib/prisma"
import { ContactMethodType } from "@prisma/client"
import type { Verdict } from "./db-which"
import type { DeletionPlan } from "../src/lib/people/deletion-plan"
import type { DeletionReceipt } from "../src/lib/people/delete-person"
import {
  RUNBOOK_PATH,
  parseArgs,
  evaluateDatabaseGuard,
  formatDatabaseIdentityLines,
  countPhrase,
  defaultConfirmationFor,
  parseYesNo,
  confirmsName,
  isSafetyStopError,
  formatCandidateLines,
  formatPlanLines,
  formatJoinAnnouncementPromptLines,
  formatReceiptLines,
  formatSupabaseInstructionLines,
  findPeopleByEmail,
  resolveGroup,
  findPeopleByNameAndGroup,
  lookupPerson,
  type PersonMatch,
} from "./delete-person"

// ── Fixtures ──────────────────────────────────────────────────────────────

const groupIds: string[] = []
const userIds: string[] = []

function stamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

async function makeUser(name: string) {
  const user = await prisma.user.create({
    data: { name, supabaseAuthId: `test-delete-script-${stamp()}` },
  })
  userIds.push(user.id)
  return user
}

async function makeGroup(name: string, founderId: string, memberIds: string[] = []) {
  const group = await prisma.group.create({
    data: {
      name,
      founderId,
      memberships: { create: [founderId, ...memberIds].map((userId) => ({ userId })) },
    },
  })
  groupIds.push(group.id)
  return group
}

async function makeEmail(userId: string, value: string) {
  return prisma.contactMethod.create({
    data: { userId, type: ContactMethodType.EMAIL, value },
  })
}

afterEach(async () => {
  while (groupIds.length) {
    const id = groupIds.pop()!
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  while (userIds.length) {
    const id = userIds.pop()!
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
})

// ── parseArgs ─────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("accepts --email alone", () => {
    const result = parseArgs(["--email", "jesse@example.com"])
    expect(result).toEqual({
      ok: true,
      args: { email: "jesse@example.com", name: null, group: null, userId: null, productionOverride: false },
    })
  })

  it("accepts --name plus --group", () => {
    const result = parseArgs(["--name", "Jesse", "--group", "Climbing Crew"])
    expect(result).toEqual({
      ok: true,
      args: { email: null, name: "Jesse", group: "Climbing Crew", userId: null, productionOverride: false },
    })
  })

  it("picks up --user-id and --i-know-this-is-production", () => {
    const result = parseArgs(["--email", "jesse@example.com", "--user-id", "abc123", "--i-know-this-is-production"])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.args.userId).toBe("abc123")
    expect(result.args.productionOverride).toBe(true)
  })

  it("refuses both --email and --name together", () => {
    const result = parseArgs(["--email", "jesse@example.com", "--name", "Jesse", "--group", "X"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error")
    expect(result.error).toMatch(/not both/i)
  })

  it("refuses when nothing at all is given", () => {
    const result = parseArgs([])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error")
    expect(result.error).toMatch(/--email/)
  })

  it("refuses --name without --group", () => {
    const result = parseArgs(["--name", "Jesse"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error")
    expect(result.error).toMatch(/--group/)
  })

  it("refuses an unrecognized option", () => {
    const result = parseArgs(["--wat"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error")
    expect(result.error).toMatch(/Unrecognized option: --wat/)
  })

  it("refuses a flag with no value trailing it", () => {
    const result = parseArgs(["--email"])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error")
    expect(result.error).toMatch(/--email needs a value/)
  })
})

// ── evaluateDatabaseGuard ─────────────────────────────────────────────────

describe("evaluateDatabaseGuard", () => {
  const devTestOk: Verdict = { ok: true, ref: "pxbewardwvoyqqcvogel", problems: [] }
  const prodRef: Verdict = { ok: false, ref: "someprodref00000000", problems: ["project ref is someprodref00000000, expected pxbewardwvoyqqcvogel (dev-test)"] }
  const ambiguous: Verdict = { ok: false, ref: null, problems: ["sources disagree about the project: a vs b"] }

  it("proceeds silently on a confirmed dev-test verdict", () => {
    const decision = evaluateDatabaseGuard(devTestOk, false)
    expect(decision.proceed).toBe(true)
    expect(decision.lines.join(" ")).toMatch(/DEV-TEST/)
  })

  it("refuses a clear production ref without the override flag", () => {
    const decision = evaluateDatabaseGuard(prodRef, false)
    expect(decision.proceed).toBe(false)
    expect(decision.lines.join(" ")).toMatch(/NOT dev-test/)
    expect(decision.lines.join(" ")).toMatch(/--i-know-this-is-production/)
  })

  it("proceeds on a clear production ref WITH the override flag, but still warns", () => {
    const decision = evaluateDatabaseGuard(prodRef, true)
    expect(decision.proceed).toBe(true)
    expect(decision.lines.join(" ")).toMatch(/WARNING/)
    expect(decision.lines.join(" ")).toMatch(/NOT dev-test/)
  })

  it("refuses an ambiguous verdict even WITH the override flag: the flag means 'I know this is production,' not 'I don't know what this is'", () => {
    const decision = evaluateDatabaseGuard(ambiguous, true)
    expect(decision.proceed).toBe(false)
    expect(decision.lines.join(" ")).toMatch(/could not confirm/i)
  })
})

describe("formatDatabaseIdentityLines", () => {
  it("prints the three ref lines in the same shape db-which.ts uses", () => {
    const lines = formatDatabaseIdentityLines({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
      DIRECT_URL: undefined,
    })
    expect(lines[0]).toBe("NEXT_PUBLIC_SUPABASE_URL   → abcdefghijklmnopqrst")
    expect(lines[1]).toBe("DATABASE_URL               → abcdefghijklmnopqrst")
    expect(lines[2]).toBe("DIRECT_URL                 → (no ref found)")
  })
})

// ── small helpers ─────────────────────────────────────────────────────────

describe("countPhrase", () => {
  it("uses the singular for exactly one", () => {
    expect(countPhrase(1, "group")).toBe("1 group")
  })
  it("uses the regular plural by default", () => {
    expect(countPhrase(3, "group")).toBe("3 groups")
    expect(countPhrase(0, "group")).toBe("0 groups")
  })
  it("uses a supplied irregular plural", () => {
    expect(countPhrase(2, "person", "people")).toBe("2 people")
    expect(countPhrase(1, "person", "people")).toBe("1 person")
  })
})

describe("defaultConfirmationFor", () => {
  it("defaults name-match-only to NOT deleting, because it is the doubtful class", () => {
    expect(defaultConfirmationFor("name-match-only")).toBe("no")
  })
  it("defaults current-member to deleting", () => {
    expect(defaultConfirmationFor("current-member")).toBe("yes")
  })
  it("defaults left-with-trace to deleting", () => {
    expect(defaultConfirmationFor("left-with-trace")).toBe("yes")
  })
})

describe("parseYesNo", () => {
  it("takes the default on a blank answer", () => {
    expect(parseYesNo("", "yes")).toBe(true)
    expect(parseYesNo("   ", "no")).toBe(false)
  })
  it("recognizes y/yes case-insensitively", () => {
    expect(parseYesNo("y", "no")).toBe(true)
    expect(parseYesNo("YES", "no")).toBe(true)
  })
  it("recognizes n/no case-insensitively", () => {
    expect(parseYesNo("n", "yes")).toBe(false)
    expect(parseYesNo("No", "yes")).toBe(false)
  })
  it("returns null for anything else, so the caller can re-ask", () => {
    expect(parseYesNo("maybe", "yes")).toBeNull()
  })
})

describe("confirmsName", () => {
  it("matches the exact name, trimmed", () => {
    expect(confirmsName("  Jesse Rivera  ", "Jesse Rivera")).toBe(true)
  })
  it("does not match a different name", () => {
    expect(confirmsName("Jess", "Jesse Rivera")).toBe(false)
  })
  it("is case-sensitive", () => {
    expect(confirmsName("jesse rivera", "Jesse Rivera")).toBe(false)
  })
})

describe("isSafetyStopError", () => {
  it("recognizes deletePerson's own safety-stop message", () => {
    const err = new Error('deletePerson refuses to delete group "X" (g1): somebody joined since the plan was built. This is a safety stop, not a failure.')
    expect(isSafetyStopError(err)).toBe(true)
  })
  it("does not mistake an unrelated error for the safety stop", () => {
    expect(isSafetyStopError(new Error("connection refused"))).toBe(false)
  })
  it("does not mistake a non-Error value for the safety stop", () => {
    expect(isSafetyStopError("joined since the plan was built")).toBe(false)
  })
})

// ── formatCandidateLines ────────────────────────────────────────────────────

describe("formatCandidateLines", () => {
  const matches: PersonMatch[] = [
    {
      userId: "u1",
      name: "Jesse Rivera",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      memberships: [{ groupId: "g1", groupName: "Climbing Crew", isFounder: true }],
    },
    {
      userId: "u2",
      name: "Jesse Rivera",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      memberships: [],
    },
  ]

  it("names both people, their ids, and points at the --user-id escape hatch", () => {
    const lines = formatCandidateLines(matches).join("\n")
    expect(lines).toMatch(/u1/)
    expect(lines).toMatch(/u2/)
    expect(lines).toMatch(/--user-id/)
  })

  // Loosened after review: "founder of \"X\"" and "not currently in any
  // group" were exact phrases. The real decision is that the two people's
  // group-membership DETAIL (the actual disambiguator) renders differently
  // for each of them, checked on the lines that follow each person's
  // header rather than on the header itself (which trivially differs by id
  // regardless of membership content).
  it("shows different membership detail for a person with a group and one without, which is the actual disambiguator", () => {
    const lines = formatCandidateLines(matches)
    expect(lines.join("\n")).toContain("Climbing Crew")
    const u1HeaderIndex = lines.findIndex((l) => l.includes("u1"))
    const u2HeaderIndex = lines.findIndex((l) => l.includes("u2"))
    // The detail line(s) sit strictly between one person's header and the
    // next, so this compares what actually follows each header, not the
    // headers (which always differ by id/date regardless of membership).
    const u1Detail = lines.slice(u1HeaderIndex + 1, u2HeaderIndex).join("\n")
    const u2Detail = lines.slice(u2HeaderIndex + 1).join("\n")
    expect(u1Detail).not.toEqual(u2Detail)
  })
})

// ── formatPlanLines: blocked ─────────────────────────────────────────────

describe("formatPlanLines, blocked", () => {
  // Loosened after review: the original version pinned full sentences
  // ("cannot be deleted yet", "Run this script again", the exact "N other
  // X are/is still in it" phrasing) as well as the literal "Sam, Taylor"
  // join. All of that is copy the owner may reword after reading it, and
  // none of the wording itself is the decision under test. What actually
  // matters here: every other member is named (not summarized as a count),
  // the group is named, the plan tells the operator SOMETHING actionable
  // rather than nothing, and it points at the founder-handover runbook.
  //
  // CORRECTION (fix round 1): this comment used to claim the runbook was
  // "named in the brief" as justification for pinning the word. That claim
  // was false; a grep of task-3-brief.md finds no mention of a runbook at
  // all. It survived review by sounding checked without being checked. The
  // real reason to point at it is cross-task context from the coordinator:
  // task 8 of this slice creates docs/runbooks/person-deletion.md, and the
  // founder-handover case is explicitly one of the things it carries. So
  // pointing at IT is right; what was wrong was the pin (the word
  // "runbook", free to be reworded) and the justification for it (untrue).
  // Fixed below by pinning RUNBOOK_PATH, the actual destination, imported
  // from the script rather than typed a second time.
  it("names the group and every other member individually, and gives the operator something actionable to do next", () => {
    const plan: DeletionPlan = {
      kind: "blocked",
      reason: "founder-with-members",
      groups: [
        {
          groupId: "g1",
          groupName: "Climbing Crew",
          otherMembers: [
            { userId: "u2", name: "Sam" },
            { userId: "u3", name: "Taylor" },
          ],
        },
      ],
    }
    const lines = formatPlanLines(plan)
    const text = lines.join("\n")
    expect(text).toContain("Climbing Crew")
    expect(text).toContain("Sam")
    expect(text).toContain("Taylor")
    // A blocked plan is not just the group/member facts: there is real
    // guidance beyond them. Not pinning what it says, just that it exists.
    expect(lines.length).toBeGreaterThan(4)
    // Pinned as the PATH, not the word "runbook": the path is a real
    // destination (the same class as the Supabase dashboard string kept
    // pinned elsewhere in this file), free of any wording choice the owner
    // might make about how to refer to it in prose.
    expect(text).toContain(RUNBOOK_PATH)
  })

  it("names every other member when there is more than one, not a summarized count", () => {
    const plan: DeletionPlan = {
      kind: "blocked",
      reason: "founder-with-members",
      groups: [
        {
          groupId: "g1",
          groupName: "Big Group",
          otherMembers: [
            { userId: "u2", name: "Sam" },
            { userId: "u3", name: "Taylor" },
            { userId: "u4", name: "Robin" },
          ],
        },
      ],
    }
    const text = formatPlanLines(plan).join("\n")
    expect(text).toContain("Sam")
    expect(text).toContain("Taylor")
    expect(text).toContain("Robin")
  })
})

// ── formatPlanLines: ready ───────────────────────────────────────────────

function readyPlan(overrides: Partial<Extract<DeletionPlan, { kind: "ready" }>> = {}): Extract<DeletionPlan, { kind: "ready" }> {
  return {
    kind: "ready",
    person: { userId: "u1", name: "Jesse Rivera" },
    groupsToDelete: [],
    removals: { memberships: 1, rsvps: 0, gaugeVotes: 0, proposalVotes: 0, changeProposalsAsked: 0 },
    survivals: { messages: 0, gaugesSuggested: 0 },
    warnings: [],
    joinAnnouncementCandidates: [],
    contactMethodNote: "any email address on file",
    supabaseAuthId: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  }
}

describe("formatPlanLines, ready, a plain member", () => {
  // Loosened after review: the original pinned two full sentences ("Here is
  // what deleting X will do", "Nothing. They have no messages...") that are
  // pure copy. What matters structurally: the person's name is in there
  // somewhere, the group-membership count is correctly interpolated, and
  // (the one item the coordinator named directly) no email address is ever
  // printed, since that's a real privacy decision, not a style choice.
  it("names the person and their group-membership count, without printing an address", () => {
    const text = formatPlanLines(readyPlan()).join("\n")
    expect(text).toContain("Jesse Rivera")
    expect(text).toContain("1")
    expect(text).not.toContain("@")
  })

  it("says nothing survives when both survival counts are zero, without pinning the wording", () => {
    const zeroText = formatPlanLines(readyPlan()).join("\n")
    const withMessages = formatPlanLines(readyPlan({ survivals: { messages: 3, gaugesSuggested: 0 } })).join("\n")
    // Comparative rather than literal: whatever the zero-case says, it has
    // to be different from what a real survivor produces, which is the
    // actual decision (does the code branch on the count at all).
    expect(zeroText).not.toEqual(withMessages)
    expect(zeroText).not.toContain("3")
  })

  it("omits a removals line entirely when its count is zero, rather than printing '0 RSVP answers'", () => {
    const zeroText = formatPlanLines(readyPlan()).join("\n")
    const withRsvps = formatPlanLines(readyPlan({ removals: { memberships: 1, rsvps: 3, gaugeVotes: 0, proposalVotes: 0, changeProposalsAsked: 0 } })).join("\n")
    // The zero-RSVP plan must not carry the "3" a non-zero one would, and
    // the two outputs must differ: proof the line is genuinely omitted
    // rather than always present with the number swapped out.
    expect(zeroText).not.toEqual(withRsvps)
    expect(withRsvps).toContain("3")
    expect(zeroText).not.toMatch(/\bRSVP\b/i)
  })
})

describe("formatPlanLines, ready, groups being deleted whole", () => {
  // Loosened after review: dropped the literal sentence pins ("Whole groups
  // that will be deleted... is the only person left in them", "including
  // the one(s) being deleted whole above"). The decisions worth keeping:
  // the group is actually named, and the output genuinely differs from a
  // plan with no groups being deleted (proof the branch fires at all,
  // without dictating what it says).
  it("names each solo-founded group, and the output differs from a plan with none", () => {
    const plan = readyPlan({
      groupsToDelete: [{ groupId: "g1", groupName: "Just Me Climbing" }],
      removals: { memberships: 1, rsvps: 0, gaugeVotes: 0, proposalVotes: 0, changeProposalsAsked: 0 },
    })
    const withGroup = formatPlanLines(plan).join("\n")
    const withoutGroup = formatPlanLines(readyPlan()).join("\n")
    expect(withGroup).toContain("Just Me Climbing")
    expect(withGroup).not.toEqual(withoutGroup)
  })
})

describe("formatPlanLines, ready, warnings", () => {
  // Loosened after review: the exact-count-phrase assertions ("2 other
  // people have already voted on it", "1 other person has already voted on
  // it") duplicated what countPhrase's own describe block already tests
  // (singular vs. plural selection), while also pinning the surrounding
  // sentence. Kept: the group is named and the count is present as data.
  it("names the group an open time-change request belongs to, with the voter count present", () => {
    const plan = readyPlan({
      warnings: [{ proposalId: "p1", groupId: "g1", groupName: "Climbing Crew", otherVoterCount: 2 }],
    })
    const text = formatPlanLines(plan).join("\n")
    expect(text).toContain("Climbing Crew")
    expect(text).toContain("2")
  })

  // This one IS a distinct decision worth keeping, not just grammar: zero
  // voters isn't merely the singular/plural boundary case of "N people have
  // voted", it's a qualitatively different situation ("nobody has voted at
  // all yet"). Tested by comparing outputs rather than pinning a sentence:
  // the zero-voter case must not carry a literal "0" the way a real count
  // would, proving the code took a different branch rather than just
  // grammar-inflecting the number 0.
  it("takes a different branch for zero other voters than it does for a real count", () => {
    const withVoters = formatPlanLines(
      readyPlan({ warnings: [{ proposalId: "p1", groupId: "g1", groupName: "X", otherVoterCount: 2 }] })
    ).join("\n")
    const withNone = formatPlanLines(
      readyPlan({ warnings: [{ proposalId: "p1", groupId: "g1", groupName: "X", otherVoterCount: 0 }] })
    ).join("\n")
    expect(withNone).not.toEqual(withVoters)
    expect(withNone).not.toMatch(/\b0\b/)
  })
})

describe("formatPlanLines, ready, join-announcement candidates", () => {
  // Loosened after review: the original pinned the three headings'
  // exact prose verbatim ("Definitely them. They are still a member...",
  // "Probably them.", "Doubtful. Could easily be a different person...").
  // That's the biggest copy-lock risk in this file, since the owner is
  // near-certain to want to reword these once he reads them, and this is
  // exactly the "a name-match-only candidate is marked as doubtful"
  // decision named directly in the review request. Rewritten to test the
  // DECISIONS structurally instead of the sentences:
  //
  //   - ordering is now proven using the candidates' own group names
  //     (data), never the section headings (copy), so it survives any
  //     rewording of the headings untouched.
  //   - the three classes are proven to be visually DISTINCT from each
  //     other (a comparative, wording-independent check) rather than
  //     asserting what any one of them specifically says.
  //   - "doubtful" is checked with a loose family of synonyms rather than
  //     one exact sentence, so the test still catches the real regression
  //     (the caution disappearing entirely) without breaking on a genuine
  //     reword to different-but-still-cautionary language.
  const plan = readyPlan({
    joinAnnouncementCandidates: [
      { messageId: "m1", groupId: "g1", groupName: "Climbing Crew", createdAt: new Date("2026-08-01T00:00:00Z"), evidence: "current-member" },
      { messageId: "m2", groupId: "g2", groupName: "Beer League", createdAt: new Date("2026-07-01T00:00:00Z"), evidence: "left-with-trace" },
      { messageId: "m3", groupId: "g3", groupName: "Trivia Night", createdAt: new Date("2026-06-01T00:00:00Z"), evidence: "name-match-only" },
    ],
  })

  it("states the total candidate count as data", () => {
    const text = formatPlanLines(plan).join("\n")
    expect(text).toContain("3")
  })

  // Finding 3, fix round 1: the summary line used to read the literal
  // string "<name> joined", angle brackets and all, which reads as a
  // broken, unsubstituted template placeholder to a non-technical reader,
  // exactly the kind of thing that makes someone wonder if the tool itself
  // is broken. The person's real name was already available to the caller
  // (plan.person.name); it just wasn't threaded through to this function.
  it("interpolates the real person's name into the join-announcement summary, never the literal placeholder", () => {
    const text = formatPlanLines(plan).join("\n")
    expect(text).toContain(`"${plan.person.name} joined"`)
    expect(text).not.toContain("<name>")
  })

  it("orders current-member before left-with-trace before name-match-only, proven by each group's own name rather than by heading text", () => {
    const text = formatPlanLines(plan).join("\n")
    const iCurrent = text.indexOf("Climbing Crew")
    const iTrace = text.indexOf("Beer League")
    const iDoubtful = text.indexOf("Trivia Night")
    expect(iCurrent).toBeGreaterThan(-1)
    expect(iTrace).toBeGreaterThan(-1)
    expect(iDoubtful).toBeGreaterThan(-1)
    expect(iCurrent).toBeLessThan(iTrace)
    expect(iTrace).toBeLessThan(iDoubtful)
  })

  it("gives each evidence class a visibly different treatment, rather than presenting all three the same way", () => {
    // Extracts the text immediately surrounding each candidate's own group
    // name (its "section") and asserts the three sections are pairwise
    // distinct. This is the structural form of "each class reads
    // differently to the operator"; it doesn't care what any of them say.
    const text = formatPlanLines(plan).join("\n")
    const around = (marker: string) => {
      const i = text.indexOf(marker)
      return text.slice(Math.max(0, i - 120), i)
    }
    const currentSection = around("Climbing Crew")
    const traceSection = around("Beer League")
    const doubtfulSection = around("Trivia Night")
    expect(currentSection).not.toEqual(traceSection)
    expect(traceSection).not.toEqual(doubtfulSection)
    expect(currentSection).not.toEqual(doubtfulSection)
  })

  it("marks the name-match-only class as doubtful, in some recognizable form of that word", () => {
    const text = formatPlanLines(plan).join("\n")
    const i = text.indexOf("Trivia Night")
    const doubtfulSection = text.slice(Math.max(0, i - 200), i)
    // A family of synonyms, not one exact sentence: catches a genuine
    // reword and only fails if the caution is dropped altogether.
    expect(doubtfulSection).toMatch(/doubt|uncertain|not sure|might not|could be a different|stranger|not certain/i)
  })

  it("omits the whole section when there are no candidates, rather than rendering it empty", () => {
    const emptyLines = formatPlanLines(readyPlan({ joinAnnouncementCandidates: [] }))
    const withCandidatesLines = formatPlanLines(plan)
    // Structural, not textual: a plan with three real candidates renders
    // meaningfully more lines than one with none, which is what "the whole
    // section is gone" means as opposed to "the section is there but blank".
    expect(emptyLines.length).toBeLessThan(withCandidatesLines.length)
  })
})

describe("formatJoinAnnouncementPromptLines", () => {
  it("names the group in the interactive prompt, and marks a name-match-only candidate as doubtful without pinning the exact label", () => {
    const line = formatJoinAnnouncementPromptLines({
      messageId: "m1",
      groupId: "g1",
      groupName: "Trivia Night",
      createdAt: new Date("2026-06-12T00:00:00Z"),
      evidence: "name-match-only",
    }).join("\n")
    expect(line).toContain("Trivia Night")
    expect(line).toMatch(/doubt|uncertain|not sure|might not|could be a different|stranger|not certain/i)
  })

  it("gives current-member and name-match-only visibly different labels", () => {
    const definitelyThem = formatJoinAnnouncementPromptLines({
      messageId: "m1",
      groupId: "g1",
      groupName: "X",
      createdAt: new Date("2026-06-12T00:00:00Z"),
      evidence: "current-member",
    }).join("\n")
    const doubtful = formatJoinAnnouncementPromptLines({
      messageId: "m2",
      groupId: "g1",
      groupName: "X",
      createdAt: new Date("2026-06-12T00:00:00Z"),
      evidence: "name-match-only",
    }).join("\n")
    expect(definitelyThem).not.toEqual(doubtful)
  })
})

// ── Finding 1, fix round 2: no em dash or en dash ANYWHERE in the source ───
//
// Round 1's version exercised every exported formatter against
// representative fixtures and asserted their OUTPUT was dash-free. That
// caught real regressions, but it was an enumeration: `parseArgs`'s error
// strings, `lookupPerson`'s returned `.message` strings, and every inline
// literal inside `main()`'s interactive shell ("Found: ...", "This cannot
// be undone.", the safety-stop message, and the rest) were never on the
// list, so those paths were still protected only by a one-time grep, not by
// this test, no matter how the round-1 test's own name read. The reviewer
// caught exactly this gap and named the fix explicitly: do not patch it by
// adding more functions to the enumeration, because an enumerated list of
// call sites always lags the code and the next person to add a printed
// string has no reason to know this list exists. Fix it structurally
// instead: read the SOURCE FILES themselves off disk and scan every byte
// for the two characters, the same shape as this repo's own precedent,
// `src/app/__tests__/no-email-address-on-screen.test.tsx`'s raw-SQL scan
// (`RAW_SQL`, `AUTH_SCHEMA_SQL`, `RAW_SQL_EXCEPTIONS`, `rawSqlOffenders`).
// A source-level scan cannot lag: any new string literal anywhere in either
// file is covered the moment it is typed, whether or not its author has
// ever heard of this test.
//
// TWO DECISIONS, both asked for explicitly and both answered here rather
// than left implicit:
//
// (1) DOES THIS COVER COMMENTS, OR ONLY STRING LITERALS? Comments too,
// deliberately, on the same reasoning the raw-SQL scan states for itself:
// "Comments are not stripped before matching, so prose quoting a query
// reddens too. That is the safe direction to be wrong in: a false red costs
// one sentence reworded, a false green costs the boundary." Precisely
// parsing TypeScript string-literal boundaries (template literals with
// interpolation, escaped quotes, nested backticks) is real parser work for
// a property that a dumb whole-file scan gets for free and cannot get
// wrong in the dangerous direction. The cost of covering comments too is
// that an innocent dash in a comment (like this very sentence would be, if
// it used one) fails the build; the cost of NOT covering them is a real
// printed dash slipping through because a fragile string-literal parser had
// a bug or missed a syntax shape. Round 1 already promised "no em dashes
// anywhere in written output, comments included" as a matter of the user's
// own standing rule, so scanning comments is also just this test actually
// holding that promise rather than a narrower one.
//
// (2) WHICH FILES, AND HOW DOES THE SCAN AVOID TRIPPING ON ITS OWN
// DETECTOR? Both `delete-person.ts` and this file, `delete-person.test.ts`,
// because round 1 also swept THIS file's comments by hand and that sweep
// deserves the same standing protection the script's own output got.
// Scanning this file means scanning the very regex literal below that
// names the two characters it searches for, `EM_OR_EN_DASH`, which legitimately
// contains one of each. That line is not prose anyone is reading; it is
// code that has to spell out the two glyphs to find them anywhere else.
// `DASH_EXCEPTIONS` names it as a single, narrow, line-content exception
// (not a blanket "skip this whole file", which is the shape the reviewer
// explicitly ruled out), and `keeps the one dash exception load-bearing`
// below re-reads the file and asserts the excepted line still exists in
// it, the same discipline `no-email-address-on-screen.test.tsx` uses for
// its own RAW_SQL_EXCEPTIONS: an exception that stops matching anything is
// a hole rather than a documented decision, and this fails loudly the day
// that line is deleted or reworded, rather than quietly becoming decoration.
//
// SCOPE, stated rather than left to guesswork: this deliberately covers
// only the two files task 3 owns, not the whole `scripts/` directory or the
// whole repository. Widening it to match the raw-SQL scan's eventual
// repo-wide reach (its own history: it started scoped to `src/`, per its
// own comments, and was widened later, deliberately, in its own slice) is a
// reasonable future step but is out of this task's lane; noted rather than
// done here.
describe("no em dash or en dash anywhere in the source, structurally", () => {
  const DASH_CHAR_CLASS = /[–—]/
  const SCANNED_FILES = ["delete-person.ts", "delete-person.test.ts"]

  // Matched by a DASH-FREE PREFIX rather than the exact line text, and this
  // is not a stylistic choice: writing the exact target line as a string
  // here would mean typing the two characters under test into ANOTHER
  // string literal in this same file, which the scanner would then flag as
  // a second, undocumented offense (the first attempt at this test did
  // exactly that and failed on its own exception table). A prefix that
  // identifies the line without reproducing the characters it exists to
  // find sidesteps the problem rather than working around it.
  const DASH_EXCEPTIONS: ReadonlyArray<{ file: string; linePrefix: string; why: string }> = [
    {
      file: "delete-person.test.ts",
      linePrefix: "const DASH_CHAR_CLASS =",
      why:
        "This is the detector's own pattern, not a sentence anyone wrote to communicate: " +
        "it has to name the two characters it searches for, inside a regex character " +
        "class, or it could not find either one anywhere else in either file. Nothing " +
        "else on this line is prose; it is code that happens to contain the two glyphs " +
        "under test, the same shape as no-email-address-on-screen.test.tsx's own " +
        "RAW_SQL_EXCEPTIONS entries.",
    },
  ]

  function dashOffenders(): string[] {
    const offenders: string[] = []
    for (const relativeName of SCANNED_FILES) {
      const source = readFileSync(path.join(__dirname, relativeName), "utf8")
      source.split("\n").forEach((line, idx) => {
        if (!DASH_CHAR_CLASS.test(line)) return
        const exempt = DASH_EXCEPTIONS.some(
          (e) => e.file === relativeName && line.trim().startsWith(e.linePrefix)
        )
        if (!exempt) offenders.push(`${relativeName}:${idx + 1}: ${line.trim()}`)
      })
    }
    return offenders
  }

  it("contains no em dash or en dash character anywhere in either file, comments included, except the one named exception", () => {
    expect(dashOffenders()).toEqual([])
  })

  it("keeps the one dash exception load-bearing, so it cannot rot into a blanket loophole", () => {
    for (const { file, linePrefix, why } of DASH_EXCEPTIONS) {
      const filePath = path.join(__dirname, file)
      expect(existsSync(filePath)).toBe(true)
      const source = readFileSync(filePath, "utf8")
      const matchingLines = source.split("\n").filter((line) => line.trim().startsWith(linePrefix))
      // The prefix has to match at least one real line, and at least one of
      // those matches has to actually carry a dash character; otherwise the
      // exception is excusing nothing and has become decoration rather than
      // a documented decision.
      expect(matchingLines.length).toBeGreaterThan(0)
      expect(matchingLines.some((line) => DASH_CHAR_CLASS.test(line))).toBe(true)
      expect(why.trim().length).toBeGreaterThan(80)
    }
  })
})

// ── formatReceiptLines / formatSupabaseInstructionLines ────────────────────

describe("formatReceiptLines", () => {
  function receipt(overrides: Partial<DeletionReceipt> = {}): DeletionReceipt {
    return {
      person: { userId: "u1", name: "Jesse Rivera" },
      groupsDeleted: [],
      joinAnnouncementMessagesDeleted: 0,
      removals: { memberships: 0, rsvps: 0, gaugeVotes: 0, proposalVotes: 0, changeProposalsAsked: 0 },
      userDeleted: true,
      ...overrides,
    }
  }

  // Loosened after review: "has been deleted" / "does NOT show as deleted"
  // were exact phrases. The real decision is that success and failure read
  // differently to the operator, tested comparatively so a reword of either
  // sentence doesn't break the test; only actually collapsing the two
  // cases into identical text would.
  it("names the person either way, and flags the failure case as genuinely different rather than reusing success language", () => {
    const success = formatReceiptLines(receipt()).join("\n")
    const failure = formatReceiptLines(receipt({ userDeleted: false })).join("\n")
    expect(success).toContain("Jesse Rivera")
    expect(failure).toContain("Jesse Rivera")
    // The failure case must not just be the success sentence with the name
    // swapped in; it has to say something the success case doesn't.
    expect(failure).not.toEqual(success)
  })

  it("lists deleted groups by name", () => {
    const text = formatReceiptLines(receipt({ groupsDeleted: [{ groupId: "g1", groupName: "Just Me Climbing" }] })).join("\n")
    expect(text).toContain("Just Me Climbing")
  })

  it("summarizes non-zero removal counts and omits zero ones", () => {
    const withCounts = formatReceiptLines(
      receipt({ removals: { memberships: 2, rsvps: 3, gaugeVotes: 0, proposalVotes: 0, changeProposalsAsked: 0 } })
    ).join("\n")
    const allZero = formatReceiptLines(receipt()).join("\n")
    expect(withCounts).toContain("2")
    expect(withCounts).toContain("3")
    // Proof the zero categories are genuinely omitted, not just zeroed out:
    // the all-zero receipt's line is shorter/different, not "0" everywhere.
    expect(allZero).not.toContain("2")
    expect(allZero).not.toContain("3")
  })

  it("always states the join-announcement removal count, even when zero, unlike the other zero counts above", () => {
    const text = formatReceiptLines(receipt()).join("\n")
    // This field is deliberately exempt from the zero-omission rule (the
    // operator needs to know it really did check for join lines and find
    // none, not that the line was silently dropped). Checked structurally:
    // the digit is present alongside the word "joined", not as one
    // punctuated sentence.
    expect(text).toMatch(/joined/i)
    expect(text).toMatch(/\b0\b/)
  })
})

describe("formatSupabaseInstructionLines", () => {
  // The id and the destination name ("Supabase dashboard") are kept as
  // exact checks deliberately: the id is the actual operational payload the
  // operator has to copy, not prose, and "Supabase dashboard" names a real
  // destination rather than a stylistic turn of phrase. The "nothing to do"
  // wording, by contrast, is loosened to a family rather than one sentence.
  it("prints the auth id and dashboard instruction when one is on file", () => {
    const lines = formatSupabaseInstructionLines("11111111-1111-1111-1111-111111111111", "Jesse Rivera").join("\n")
    expect(lines).toMatch(/11111111-1111-1111-1111-111111111111/)
    expect(lines).toMatch(/Supabase dashboard/)
  })

  // The decision that actually matters here: when there's no login on file,
  // the operator must NOT be sent to the dashboard for nothing. That
  // negative check is the load-bearing one; the reassurance wording itself
  // is loosened.
  it("does not send the operator to the dashboard when there is no Supabase login on file", () => {
    const lines = formatSupabaseInstructionLines(null, "Jesse Rivera").join("\n")
    expect(lines).toMatch(/nothing|no .*(login|account)/i)
    expect(lines).not.toMatch(/dashboard/)
  })
})

// ── Person lookup, against real rows ────────────────────────────────────────

describe("findPeopleByEmail", () => {
  it("finds the one person with that address, matching case-insensitively", async () => {
    const target = await makeUser(`[TEST] DS Email Target ${stamp()}`)
    const email = `ds-email-${stamp()}@example.com`
    await makeEmail(target.id, email)

    const matches = await findPeopleByEmail(email.toUpperCase())
    expect(matches.map((m) => m.userId)).toEqual([target.id])
  })

  it("returns nothing for an address nobody has on file", async () => {
    const matches = await findPeopleByEmail(`ds-nobody-${stamp()}@example.com`)
    expect(matches).toEqual([])
  })

  it("never reads back the address itself: only userId leaves the query, so nothing here could print one", async () => {
    const target = await makeUser(`[TEST] DS Email Shape ${stamp()}`)
    const email = `ds-shape-${stamp()}@example.com`
    await makeEmail(target.id, email)

    const matches = await findPeopleByEmail(email)
    expect(matches).toHaveLength(1)
    expect(Object.keys(matches[0])).toEqual(["userId", "name", "createdAt", "memberships"])
  })

  it("the ContactMethod query itself never selects value, at the source level (a stronger guarantee than the returned shape above, which would not catch an unused field being fetched)", () => {
    // Scoped to the `select` clause specifically, not the whole call: the
    // WHERE clause legitimately filters on `value` (that's how the address
    // is looked up), and that mention is fine. What must never happen is
    // `value` appearing in `select`, which is what would let the address
    // itself flow into this process's memory a second time.
    const source = readFileSync(path.join(__dirname, "delete-person.ts"), "utf8")
    const callStart = source.indexOf("prisma.contactMethod.findMany(")
    expect(callStart).toBeGreaterThan(-1)
    const selectStart = source.indexOf("select:", callStart)
    expect(selectStart).toBeGreaterThan(-1)
    const selectEnd = source.indexOf("}", selectStart)
    const select = source.slice(selectStart, selectEnd + 1)
    expect(select).toMatch(/select:\s*\{\s*userId:\s*true\s*,?\s*\}/)
    expect(select).not.toMatch(/value/)
  })
})

describe("resolveGroup", () => {
  it("resolves by exact id", async () => {
    const founder = await makeUser(`[TEST] DS Resolve Founder ${stamp()}`)
    const group = await makeGroup(`[TEST] DS Resolve By Id ${stamp()}`, founder.id)

    const result = await resolveGroup(group.id)
    expect(result).toEqual({ kind: "found", groupId: group.id, groupName: group.name })
  })

  it("resolves by name, case-insensitively", async () => {
    const founder = await makeUser(`[TEST] DS Resolve Founder2 ${stamp()}`)
    const name = `[TEST] DS Resolve By Name ${stamp()}`
    const group = await makeGroup(name, founder.id)

    const result = await resolveGroup(name.toUpperCase())
    expect(result).toEqual({ kind: "found", groupId: group.id, groupName: group.name })
  })

  it("reports not-found for a name that matches nothing", async () => {
    const result = await resolveGroup(`[TEST] DS Nothing Named This ${stamp()}`)
    expect(result).toEqual({ kind: "not-found" })
  })

  it("reports ambiguous when two groups share the exact name", async () => {
    const founder = await makeUser(`[TEST] DS Resolve Founder3 ${stamp()}`)
    const name = `[TEST] DS Duplicate Name ${stamp()}`
    const g1 = await makeGroup(name, founder.id)
    const g2 = await makeGroup(name, founder.id)

    const result = await resolveGroup(name)
    expect(result.kind).toBe("ambiguous")
    if (result.kind !== "ambiguous") throw new Error("expected ambiguous")
    expect(result.groups.map((g) => g.groupId).sort()).toEqual([g1.id, g2.id].sort())
  })
})

describe("findPeopleByNameAndGroup", () => {
  it("finds the one member with that name in that group", async () => {
    const founder = await makeUser(`[TEST] DS NG Founder ${stamp()}`)
    const memberName = `[TEST] DS NG Member ${stamp()}`
    const member = await makeUser(memberName)
    const group = await makeGroup(`[TEST] DS NG Group ${stamp()}`, founder.id, [member.id])

    const result = await findPeopleByNameAndGroup(memberName, group.id)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok")
    expect(result.matches.map((m) => m.userId)).toEqual([member.id])
  })

  it("matches the member's name case-insensitively, same as email and group lookup", async () => {
    const founder = await makeUser(`[TEST] DS NG CaseFounder ${stamp()}`)
    const memberName = `[TEST] DS NG Case ${stamp()}`
    const member = await makeUser(memberName)
    const group = await makeGroup(`[TEST] DS NG CaseGroup ${stamp()}`, founder.id, [member.id])

    const result = await findPeopleByNameAndGroup(memberName.toUpperCase(), group.id)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok")
    expect(result.matches.map((m) => m.userId)).toEqual([member.id])
  })

  it("reports group-not-found when the group doesn't resolve", async () => {
    const result = await findPeopleByNameAndGroup("Whoever", `[TEST] DS Missing Group ${stamp()}`)
    expect(result).toEqual({ kind: "group-not-found" })
  })

  it("reports both matches when two members of the same group share a name", async () => {
    const founder = await makeUser(`[TEST] DS NG Founder2 ${stamp()}`)
    const sharedName = `[TEST] DS NG Shared ${stamp()}`
    const a = await makeUser(sharedName)
    const b = await makeUser(sharedName)
    const group = await makeGroup(`[TEST] DS NG SharedGroup ${stamp()}`, founder.id, [a.id, b.id])

    const result = await findPeopleByNameAndGroup(sharedName, group.id)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok")
    expect(result.matches.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort())
  })

  it("returns no matches (not an error) when nobody by that name is in the group", async () => {
    const founder = await makeUser(`[TEST] DS NG Founder3 ${stamp()}`)
    const group = await makeGroup(`[TEST] DS NG EmptyMatch ${stamp()}`, founder.id)

    const result = await findPeopleByNameAndGroup(`[TEST] Nobody Here ${stamp()}`, group.id)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok")
    expect(result.matches).toEqual([])
  })
})

describe("lookupPerson", () => {
  it("finds one person by email", async () => {
    const target = await makeUser(`[TEST] DS Lookup Email ${stamp()}`)
    const email = `ds-lookup-${stamp()}@example.com`
    await makeEmail(target.id, email)

    const outcome = await lookupPerson({ email, name: null, group: null, userId: null, productionOverride: false })
    expect(outcome).toEqual({ kind: "found", match: expect.objectContaining({ userId: target.id }) })
  })

  it("reports ambiguous when a name+group search matches two people, without picking one", async () => {
    const founder = await makeUser(`[TEST] DS Lookup Founder ${stamp()}`)
    const sharedName = `[TEST] DS Lookup Shared ${stamp()}`
    const a = await makeUser(sharedName)
    const b = await makeUser(sharedName)
    const group = await makeGroup(`[TEST] DS Lookup Ambig Group ${stamp()}`, founder.id, [a.id, b.id])

    const outcome = await lookupPerson({ email: null, name: sharedName, group: group.id, userId: null, productionOverride: false })
    expect(outcome.kind).toBe("ambiguous")
    if (outcome.kind !== "ambiguous") throw new Error("expected ambiguous")
    expect(outcome.matches.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort())
  })

  it("narrows an otherwise-ambiguous match down to one person with --user-id", async () => {
    const founder = await makeUser(`[TEST] DS Lookup Founder2 ${stamp()}`)
    const sharedName = `[TEST] DS Lookup Shared2 ${stamp()}`
    const a = await makeUser(sharedName)
    const b = await makeUser(sharedName)
    const group = await makeGroup(`[TEST] DS Lookup Narrow Group ${stamp()}`, founder.id, [a.id, b.id])

    const outcome = await lookupPerson({ email: null, name: sharedName, group: group.id, userId: a.id, productionOverride: false })
    expect(outcome).toEqual({ kind: "found", match: expect.objectContaining({ userId: a.id }) })
  })

  it("reports not-found with a plain-language message when the email matches nobody", async () => {
    const outcome = await lookupPerson({
      email: `ds-lookup-nobody-${stamp()}@example.com`,
      name: null,
      group: null,
      userId: null,
      productionOverride: false,
    })
    expect(outcome.kind).toBe("not-found")
    if (outcome.kind !== "not-found") throw new Error("expected not-found")
    expect(outcome.message).toMatch(/No one in the product has that email address/)
  })

  // Closes a gap found during the fix-round review: resolveGroup's own
  // ambiguous-groups detection was tested directly, but lookupPerson's
  // PROPAGATION of that result (turning it into a "not-found" that lists
  // every candidate group, rather than the ordinary "no group matches"
  // message) had no test at all. Checked structurally: both group names
  // appear in the message (real data), not by pinning the surrounding
  // sentence.
  it("propagates an ambiguous group name as not-found, listing every candidate group by name", async () => {
    const founder = await makeUser(`[TEST] DS Lookup GroupAmbig Founder ${stamp()}`)
    const dupName = `[TEST] DS Lookup GroupAmbig ${stamp()}`
    const g1 = await makeGroup(dupName, founder.id)
    const g2 = await makeGroup(dupName, founder.id)

    const outcome = await lookupPerson({ email: null, name: "Whoever", group: dupName, userId: null, productionOverride: false })
    expect(outcome.kind).toBe("not-found")
    if (outcome.kind !== "not-found") throw new Error("expected not-found")
    expect(outcome.message).toContain(g1.id)
    expect(outcome.message).toContain(g2.id)
  })
})
