// scripts/delete-person.ts
//
// The only tool that destroys a real person's data in this product. When
// somebody emails asking to be forgotten, the owner runs this by hand. He
// does not read code, so what this script PRINTS is the entire interface:
// there is no dashboard, no confirmation screen, nothing else standing
// between a support email and an irreversible delete.
//
// It is a thin shell around two already-reviewed modules that do the real
// thinking, and it adds none of its own: src/lib/people/deletion-plan.ts
// decides what deleting someone would do (read-only), and
// src/lib/people/delete-person.ts applies that decision inside one
// transaction (the only writer). Read both files' doc comments before
// touching this one; they carry decisions from two rounds of review.
//
// ONE THING THIS SCRIPT OWNS THAT NEITHER MODULE WILL DECIDE FOR IT: which
// "<name> joined" lines get deleted alongside the person. deletion-plan.ts
// finds every candidate and sorts each into one of three evidence classes
// (current-member, left-with-trace, name-match-only), and deliberately does
// not choose among them, because "name-match-only" can be a genuine match
// who left no other trace, or a total stranger who happens to share a name.
// This script is the caller deletePerson's own doc comment describes: it
// shows every candidate to the operator, one at a time, and only passes
// along the ids the operator actually confirms.
//
// WHY THIS FILE READS ContactMethod DIRECTLY, which nothing else under src/
// is allowed to do. src/app/__tests__/no-email-address-on-screen.test.tsx
// scans src/ for every place that can read a member's address and pins the
// count at exactly three, all inside the auth seam; a fourth site there
// reddens that test on purpose. This script lives in scripts/, outside that
// scan, because "find the person this email belongs to" is exactly the job
// an operator-run deletion tool exists to do, and it has nowhere else to
// live. It reads only the userId off ContactMethod, never the address
// itself (see findPeopleByEmail below), and this file must never be moved
// under src/ or turned into a helper something under src/ imports.
//
// WHY THE ADDRESS NEVER REACHES THE TERMINAL EITHER, which is stricter than
// the guard above requires. The operator already knows the address; he
// typed it to find this person. Every confirmation below is done by name and
// group instead, on the reasoning that the fewer places an address is
// printed, the fewer places it can end up in a screenshot or a scrollback.
//
// Usage:
//   npm run person:delete -- --email jesse@example.com
//   npm run person:delete -- --name "Jesse Rivera" --group "Climbing Crew"
//   npm run person:delete -- --email jesse@example.com --user-id abc123   (disambiguates a tie)
//   npm run person:delete -- --email jesse@example.com --i-know-this-is-production
//
// --group accepts either a group's exact name or its id. --user-id is the
// escape hatch for the case the task brief calls out by name: if two people
// share the typed name, the script prints both (with their groups and join
// dates) and stops rather than guess, and the operator re-runs with
// --user-id set to the one they mean.
//
// The database guard is the single most important thing in this file. It
// refuses to run at all unless the checkout is confirmed dev-test, in the
// same shape scripts/db-which.ts already prints, UNLESS
// --i-know-this-is-production is passed explicitly. That flag does not
// relax anything else: an ambiguous or broken .env (mixed refs, a missing
// variable) still refuses outright, flag or not, because a script that
// deletes people has no business guessing which database it is even
// pointed at.

import { createInterface } from "node:readline/promises"
import { ContactMethodType } from "@prisma/client"
import { prisma } from "../src/lib/prisma"
import { judge, extractSupabaseRef, extractPoolerRef, EXPECTED_DEV_TEST_REF, type Verdict } from "./db-which"
import {
  buildDeletionPlan,
  type DeletionPlan,
  type JoinAnnouncementCandidate,
  type JoinAnnouncementEvidence,
} from "../src/lib/people/deletion-plan"
import { deletePerson, type DeletionReceipt } from "../src/lib/people/delete-person"

// ── Small text helpers, shared by every formatter below ─────────────────────

/**
 * Task 8 of this slice adds this file. Named explicitly rather than as "the
 * runbook": the owner does not read code, and a path he can find (or hand to
 * someone who can) beats a noun he has to guess at. Exported so the test can
 * assert against this constant instead of a second hardcoded copy of the
 * path, which is the actual destination under test, not a wording choice.
 */
export const RUNBOOK_PATH = "docs/runbooks/person-deletion.md"

/** "1 group" / "3 groups", with an irregular plural when the noun needs one. */
export function countPhrase(n: number, singular: string, plural: string = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

// ── Argument parsing (pure) ──────────────────────────────────────────────────

export interface DeletePersonArgs {
  email: string | null
  name: string | null
  group: string | null
  userId: string | null
  productionOverride: boolean
}

export type ParsedArgs = { ok: true; args: DeletePersonArgs } | { ok: false; error: string }

export const USAGE = [
  "Usage:",
  '  npm run person:delete -- --email jesse@example.com',
  '  npm run person:delete -- --name "Jesse Rivera" --group "Climbing Crew"',
  "",
  "Options:",
  "  --email <address>       find the person by their email address",
  "  --name <name>           find the person by name (needs --group too)",
  "  --group <name or id>    the group to search within, for --name",
  "  --user-id <id>          pick one specific person when a search matches more than one",
  "  --i-know-this-is-production   required to run against anything other than dev-test",
].join("\n")

export function parseArgs(argv: string[]): ParsedArgs {
  let email: string | null = null
  let name: string | null = null
  let group: string | null = null
  let userId: string | null = null
  let productionOverride = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--email") {
      email = argv[++i] ?? null
      if (email === null) return { ok: false, error: "--email needs a value." }
    } else if (arg === "--name") {
      name = argv[++i] ?? null
      if (name === null) return { ok: false, error: "--name needs a value." }
    } else if (arg === "--group") {
      group = argv[++i] ?? null
      if (group === null) return { ok: false, error: "--group needs a value." }
    } else if (arg === "--user-id") {
      userId = argv[++i] ?? null
      if (userId === null) return { ok: false, error: "--user-id needs a value." }
    } else if (arg === "--i-know-this-is-production") {
      productionOverride = true
    } else {
      return { ok: false, error: `Unrecognized option: ${arg}\n\n${USAGE}` }
    }
  }

  if (email && (name || group)) {
    return { ok: false, error: `Use either --email, or --name plus --group. Not both.\n\n${USAGE}` }
  }
  if (!email && !name && !group) {
    return { ok: false, error: `Provide --email <address>, or --name <name> plus --group <name or id>.\n\n${USAGE}` }
  }
  if (!email && (!name || !group)) {
    return { ok: false, error: `When not using --email, both --name and --group are required.\n\n${USAGE}` }
  }

  return { ok: true, args: { email, name, group, userId, productionOverride } }
}

// ── The database guard ───────────────────────────────────────────────────────

export interface GuardDecision {
  proceed: boolean
  lines: string[]
}

/**
 * The one check that must never be gotten wrong. `verdict` is db-which's own
 * judgement over the three env sources; `hasOverrideFlag` is whether
 * --i-know-this-is-production was passed.
 *
 * judge() folds "the ref is known but it isn't dev-test" into `problems`
 * too (it is what makes db:which's own error output readable), so
 * `problems.length` alone cannot tell that case apart from a genuinely
 * unclear one. `verdict.ref` can: judge() only ever sets it once all three
 * env sources that ARE present agree with each other, so a null ref means
 * something is genuinely unresolved (missing, unparseable, or disagreeing
 * sources) and a non-null ref means a specific project was identified, dev-
 * test or not.
 *
 * A null ref refuses outright REGARDLESS of the override flag: the flag
 * means "I know this is production," and a script that cannot even tell
 * what database it is pointed at has no business accepting that as an
 * answer. The flag only ever unlocks the case where a specific project was
 * identified and it simply is not dev-test.
 */
export function evaluateDatabaseGuard(verdict: Verdict, hasOverrideFlag: boolean): GuardDecision {
  if (verdict.ok) {
    return {
      proceed: true,
      lines: [`This checkout is pointed at DEV-TEST (project ${verdict.ref}). Safe to run.`],
    }
  }

  if (verdict.ref === null) {
    return {
      proceed: false,
      lines: [
        "STOP: could not confirm which database this checkout is pointed at.",
        ...verdict.problems.map((p) => `  - ${p}`),
        "Run npm run db:which and resolve it before running this script again.",
      ],
    }
  }

  // A specific, identified project ref, and it is not dev-test: a real
  // database with real people's data in it.
  if (!hasOverrideFlag) {
    return {
      proceed: false,
      lines: [
        `STOP: this checkout is pointed at project ${verdict.ref}, which is NOT dev-test.`,
        ...verdict.problems.map((p) => `  - ${p}`),
        "This script deletes a real person's data for good. If you mean to run it against production, re-run with --i-know-this-is-production.",
      ],
    }
  }

  return {
    proceed: true,
    lines: [
      `WARNING: running against project ${verdict.ref}, which is NOT dev-test.`,
      ...verdict.problems.map((p) => `  - ${p}`),
      "Proceeding because --i-know-this-is-production was passed. There is no undo past this point.",
    ],
  }
}

/** Same three lines scripts/db-which.ts prints, reusing its own extractors. */
export function formatDatabaseIdentityLines(env: Record<string, string | undefined>): string[] {
  return (
    [
      ["NEXT_PUBLIC_SUPABASE_URL", extractSupabaseRef(env.NEXT_PUBLIC_SUPABASE_URL)],
      ["DATABASE_URL", extractPoolerRef(env.DATABASE_URL)],
      ["DIRECT_URL", extractPoolerRef(env.DIRECT_URL)],
    ] as const
  ).map(([name, ref]) => `${name.padEnd(26)} → ${ref ?? "(no ref found)"}`)
}

// ── Finding the person ───────────────────────────────────────────────────────

export interface PersonMembershipSummary {
  groupId: string
  groupName: string
  isFounder: boolean
}

export interface PersonMatch {
  userId: string
  name: string
  createdAt: Date
  memberships: PersonMembershipSummary[]
}

async function loadPersonMatch(userId: string): Promise<PersonMatch> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      memberships: {
        select: { group: { select: { id: true, name: true, founderId: true } } },
      },
    },
  })
  return {
    userId: user.id,
    name: user.name,
    createdAt: user.createdAt,
    memberships: user.memberships.map((m) => ({
      groupId: m.group.id,
      groupName: m.group.name,
      isFounder: m.group.founderId === user.id,
    })),
  }
}

/**
 * The only place in this file (or anywhere outside src/lib/auth) that reads
 * ContactMethod. It selects userId ONLY: the address itself never enters
 * this process's memory a second time after Prisma parses the row, and it
 * is never printed.
 */
export async function findPeopleByEmail(email: string): Promise<PersonMatch[]> {
  // Supabase stores addresses lowercased; matching it keeps this lookup
  // working regardless of how the operator capitalized what they typed.
  const normalized = email.trim().toLowerCase()
  const rows = await prisma.contactMethod.findMany({
    where: { type: ContactMethodType.EMAIL, value: normalized },
    select: { userId: true },
  })
  const uniqueIds = [...new Set(rows.map((r) => r.userId))]
  return Promise.all(uniqueIds.map(loadPersonMatch))
}

export type GroupResolution =
  | { kind: "found"; groupId: string; groupName: string }
  | { kind: "not-found" }
  | { kind: "ambiguous"; groups: { groupId: string; groupName: string; memberCount: number }[] }

/** --group accepts either a group's id (exact) or its name (case-insensitive). */
export async function resolveGroup(groupNameOrId: string): Promise<GroupResolution> {
  const trimmed = groupNameOrId.trim()

  const byId = await prisma.group.findUnique({ where: { id: trimmed }, select: { id: true, name: true } })
  if (byId) return { kind: "found", groupId: byId.id, groupName: byId.name }

  const matches = await prisma.group.findMany({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, _count: { select: { memberships: true } } },
  })
  if (matches.length === 0) return { kind: "not-found" }
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      groups: matches.map((g) => ({ groupId: g.id, groupName: g.name, memberCount: g._count.memberships })),
    }
  }
  return { kind: "found", groupId: matches[0].id, groupName: matches[0].name }
}

export type NameAndGroupResult =
  | { kind: "group-not-found" }
  | { kind: "group-ambiguous"; groups: { groupId: string; groupName: string; memberCount: number }[] }
  | { kind: "ok"; groupName: string; matches: PersonMatch[] }

export async function findPeopleByNameAndGroup(name: string, groupNameOrId: string): Promise<NameAndGroupResult> {
  const group = await resolveGroup(groupNameOrId)
  if (group.kind === "not-found") return { kind: "group-not-found" }
  if (group.kind === "ambiguous") return { kind: "group-ambiguous", groups: group.groups }

  const memberships = await prisma.membership.findMany({
    where: { groupId: group.groupId, user: { name: { equals: name.trim(), mode: "insensitive" } } },
    select: { userId: true },
  })
  const matches = await Promise.all(memberships.map((m) => loadPersonMatch(m.userId)))
  return { kind: "ok", groupName: group.groupName, matches }
}

export type LookupOutcome =
  | { kind: "found"; match: PersonMatch }
  | { kind: "not-found"; message: string }
  | { kind: "ambiguous"; matches: PersonMatch[] }

/**
 * The whole lookup: dispatches on --email vs --name/--group, then narrows by
 * --user-id if it was given. If more than one person still matches after
 * that, it is genuinely ambiguous and the caller must stop: the confirmation
 * step later types a NAME, and a typed name can only disambiguate one
 * specific person id decided here, not two people who share it.
 */
export async function lookupPerson(args: DeletePersonArgs): Promise<LookupOutcome> {
  let matches: PersonMatch[]

  if (args.email) {
    matches = await findPeopleByEmail(args.email)
    if (matches.length === 0) {
      return { kind: "not-found", message: "No one in the product has that email address on file." }
    }
  } else {
    const result = await findPeopleByNameAndGroup(args.name!, args.group!)
    if (result.kind === "group-not-found") {
      return {
        kind: "not-found",
        message: `No group matches "${args.group}". Check the spelling, or use the group's id instead.`,
      }
    }
    if (result.kind === "group-ambiguous") {
      const lines = result.groups.map((g) => `  - "${g.groupName}" (id: ${g.groupId}, ${countPhrase(g.memberCount, "member")})`)
      return {
        kind: "not-found",
        message: [`More than one group is named "${args.group}":`, ...lines, "Re-run with --group <id>, using one of the ids above."].join("\n"),
      }
    }
    matches = result.matches
    if (matches.length === 0) {
      return { kind: "not-found", message: `Nobody named "${args.name}" is a member of "${result.groupName}".` }
    }
  }

  if (args.userId) {
    const narrowed = matches.filter((m) => m.userId === args.userId)
    if (narrowed.length === 0) {
      return { kind: "not-found", message: `None of the matches have user id ${args.userId}.` }
    }
    matches = narrowed
  }

  if (matches.length > 1) return { kind: "ambiguous", matches }
  return { kind: "found", match: matches[0] }
}

/** Enough detail (per the task brief) for the operator to tell two same-named people apart. */
export function formatCandidateLines(matches: PersonMatch[]): string[] {
  const lines: string[] = ["More than one person matches. Here they are:", ""]
  for (const m of matches) {
    lines.push(`- ${m.name}  (id: ${m.userId}; joined the product ${m.createdAt.toDateString()})`)
    if (m.memberships.length === 0) {
      lines.push("    not currently in any group")
    } else {
      for (const ms of m.memberships) {
        lines.push(`    ${ms.isFounder ? "founder of" : "member of"} "${ms.groupName}"`)
      }
    }
  }
  lines.push("")
  lines.push("Re-run with --user-id <id>, using one of the ids above, to pick one.")
  return lines
}

// ── Plan → plain language ────────────────────────────────────────────────────

const EVIDENCE_ORDER: JoinAnnouncementEvidence[] = ["current-member", "left-with-trace", "name-match-only"]

const EVIDENCE_SECTION_HEADING: Record<JoinAnnouncementEvidence, string> = {
  "current-member": "Definitely them. They are still a member of this group:",
  "left-with-trace":
    "Probably them. They're no longer a member, but they left another trace there (a message, an RSVP, or a vote):",
  "name-match-only":
    "Doubtful. Could easily be a different person who just happens to share this name. Nothing else ties them to this group:",
}

const EVIDENCE_SHORT_LABEL: Record<JoinAnnouncementEvidence, string> = {
  "current-member": "definitely them",
  "left-with-trace": "probably them",
  "name-match-only": "doubtful, could be a different person",
}

export type ConfirmationDefault = "yes" | "no"

/**
 * "name-match-only" is the one class the plan's own doc comment calls
 * genuinely doubtful, so it is the one class that defaults to leaving the
 * message alone. The other two default to deleting it, because both mean
 * the person really was in that group.
 */
export function defaultConfirmationFor(evidence: JoinAnnouncementEvidence): ConfirmationDefault {
  return evidence === "name-match-only" ? "no" : "yes"
}

function formatJoinCandidateLine(c: JoinAnnouncementCandidate): string {
  return `  - "${c.groupName}", joined ${c.createdAt.toDateString()}`
}

function formatJoinAnnouncementSummaryLines(candidates: JoinAnnouncementCandidate[], personName: string): string[] {
  if (candidates.length === 0) return []

  const lines: string[] = [
    `"${personName} joined" messages found around the product: ${candidates.length} total.`,
    "These are the lines a group's chat shows when someone joins. The product can't always be certain which ones are this person's own, so you'll be asked about each one before anything is deleted.",
    "",
  ]

  for (const evidence of EVIDENCE_ORDER) {
    const inClass = candidates.filter((c) => c.evidence === evidence)
    if (inClass.length === 0) continue
    lines.push(EVIDENCE_SECTION_HEADING[evidence])
    for (const c of inClass) lines.push(formatJoinCandidateLine(c))
    lines.push("")
  }

  return lines
}

export function formatJoinAnnouncementPromptLines(c: JoinAnnouncementCandidate): string[] {
  return [`"${c.groupName}", joined ${c.createdAt.toDateString()} (${EVIDENCE_SHORT_LABEL[c.evidence]})`]
}

function formatBlockedPlanLines(plan: Extract<DeletionPlan, { kind: "blocked" }>): string[] {
  const lines: string[] = ["This person cannot be deleted yet.", ""]

  for (const group of plan.groups) {
    const names = group.otherMembers.map((m) => m.name).join(", ")
    lines.push(
      `They started the group "${group.groupName}", and ${countPhrase(group.otherMembers.length, "other person is", "other people are")} still in it: ${names}.`
    )
    // The runbook's founder-handover step needs these two ids for a direct
    // database update (the group's own id, and whichever member becomes the
    // new founder). Printed here, plainly labeled and each on its own line,
    // so the operator can copy one straight out of this terminal instead of
    // opening Prisma Studio to look them up by hand at the exact moment
    // he's doing the rarest, most dangerous thing this tool supports.
    lines.push(`  Group id: ${group.groupId}`)
    for (const member of group.otherMembers) {
      lines.push(`  ${member.name}'s user id: ${member.userId}`)
    }
  }

  lines.push("")
  lines.push("What to do next:")
  lines.push("  1. Ask the group who should take over as the founder of that group.")
  lines.push(
    `  2. Hand the group over by hand, following ${RUNBOOK_PATH}. There is no in-app way to do this yet.`
  )
  lines.push("  3. Run this script again. Once they are no longer the sole founder of a group with other people in it, it will be ready to delete them.")

  return lines
}

function formatReadyPlanLines(plan: Extract<DeletionPlan, { kind: "ready" }>): string[] {
  const lines: string[] = [`Here is what deleting ${plan.person.name} will do.`, ""]

  if (plan.groupsToDelete.length > 0) {
    lines.push(`Whole groups that will be deleted, because ${plan.person.name} is the only person left in them:`)
    for (const g of plan.groupsToDelete) lines.push(`  - "${g.groupName}"`)
    lines.push("")
  }

  const goesWith: string[] = []
  if (plan.removals.memberships > 0) {
    const suffix = plan.groupsToDelete.length > 0 ? ", including the one(s) being deleted whole above" : ""
    goesWith.push(`- Their spot in ${countPhrase(plan.removals.memberships, "group")} they belong to${suffix}`)
  }
  if (plan.removals.rsvps > 0) goesWith.push(`- ${countPhrase(plan.removals.rsvps, "RSVP answer")} on events`)
  if (plan.removals.gaugeVotes > 0) goesWith.push(`- ${countPhrase(plan.removals.gaugeVotes, "vote")} on ideas being gauged`)
  if (plan.removals.proposalVotes > 0) goesWith.push(`- ${countPhrase(plan.removals.proposalVotes, "vote")} on time-change requests`)
  if (plan.removals.changeProposalsAsked > 0) goesWith.push(`- ${countPhrase(plan.removals.changeProposalsAsked, "time-change request")} they made`)
  goesWith.push(`- ${plan.contactMethodNote}, if there is one`)

  lines.push("What goes with them:")
  lines.push(...goesWith)
  lines.push("")

  const staysBehind: string[] = []
  if (plan.survivals.messages > 0) {
    staysBehind.push(`- ${countPhrase(plan.survivals.messages, "chat message")} will stay in the group, just without their name on it`)
  }
  if (plan.survivals.gaugesSuggested > 0) {
    staysBehind.push(`- ${countPhrase(plan.survivals.gaugesSuggested, "idea")} they floated will stay too, without their name on it`)
  }
  if (staysBehind.length === 0) {
    staysBehind.push("- Nothing. They have no messages or ideas that would stick around.")
  }
  lines.push("What stays behind:")
  lines.push(...staysBehind)

  if (plan.warnings.length > 0) {
    lines.push("")
    lines.push("Worth knowing:")
    for (const w of plan.warnings) {
      const voterPhrase =
        w.otherVoterCount === 0
          ? "nobody else has voted on it yet"
          : `${countPhrase(w.otherVoterCount, "other person has", "other people have")} already voted on it`
      lines.push(
        `- They have an open time-change request in "${w.groupName}", and ${voterPhrase}. Deleting them won't undo those votes, but nobody will be able to finish deciding it once the person who asked is gone. You may want to let the group settle it first.`
      )
    }
  }

  const joinLines = formatJoinAnnouncementSummaryLines(plan.joinAnnouncementCandidates, plan.person.name)
  if (joinLines.length > 0) {
    lines.push("")
    lines.push(...joinLines)
  }

  return lines
}

export function formatPlanLines(plan: DeletionPlan): string[] {
  return plan.kind === "blocked" ? formatBlockedPlanLines(plan) : formatReadyPlanLines(plan)
}

// ── Confirmation ──────────────────────────────────────────────────────────────

/** Blank means "take the default"; y/yes and n/no are the only other valid answers. Anything else is invalid input, for the caller to re-ask about. */
export function parseYesNo(input: string, def: ConfirmationDefault): boolean | null {
  const t = input.trim().toLowerCase()
  if (t === "") return def === "yes"
  if (t === "y" || t === "yes") return true
  if (t === "n" || t === "no") return false
  return null
}

/** The final gate: the operator types the person's actual name, not "y". */
export function confirmsName(typed: string, expectedName: string): boolean {
  return typed.trim() === expectedName.trim()
}

/**
 * deletePerson's own safety stop (its doc comment: "a safety stop, not a
 * failure") fires when somebody joined a solo-founded group between the
 * plan being built and the operator confirming. This tells that apart from
 * every other kind of thrown error, so the script can explain it calmly
 * instead of printing a stack trace at a non-technical reader.
 */
export function isSafetyStopError(err: unknown): boolean {
  return err instanceof Error && /joined since the plan was built/i.test(err.message)
}

// ── Receipt and the Supabase hand-off ────────────────────────────────────────

export function formatReceiptLines(receipt: DeletionReceipt): string[] {
  const lines: string[] = []
  lines.push(
    receipt.userDeleted
      ? `Done. ${receipt.person.name} has been deleted.`
      : `Something is wrong: ${receipt.person.name} does NOT show as deleted. Check the database by hand before assuming this worked.`
  )

  if (receipt.groupsDeleted.length > 0) {
    lines.push(`Groups deleted whole: ${receipt.groupsDeleted.map((g) => `"${g.groupName}"`).join(", ")}.`)
  }

  const removed: string[] = []
  if (receipt.removals.memberships > 0) removed.push(countPhrase(receipt.removals.memberships, "group membership"))
  if (receipt.removals.rsvps > 0) removed.push(countPhrase(receipt.removals.rsvps, "RSVP answer"))
  if (receipt.removals.gaugeVotes > 0) removed.push(countPhrase(receipt.removals.gaugeVotes, "idea vote"))
  if (receipt.removals.proposalVotes > 0) removed.push(countPhrase(receipt.removals.proposalVotes, "time-change vote"))
  if (receipt.removals.changeProposalsAsked > 0) removed.push(countPhrase(receipt.removals.changeProposalsAsked, "time-change request"))
  if (removed.length > 0) lines.push(`Also removed: ${removed.join(", ")}.`)

  lines.push(`"joined" messages removed: ${receipt.joinAnnouncementMessagesDeleted}.`)

  return lines
}

/**
 * Never acted on by this script: it has no Supabase key that can delete a
 * login (src/lib/people/deletion-plan.ts's own doc comment says the same).
 * This is the hand-off, printed after the database work is already done.
 */
export function formatSupabaseInstructionLines(supabaseAuthId: string | null, personName: string): string[] {
  if (!supabaseAuthId) {
    return [`No Supabase login was on file for ${personName}, so there is nothing left to remove there.`]
  }
  return [
    `One more step, outside this script: ${personName}'s login is still on file with Supabase.`,
    `Supabase auth id: ${supabaseAuthId}`,
    "Open the Supabase dashboard (Authentication > Users), find that id, and delete it there. This script has no permission to do that part.",
  ]
}

// ── The interactive shell ────────────────────────────────────────────────────
//
// Everything above this line is a pure function or a scoped database read,
// each one testable on its own. Everything below is I/O: reading argv,
// printing to stdout, and reading answers from the operator at a terminal.
// The task brief exempts exactly one thing from testing, the confirmation
// prompt's own I/O; the decisions those prompts feed (parseYesNo,
// confirmsName, defaultConfirmationFor) are tested above, on fixture input,
// which is what keeps this shell thin enough to trust by reading it.

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.error(parsed.error)
    process.exitCode = 1
    return
  }
  const { args } = parsed

  for (const line of formatDatabaseIdentityLines(process.env)) console.log(line)
  console.log("")

  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  const guard = evaluateDatabaseGuard(verdict, args.productionOverride)
  for (const line of guard.lines) console.log(line)
  if (!guard.proceed) {
    process.exitCode = 1
    return
  }
  console.log("")

  const outcome = await lookupPerson(args)
  if (outcome.kind === "not-found") {
    console.log(outcome.message)
    process.exitCode = 1
    return
  }
  if (outcome.kind === "ambiguous") {
    for (const line of formatCandidateLines(outcome.matches)) console.log(line)
    process.exitCode = 1
    return
  }

  const person = outcome.match
  console.log(`Found: ${person.name} (id: ${person.userId})`)
  console.log("")

  const plan = await buildDeletionPlan(person.userId)
  for (const line of formatPlanLines(plan)) console.log(line)

  if (plan.kind === "blocked") {
    process.exitCode = 0
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const confirmedJoinIds: string[] = []
    for (const candidate of plan.joinAnnouncementCandidates) {
      const def = defaultConfirmationFor(candidate.evidence)
      console.log("")
      console.log(formatJoinAnnouncementPromptLines(candidate).join("\n"))
      let decided: boolean | null = null
      while (decided === null) {
        const answer = await rl.question(`Delete this join line? [${def === "yes" ? "Y/n" : "y/N"}] `)
        decided = parseYesNo(answer, def)
        if (decided === null) console.log("Please answer y or n.")
      }
      if (decided) confirmedJoinIds.push(candidate.messageId)
    }

    console.log("")
    console.log("This cannot be undone.")
    const typed = await rl.question(`Type ${person.name}'s name exactly to confirm: `)
    if (!confirmsName(typed, person.name)) {
      console.log("That didn't match. Nothing was deleted.")
      process.exitCode = 1
      return
    }

    let receipt: DeletionReceipt
    try {
      receipt = await deletePerson(plan, confirmedJoinIds)
    } catch (err) {
      if (isSafetyStopError(err)) {
        console.log("")
        console.log(
          `Nothing was deleted. Somebody joined one of ${person.name}'s groups since this plan was built, so the script stopped rather than risk deleting a stranger's data along with it.`
        )
        console.log("Run this script again to get a fresh plan, then confirm again.")
        process.exitCode = 1
        return
      }
      throw err
    }

    console.log("")
    for (const line of formatReceiptLines(receipt)) console.log(line)
    console.log("")
    for (const line of formatSupabaseInstructionLines(plan.supabaseAuthId, plan.person.name)) console.log(line)
  } finally {
    rl.close()
  }
}

if (process.argv[1]?.endsWith("delete-person.ts")) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
