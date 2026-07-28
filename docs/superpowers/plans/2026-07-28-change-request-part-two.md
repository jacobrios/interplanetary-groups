# Change Request Part Two: Consensus and a Conversational Window, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A time change becomes a group proposal Orbit moves only on consensus, and detection reads the recent conversation instead of one message, so follow-ups, corrections, and ambiguous asks land right or get a question, never silence.

**Architecture:** Extends part one's machinery in place: `ChangeProposal` grows a `kind` (verify vs group) and a `ProposalVote` table shaped like `GaugeVote`; consensus math, the conversational window, and the rewritten decision ladder are pure modules; the promote path mirrors `gauges/promote.ts` around an extracted transactional move core. The extraction schema is untouched; only the prompt context grows.

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter, no auto-generate), Supabase (auth only), Vitest (node env, real dev-test DB for transaction tests), claude-haiku-4-5 via `callExtractionModel`.

**Authority:** The spec is `docs/superpowers/specs/2026-07-28-change-request-part-two-design.md`. Where this plan and the spec differ, the spec is the intent. The spec's numbered "decisions beyond the seed" list needs owner sign-off before execution; do not start Task 1 until that sign-off exists.

## Global Constraints

- **Never point at production.** Run `npm run db:which` before any migration, seed, or DB-touching test run; it must print the dev-test ref `pxbewardwvoyqqcvogel` and exit 0.
- **Prisma 7:** `prisma generate` is never auto-run; run it after every schema change. The CLI needs `DIRECT_URL` present or it fails at config load.
- **Claim-to-fact boundary:** nothing user-facing branches on raw model output; only normalized shapes (`normalizeIntent`) drive behavior.
- **Counts are derived, never stored.** Tallies, bars, and RSVP counts are computed from rows at read time.
- **Orbit is never a User row.** Orbit messages are `authorType: ORBIT, authorId: null`.
- **All times render in the group's timezone**, never viewer-local.
- **Orbit copy rules:** no em or en dashes in anything Orbit says; soft declines; three-letter weekday abbreviations; roughly 7th-8th grade reading level.
- **Chip responses never post a message.** One message per proposal, one announcement per move.
- **Feed is append-only.** No message edits, ever.
- **Tests:** TDD per task; DB-touching tests use `[TEST]`-prefixed names and clean up in `afterAll` (follow `src/lib/gauges/__tests__/promote.test.ts` patterns). Full suite green plus clean `npx tsc --noEmit` before the PR.
- **Stay in lane:** no refactors outside the files this plan names.

**Baseline:** branch from a current `main` (`git checkout main && git pull` first). Suite baseline at branch time is 34 files / ~450 tests green.

```bash
git checkout main && git pull && git checkout -b feat/change-request-consensus
```

---

### Task 1: Schema, migration, and generate

**Files:**
- Modify: `prisma/schema.prisma` (ChangeProposal block ~lines 270-312, Message back-relations ~line 182)
- Create (via CLI, never by hand): `prisma/migrations/<timestamp>_change_request_consensus/`

**Interfaces:**
- Produces: `ProposalKind { VERIFY, GROUP }`, `ChangeProposal.kind` (default `VERIFY`), `ChangeProposal.votes ProposalVote[]`, `ProposalVote` with `ProposalVoteAnswer { YES, KEEP }` and `@@unique([proposalId, userId])`, `ProposalAnswer` gains `SUPERSEDED`, and the idempotency key becomes `@@unique([sourceMessageId, kind])`.

- [ ] **Step 1: Confirm the database target**

Run: `npm run db:which` and expect the dev-test ref and exit 0. Stop if not.

- [ ] **Step 2: Edit the schema**

In `ChangeProposal`, change `sourceMessageId  String          @unique` to `sourceMessageId  String`, add below `createdAt`:

```prisma
  kind             ProposalKind    @default(VERIFY)

  votes ProposalVote[]
```

and add to the model's bottom block:

```prisma
  @@unique([sourceMessageId, kind])
```

The unique move changes the Message-side relation from one-to-one to one-to-many. In `Message`, change `proposalAsSource ChangeProposal? @relation("ProposalSource")` to:

```prisma
  proposalsAsSource ChangeProposal[] @relation("ProposalSource")
```

(`proposalAsOrbit` stays one-to-one; every proposal has its own Orbit message.)

Extend the answer enum and add the new kinds and votes after the `ProposalAnswer` enum:

```prisma
enum ProposalAnswer {
  CONFIRMED
  DECLINED
  SUPERSEDED
}

/// VERIFY is part one's asker-only clarifying question. GROUP is part two's
/// whole-group proposal with votes and the consensus bar.
enum ProposalKind {
  VERIFY
  GROUP
}

/**
 * One person's answer on one group time proposal, the GaugeVote shape: a vote
 * belongs to a specific proposal, never to the idea of changing the time, and
 * unique (proposalId, userId) means changing your mind updates the row.
 * YES backs the new time. KEEP backs the current one (and counts on the
 * incumbent side of the bar; see lib/proposals/consensus.ts).
 */
model ProposalVote {
  id         String             @id @default(cuid())
  proposalId String
  userId     String
  answer     ProposalVoteAnswer
  createdAt  DateTime           @default(now())
  updatedAt  DateTime           @updatedAt

  proposal ChangeProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([proposalId, userId])
  @@index([proposalId])
  @@index([userId])
}

enum ProposalVoteAnswer {
  YES
  KEEP
}
```

Add the back-relation `proposalVotes ProposalVote[]` to the `User` model, next to its existing `gaugeVotes`-style relations.

- [ ] **Step 3: Migrate and generate**

```bash
npx prisma migrate dev --name change_request_consensus && npx prisma generate
```

Expected: one new migration, applied to dev-test, client regenerated. The edit-protection hook blocks hand-edits to migrations; the CLI writing them is the sanctioned path.

- [ ] **Step 4: Full suite still green**

Run: `npm test`. Expected: baseline count, all green (schema is additive; `kind` defaults existing rows to `VERIFY`).

- [ ] **Step 5: Commit**

```bash
git add prisma && git commit -m "Consensus schema: proposal kinds, votes, superseded"
```

---

### Task 2: Consensus math (pure)

**Files:**
- Create: `src/lib/proposals/consensus.ts`
- Test: `src/lib/proposals/__tests__/consensus.test.ts`

**Interfaces:**
- Produces:
  - `CONSENSUS_THRESHOLD = SPARK_THRESHOLD` (re-export; the seed's "one number the product already uses")
  - `consensusFloor(memberCount: number): number`
  - `incumbentCount(i: ConsensusInput): number`
  - `hasConsensus(i: ConsensusInput): boolean`
  - `oneMoreClearsIt(i: ConsensusInput): boolean`
  - `interface ConsensusInput { yesVoterIds: string[]; keepVoterIds: string[]; currentInUserIds: string[]; memberCount: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/proposals/__tests__/consensus.test.ts
import { describe, it, expect } from "vitest"
import {
  consensusFloor,
  incumbentCount,
  hasConsensus,
  oneMoreClearsIt,
} from "../consensus"

const input = (
  yes: string[],
  keep: string[],
  currentIn: string[],
  memberCount: number
) => ({ yesVoterIds: yes, keepVoterIds: keep, currentInUserIds: currentIn, memberCount })

describe("consensusFloor", () => {
  it("is three for groups of three or more", () => {
    expect(consensusFloor(3)).toBe(3)
    expect(consensusFloor(8)).toBe(3)
  })
  it("is the whole group below three", () => {
    expect(consensusFloor(2)).toBe(2)
    expect(consensusFloor(1)).toBe(1)
  })
  it("never drops below one", () => {
    expect(consensusFloor(0)).toBe(1)
  })
})

describe("incumbentCount: yeses switch sides", () => {
  it("counts current INs who have not said yes", () => {
    expect(incumbentCount(input(["a"], [], ["a", "b", "c"], 5))).toBe(2)
  })
  it("counts keep voters on the incumbent side", () => {
    expect(incumbentCount(input([], ["d"], ["a"], 5))).toBe(2)
  })
  it("never double-counts a keep voter who is also IN", () => {
    expect(incumbentCount(input([], ["a"], ["a"], 5))).toBe(1)
  })
  it("a yes beats a stale IN, whole side can empty", () => {
    expect(incumbentCount(input(["a", "b", "c"], [], ["a", "b", "c"], 3))).toBe(0)
  })
})

describe("hasConsensus", () => {
  it("the seed's deadlock: three-person group, all in, all yes, moves", () => {
    expect(hasConsensus(input(["a", "b", "c"], [], ["a", "b", "c"], 3))).toBe(true)
  })
  it("five-person group, four in, three yes (one a switcher plus asker), moves", () => {
    // asker a (was IN) + b (was IN) + e (no RSVP) = 3 yes; incumbent c,d remain
    expect(hasConsensus(input(["a", "b", "e"], [], ["a", "b", "c", "d"], 5))).toBe(true)
  })
  it("one against four never clears the floor", () => {
    expect(hasConsensus(input(["a"], [], ["a", "b", "c", "d"], 5))).toBe(false)
  })
  it("duo: both yeses move it, one does not", () => {
    expect(hasConsensus(input(["a"], [], ["a", "b"], 2))).toBe(false)
    expect(hasConsensus(input(["a", "b"], [], ["a", "b"], 2))).toBe(true)
  })
  it("solo group moves on the asker's message alone (part one preserved)", () => {
    expect(hasConsensus(input(["a"], [], ["a"], 1))).toBe(true)
    expect(hasConsensus(input(["a"], [], [], 1))).toBe(true)
  })
  it("an undefended time still takes the floor", () => {
    expect(hasConsensus(input(["a", "b"], [], [], 5))).toBe(false)
    expect(hasConsensus(input(["a", "b", "c"], [], [], 5))).toBe(true)
  })
  it("keep taps can hold the line: 3 yes vs 3 keeps does not move", () => {
    expect(hasConsensus(input(["a", "b", "c"], ["d", "e", "f"], [], 8))).toBe(false)
  })
})

describe("oneMoreClearsIt", () => {
  it("fires when any additional yes would clear both conditions", () => {
    expect(oneMoreClearsIt(input(["a", "b"], [], [], 5))).toBe(true)
  })
  it("does not fire when only an incumbent's switch could clear it", () => {
    // 3 yes already; incumbent 3: a non-incumbent 4th yes gives 4 > 3, fires.
    expect(oneMoreClearsIt(input(["a", "b", "c"], [], ["d", "e", "f"], 8))).toBe(true)
    // 2 yes, incumbent 3: a 3rd yes gives 3 > 3 false unless the yes is d/e/f.
    expect(oneMoreClearsIt(input(["a", "b"], [], ["d", "e", "f"], 8))).toBe(false)
  })
  it("stays quiet once the bar is met (announcement's job, not countdown's)", () => {
    expect(oneMoreClearsIt(input(["a", "b", "c"], [], [], 5))).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- consensus`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/proposals/consensus.ts
//
// The consensus bar for moving a plan's time, pure and derived from rows every
// time (the RSVP derived-counts rule; nothing here is ever stored).
//
// The bar is two conditions checked together:
//   floor:      at least three yeses, or the whole group when it is smaller.
//   comparison: more yeses than the incumbent side has people.
//
// The incumbent side is everyone in on the current time plus everyone who
// tapped keep, minus everyone who said yes to the new time: a yes from someone
// who was in is that person switching sides, which is what makes the bar
// reachable in every group (the spec's small-group resolution). Someone with
// no RSVP and no tap counts for neither side: silence is pending, not a vote.

import { SPARK_THRESHOLD } from "@/lib/orbit/spark-copy"

/** The seed's "one number the product already uses": the spark threshold. */
export const CONSENSUS_THRESHOLD = SPARK_THRESHOLD

export interface ConsensusInput {
  /** Distinct user ids with a live YES vote (member-filtered by the caller). */
  yesVoterIds: string[]
  /** Distinct user ids with a live KEEP vote (member-filtered by the caller). */
  keepVoterIds: string[]
  /** Distinct user ids with an IN RSVP on the event's current time. */
  currentInUserIds: string[]
  memberCount: number
}

export function consensusFloor(memberCount: number): number {
  return Math.max(1, Math.min(CONSENSUS_THRESHOLD, memberCount))
}

export function incumbentCount({
  yesVoterIds,
  keepVoterIds,
  currentInUserIds,
}: ConsensusInput): number {
  const yes = new Set(yesVoterIds)
  const incumbent = new Set([...currentInUserIds, ...keepVoterIds])
  return [...incumbent].filter((id) => !yes.has(id)).length
}

export function hasConsensus(i: ConsensusInput): boolean {
  const yes = new Set(i.yesVoterIds).size
  return yes >= consensusFloor(i.memberCount) && yes > incumbentCount(i)
}

/**
 * True when one more yes, from anyone at all, is guaranteed to clear the bar:
 * the countdown clause must never promise what an unlucky voter cannot
 * deliver. A yes from an incumbent clears more easily (it shrinks their side),
 * so checking the non-incumbent case covers everyone.
 */
export function oneMoreClearsIt(i: ConsensusInput): boolean {
  if (hasConsensus(i)) return false
  const yes = new Set(i.yesVoterIds).size
  return yes + 1 >= consensusFloor(i.memberCount) && yes + 1 > incumbentCount(i)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- consensus`. Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposals/consensus.ts src/lib/proposals/__tests__/consensus.test.ts
git commit -m "Consensus math: floor, side-switching, countdown guard"
```

---

### Task 3: The conversational window (pure composer)

**Files:**
- Create: `src/lib/orbit/window.ts`
- Test: `src/lib/orbit/__tests__/window.test.ts`

**Interfaces:**
- Consumes: `formatTime`, `formatWeekdayShort`, `formatMonthDay` (import them from wherever `src/lib/orbit/spark-copy.ts` imports them; do not re-implement).
- Produces:
  - `WINDOW_MESSAGES = 20` (the revisit knob, one place)
  - `interface WindowMessage { authorName: string | null; isOrbit: boolean; body: string; createdAt: Date }`
  - `buildConversationWindow(messages: WindowMessage[], timeZone: string, now: Date): string` (messages oldest first; the last entry is the trigger)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/orbit/__tests__/window.test.ts
import { describe, it, expect } from "vitest"
import { buildConversationWindow, WINDOW_MESSAGES } from "../window"

const TZ = "America/Chicago"
// 2026-07-28T23:12:00Z is Tue Jul 28, 6:12pm in Chicago (CDT, UTC-5).
const now = new Date("2026-07-28T23:12:00Z")

const msg = (body: string, iso: string, name: string | null = "Sam") => ({
  authorName: name,
  isOrbit: name === null,
  body,
  createdAt: new Date(iso),
})

describe("buildConversationWindow", () => {
  it("renders the now-anchor, oldest-first lines, and marks the trigger", () => {
    const out = buildConversationWindow(
      [
        msg("can we move beers to 9?", "2026-07-28T23:10:00Z"),
        msg("Done. Beers is moving to 9pm.", "2026-07-28T23:11:00Z", null),
        msg("sorry i meant beers, not climbing", "2026-07-28T23:12:00Z"),
      ],
      TZ,
      now
    )
    expect(out).toContain("Right now it is Tue Jul 28, 6:12pm (group time).")
    expect(out).toContain("[Tue Jul 28, 6:10pm] Sam: can we move beers to 9?")
    expect(out).toContain("[Tue Jul 28, 6:11pm] Orbit: Done. Beers is moving to 9pm.")
    expect(out).toContain(">>> [Tue Jul 28, 6:12pm] Sam: sorry i meant beers, not climbing")
    // Only the trigger is marked.
    expect(out.match(/>>>/g)).toHaveLength(1)
    // Oldest first: the 6:10 line comes before the 6:11 line.
    expect(out.indexOf("6:10pm")).toBeLessThan(out.indexOf("6:11pm"))
  })

  it("timestamps carry the date, so a twelve-hour-old reply reads as such", () => {
    const out = buildConversationWindow(
      [
        msg("who's in for beers thursday?", "2026-07-28T03:00:00Z"),
        msg("me, and let's do 9", "2026-07-28T23:12:00Z"),
      ],
      TZ,
      now
    )
    expect(out).toContain("[Mon Jul 27, 10:00pm] Sam: who's in for beers thursday?")
  })

  it("a single message renders as the marked trigger alone", () => {
    const out = buildConversationWindow([msg("hey", "2026-07-28T23:12:00Z")], TZ, now)
    expect(out).toContain(">>> [Tue Jul 28, 6:12pm] Sam: hey")
  })

  it("the knob is twenty", () => {
    expect(WINDOW_MESSAGES).toBe(20)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- window`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/orbit/window.ts
//
// The conversational window: the recent feed rendered for the intent model.
// Pure (messages in, prompt block out) so the exact rendering is pinned by
// tests. Twenty messages counting the trigger; the constant is a revisit knob,
// deliberately in one place. No age cutoff: a reply can arrive twelve hours
// after the message it answers, which is why every line carries a timestamp
// and the block opens with a now-anchor the model can judge staleness against.

// Import formatTime, formatWeekdayShort, formatMonthDay from the exact module
// spark-copy.ts imports them from (open it and copy the path; see Step 4 note).

export const WINDOW_MESSAGES = 20

export interface WindowMessage {
  /** Member name; null for Orbit. */
  authorName: string | null
  isOrbit: boolean
  body: string
  createdAt: Date
}

function stamp(d: Date, timeZone: string): string {
  return `${formatWeekdayShort(d, timeZone)} ${formatMonthDay(d, timeZone)}, ${formatTime(d, timeZone)}`
}

/**
 * Messages must arrive oldest first with the trigger message last; the trigger
 * line is marked with ">>>" and the system prompt explains the mark.
 */
export function buildConversationWindow(
  messages: WindowMessage[],
  timeZone: string,
  now: Date
): string {
  const lines = messages.map((m, i) => {
    const author = m.isOrbit ? "Orbit" : (m.authorName ?? "A former member")
    const prefix = i === messages.length - 1 ? ">>> " : ""
    return `${prefix}[${stamp(m.createdAt, timeZone)}] ${author}: ${m.body}`
  })
  return [
    `Right now it is ${stamp(now, timeZone)} (group time).`,
    "",
    "The conversation, oldest first. The last message, marked >>>, is the one to classify:",
    ...lines,
  ].join("\n")
}
```

**Import note (not a placeholder, a lookup):** the three formatters exist and are imported by `src/lib/orbit/spark-copy.ts`; open that file, copy its exact import path for `formatTime` / `formatWeekdayShort` / `formatMonthDay`, and use the same one here. Do not guess a path from memory.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- window`. Expected: PASS. If a timestamp assertion fails, check the formatter output format against the test literal and fix the test literal only if the formatter's real output differs in punctuation (the formatters are the source of truth for their own rendering; the structural assertions, marker count and ordering, must hold as written).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/window.ts src/lib/orbit/__tests__/window.test.ts
git commit -m "Conversational window composer: 20 messages, timestamps, now-anchor"
```

---

### Task 4: New copy composers

**Files:**
- Modify: `src/lib/orbit/change-copy.ts`
- Test: `src/lib/orbit/__tests__/change-copy.test.ts` (extend)

**Interfaces:**
- Consumes: module-private `whenPhrase(startsAt, timeZone, now)`, `formatTime`, `formatWeekdayShort`, `formatTimeLocalLabel` (all already in the file).
- Produces (all exported):
  - `buildGroupProposalQuestion(askerName: string, label: string, proposedStartsAt: Date, priorStartsAt: Date, timeZone: string, now: Date, disclosure: string | null): string`
  - `buildConsensusAnnouncement(label: string, newStartsAt: Date, oldStartsAt: Date, timeZone: string, now: Date): string`
  - `proposalChipLabels(proposedStartsAt: Date, priorStartsAt: Date, timeZone: string): { yes: string; keep: string }`
  - `buildProposalTallyLine(yesNames: string[], keepCount: number, oneMore: boolean): string`
  - `buildWhichPlanQuestion(labels: string[]): string`
  - `buildWhichTimeQuestion(label: string): string`
  - `buildAlreadyAtReply(label: string, startsAt: Date, timeZone: string, now: Date): string`
  - `NO_PLANS_REPLY: string`
  - `buildCantDoReply` gains a nullable event start: `buildCantDoReply(fields: ChangeField[], eventStartsAt: Date | null, timeZone: string): string`

- [ ] **Step 1: Write the failing tests** (append to the existing `change-copy.test.ts`; times below assume `TZ = "America/Chicago"` and an event Tue Jul 28 8:00am local, i.e. `2026-07-28T13:00:00Z`, moving to 9:00am, `2026-07-28T14:00:00Z`, with `now` a Sunday two days before, `2026-07-26T15:00:00Z`)

```ts
describe("group proposal copy", () => {
  const TZ = "America/Chicago"
  const now = new Date("2026-07-26T15:00:00Z")
  const oldStart = new Date("2026-07-28T13:00:00Z") // Tue 8:00am
  const newStart = new Date("2026-07-28T14:00:00Z") // Tue 9:00am

  it("the question names the asker, both times, and asks the group", () => {
    const q = buildGroupProposalQuestion("Sam", "climbing", newStart, oldStart, TZ, now, null)
    expect(q).toBe("Sam wants climbing this Tue at 9am instead of 8am. Works for you?")
  })

  it("the disclosure rides the question once", () => {
    const q = buildGroupProposalQuestion("Sam", "climbing", newStart, oldStart, TZ, now,
      "You said 9, and since this plan was in the morning I took that as 9am.")
    expect(q).toContain("Works for you? You said 9,")
  })

  it("the announcement never assumes a count and owns the seeding out loud", () => {
    const a = buildConsensusAnnouncement("climbing", newStart, oldStart, TZ, now)
    expect(a).toBe(
      "That settles it. Climbing this Tue is moving to 9am, it was 8am. I marked everyone who said yes as in; the rest of you, answer again up top. Want it back at 8am? Say the word."
    )
    expect(a).not.toMatch(/three|Three|3/)
  })

  it("chips are soft on both sides", () => {
    expect(proposalChipLabels(newStart, oldStart, TZ)).toEqual({
      yes: "9am works",
      keep: "Keep 8am",
    })
  })

  it("tally: names for yeses, count for keeps, countdown only when told", () => {
    expect(buildProposalTallyLine([], 0, false)).toBe("")
    expect(buildProposalTallyLine(["Sam"], 0, false)).toBe("Sam says yes")
    expect(buildProposalTallyLine(["Sam", "Priya"], 1, false)).toBe(
      "Sam & Priya say yes · 1 would keep it"
    )
    expect(buildProposalTallyLine(["Sam", "Priya"], 0, true)).toBe(
      "Sam & Priya say yes · one more makes it happen"
    )
  })

  it("verify questions are concrete about what they know", () => {
    expect(buildWhichPlanQuestion(["climbing", "beers"])).toBe(
      "I can move a time. Which plan do you mean, climbing or beers?"
    )
    expect(buildWhichTimeQuestion("beers")).toBe(
      "Happy to move beers. What time were you thinking?"
    )
  })

  it("already-at and no-plans replies", () => {
    expect(buildAlreadyAtReply("climbing", oldStart, TZ, now)).toBe(
      "Good news, climbing this Tue is already at 8am."
    )
    expect(NO_PLANS_REPLY).toBe("I don't see any plans on the calendar right now.")
  })

  it("the targetless decline drops the weekday clause", () => {
    expect(buildCantDoReply(["day"], null, TZ)).toBe(
      "I can't move it to another day yet. I can change the time if that helps."
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- change-copy`. Expected: FAIL on every new composer.

- [ ] **Step 3: Implement** (in `change-copy.ts`; `cap` below is a tiny local helper `label.charAt(0).toUpperCase() + label.slice(1)`, matching how `buildChangeAnnouncement` capitalizes its lead; reuse the existing one if the file already has it)

```ts
export function buildGroupProposalQuestion(
  askerName: string,
  label: string,
  proposedStartsAt: Date,
  priorStartsAt: Date,
  timeZone: string,
  now: Date,
  disclosure: string | null
): string {
  const q = `${askerName} wants ${label} ${whenPhrase(proposedStartsAt, timeZone, now)} at ${formatTime(proposedStartsAt, timeZone)} instead of ${formatTime(priorStartsAt, timeZone)}. Works for you?`
  return disclosure ? `${q} ${disclosure}` : q
}

export function buildConsensusAnnouncement(
  label: string,
  newStartsAt: Date,
  oldStartsAt: Date,
  timeZone: string,
  now: Date
): string {
  const oldTime = formatTime(oldStartsAt, timeZone)
  return `That settles it. ${cap(label)} ${whenPhrase(newStartsAt, timeZone, now)} is moving to ${formatTime(newStartsAt, timeZone)}, it was ${oldTime}. I marked everyone who said yes as in; the rest of you, answer again up top. Want it back at ${oldTime}? Say the word.`
}

export function proposalChipLabels(
  proposedStartsAt: Date,
  priorStartsAt: Date,
  timeZone: string
): { yes: string; keep: string } {
  return {
    yes: `${formatTime(proposedStartsAt, timeZone)} works`,
    keep: `Keep ${formatTime(priorStartsAt, timeZone)}`,
  }
}

/** Mirrors buildTallyLine's shape: parts joined with " · ", empty until someone votes. */
export function buildProposalTallyLine(
  yesNames: string[],
  keepCount: number,
  oneMore: boolean
): string {
  if (yesNames.length === 0 && keepCount === 0) return ""
  const parts: string[] = []
  if (yesNames.length === 1) parts.push(`${yesNames[0]} says yes`)
  else if (yesNames.length > 1)
    parts.push(`${yesNames.slice(0, -1).join(", ")} & ${yesNames.at(-1)} say yes`)
  if (keepCount > 0) parts.push(`${keepCount} would keep it`)
  if (oneMore) parts.push("one more makes it happen")
  return parts.join(" · ")
}

export function buildWhichPlanQuestion(labels: string[]): string {
  return `I can move a time. Which plan do you mean, ${labels.join(" or ")}?`
}

export function buildWhichTimeQuestion(label: string): string {
  return `Happy to move ${label}. What time were you thinking?`
}

export function buildAlreadyAtReply(
  label: string,
  startsAt: Date,
  timeZone: string,
  now: Date
): string {
  return `Good news, ${label} ${whenPhrase(startsAt, timeZone, now)} is already at ${formatTime(startsAt, timeZone)}.`
}

export const NO_PLANS_REPLY = "I don't see any plans on the calendar right now."
```

And in `buildCantDoReply`, change the signature's second parameter to `eventStartsAt: Date | null` and the day branch to:

```ts
  if (fields.includes("day")) {
    return eventStartsAt
      ? `I can't move it to another day yet. I can change the time on ${formatWeekdayShort(eventStartsAt, timeZone)} if that helps.`
      : `I can't move it to another day yet. I can change the time if that helps.`
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- change-copy`. Expected: PASS, new and old tests both (the nullable param is widening only).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/change-copy.ts src/lib/orbit/__tests__/change-copy.test.ts
git commit -m "Consensus and verify-question copy composers"
```

---

### Task 5: The decision ladder, rewritten

**Files:**
- Modify: `src/lib/orbit/change-plan.ts`
- Test: `src/lib/orbit/__tests__/change-plan.test.ts` (extend and revise)

**Interfaces:**
- Consumes: Task 2's `consensusFloor`; Task 4's composers.
- Produces (breaking changes; Tasks 10 and 11 consume these):

```ts
export type ChangePlan =
  | { action: "quiet" }
  | { action: "reply"; body: string }
  | { action: "move"; newStartsAt: Date; announcement: string }
  | { action: "ask"; proposedStartsAt: Date; question: string }
  | { action: "propose"; proposedStartsAt: Date; question: string }

export function planChange(
  change: NormalizedChange,
  target: ChangeTarget | null,
  candidates: ChangeTarget[],
  askerName: string,
  memberCount: number,
  timeZone: string,
  now: Date
): ChangePlan
```

- [ ] **Step 1: Revise and extend the tests.** Update every existing `planChange` call site in the test file to the new signature (`candidates` = the targets array the test already builds, `askerName: "Sam"`, `memberCount: 5` unless the case says otherwise). Then add the new-behavior cases; the three owner-QA failures are the last three tests and must stay verbatim as claim-level fixtures:

```ts
describe("the rewritten ladder: never silent on a direct ask", () => {
  // Shared fixtures: two plans, the shape of the owner's two-plan sandbox.
  const climbing = { id: "e1", label: "climbing", startsAt: new Date("2026-07-28T13:00:00Z") }
  const beers = { id: "e2", label: "beers", startsAt: new Date("2026-07-30T01:00:00Z") }
  const both = [climbing, beers]
  const TZ = "America/Chicago"
  const now = new Date("2026-07-26T15:00:00Z")
  const change = (over: Partial<NormalizedChange>): NormalizedChange => ({
    targetEventIndex: 0,
    requestedTime: "09:00",
    requestedTimeAmbiguous: false,
    requestedFields: ["time"],
    intentClear: true,
    ...over,
  })

  it("a clear complete request proposes to the group, not a move", () => {
    const plan = planChange(change({}), climbing, both, "Sam", 5, TZ, now)
    expect(plan.action).toBe("propose")
  })

  it("a solo group still moves immediately (part one as the degenerate case)", () => {
    const plan = planChange(change({}), climbing, both, "Sam", 1, TZ, now)
    expect(plan.action).toBe("move")
  })

  it("a probable complete request still verifies with the asker first", () => {
    const plan = planChange(change({ intentClear: false }), climbing, both, "Sam", 5, TZ, now)
    expect(plan.action).toBe("ask")
  })

  it("a time request with a target but no time asks which time", () => {
    const plan = planChange(change({ requestedTime: null }), climbing, both, "Sam", 5, TZ, now)
    expect(plan).toEqual({ action: "reply", body: "Happy to move climbing. What time were you thinking?" })
  })

  it("same-time request gets the honest one-liner, not silence", () => {
    const plan = planChange(change({ requestedTime: "08:00" }), climbing, both, "Sam", 5, TZ, now)
    expect(plan.action).toBe("reply")
    expect((plan as { body: string }).body).toContain("already at 8am")
  })

  it("a past time replies whether clear or probable", () => {
    const past = { ...climbing, startsAt: new Date("2026-07-20T13:00:00Z") }
    const plan = planChange(change({ intentClear: false }), past, [past], "Sam", 5, TZ, now)
    expect(plan).toEqual({ action: "reply", body: PAST_TIME_REPLY })
  })

  it("no plans on the calendar gets the honest no-plans reply", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, [], "Sam", 5, TZ, now)
    expect(plan).toEqual({ action: "reply", body: NO_PLANS_REPLY })
  })

  it("one plan and a null target resolves to that plan, not a question", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, [climbing], "Sam", 5, TZ, now)
    expect(plan.action).toBe("propose")
  })

  // The three owner-QA failures, replayed as fixtures.
  it("QA 1, wrong-target bare follow-up: an unresolvable target asks which plan", () => {
    const plan = planChange(change({ targetEventIndex: null }), null, both, "Sam", 5, TZ, now)
    expect(plan).toEqual({
      action: "reply",
      body: "I can move a time. Which plan do you mean, climbing or beers?",
    })
  })

  it("QA 2, the dead correction: a complete recovered reading proposes, never silence", () => {
    // The window lets the model fill target=beers and time=21:00 from context;
    // by the time the ladder sees it, it is an ordinary complete request.
    const plan = planChange(change({ targetEventIndex: 1, requestedTime: "21:00" }), beers, both, "Sam", 5, TZ, now)
    expect(plan.action).toBe("propose")
  })

  it("QA 3, ambiguous 'it': a venue ask declines with or without a target", () => {
    const noTarget = planChange(
      change({ targetEventIndex: null, requestedFields: ["venue"], requestedTime: null, intentClear: false }),
      null, both, "Sam", 5, TZ, now
    )
    expect(noTarget.action).toBe("reply")
    expect((noTarget as { body: string }).body).toContain("can't change the spot yet")
  })
})
```

Delete or invert the part-one tests these behaviors replace (the old `no target -> quiet`, `no time -> quiet`, `same time -> quiet`, `probable non-time -> quiet`, and `clear -> move` for multi-member groups). Every deleted assertion must correspond to a rung the spec explicitly rewrote; if one does not, stop and check the spec.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- change-plan`. Expected: FAIL on the new cases (and compile errors on the signature until Step 3).

- [ ] **Step 3: Rewrite `planChange`**

```ts
export function planChange(
  change: NormalizedChange,
  target: ChangeTarget | null,
  candidates: ChangeTarget[],
  askerName: string,
  memberCount: number,
  timeZone: string,
  now: Date
): ChangePlan {
  // Rung 1: anything beyond the time declines, target or no target, clear or
  // probable. The decline never needed the target (the owner-QA "it" failure),
  // and the model's conservative tiebreak is the false-positive guard.
  if (change.requestedFields.some((f) => f !== "time")) {
    return {
      action: "reply",
      body: buildCantDoReply(change.requestedFields, target?.startsAt ?? null, timeZone),
    }
  }

  // A lone plan is its own answer: the model declining to number the only
  // candidate is not a real ambiguity.
  const resolved = target ?? (candidates.length === 1 ? candidates[0] : null)

  // Rung 2: a time request with no resolvable target gets a which-plan
  // question, or the honest no-plans reply when there is nothing to move.
  if (!resolved) {
    if (candidates.length === 0) return { action: "reply", body: NO_PLANS_REPLY }
    return { action: "reply", body: buildWhichPlanQuestion(candidates.map((c) => c.label)) }
  }

  // Rung 3: a target but no concrete time asks which time. Part one stayed
  // quiet here as concrete-first; the amended guardrail overrides that for a
  // direct ask, and the question is still concrete about everything it knows.
  if (change.requestedTime === null) {
    return { action: "reply", body: buildWhichTimeQuestion(resolved.label) }
  }

  const { timeLocal, disclosure } = resolveChangeTime({
    requestedTime: change.requestedTime,
    requestedTimeAmbiguous: change.requestedTimeAmbiguous,
    eventStartsAt: resolved.startsAt,
    timeZone,
  })
  const newStartsAt = changeStartInstant(resolved.startsAt, timeLocal, timeZone)

  // Rung 4: honest replies for the past and for the time it already has.
  if (newStartsAt.getTime() <= now.getTime()) {
    return { action: "reply", body: PAST_TIME_REPLY }
  }
  if (newStartsAt.getTime() === resolved.startsAt.getTime()) {
    return { action: "reply", body: buildAlreadyAtReply(resolved.label, resolved.startsAt, timeZone, now) }
  }

  // Rung 5: probable but complete verifies with the asker, part one unchanged.
  if (!change.intentClear) {
    return {
      action: "ask",
      proposedStartsAt: newStartsAt,
      question: buildChangeQuestion(resolved.label, newStartsAt, timeZone, now),
    }
  }

  // Rung 6: clear and complete. A group of one is part one's immediate move
  // surviving as the degenerate case; everyone else gets the group proposal.
  if (consensusFloor(memberCount) === 1) {
    return {
      action: "move",
      newStartsAt,
      announcement: buildChangeAnnouncement(
        resolved.label, newStartsAt, resolved.startsAt, timeZone, now, disclosure
      ),
    }
  }
  return {
    action: "propose",
    proposedStartsAt: newStartsAt,
    question: buildGroupProposalQuestion(
      askerName, resolved.label, newStartsAt, resolved.startsAt, timeZone, now, disclosure
    ),
  }
}
```

Update the file's imports accordingly (`consensusFloor` from `@/lib/proposals/consensus`; the new composers from `./change-copy`).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- change-plan`. Expected: PASS. Note `detect-intent.ts` now fails to compile; that is Task 11's job, and `npm test` may show that failure until then. Run the targeted file, not the suite, at this step.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbit/change-plan.ts src/lib/orbit/__tests__/change-plan.test.ts
git commit -m "Rewritten ladder: silence only for non-requests"
```

### Task 6: Group proposal creation, supersede, and the live read

**Files:**
- Modify: `src/lib/proposals/create.ts`, `src/lib/proposals/read.ts`
- Test: `src/lib/proposals/__tests__/proposals.test.ts` (extend; this file already tests against the real dev-test DB with `[TEST]` fixtures and `afterAll` cleanup; follow its builders)

**Interfaces:**
- Produces:

```ts
// create.ts
export interface CreateGroupProposalInput {
  groupId: string
  eventId: string
  askerUserId: string
  /** The member message that asked; compound-unique with kind GROUP. */
  sourceMessageId: string
  proposedStartsAt: Date
  priorStartsAt: Date
  /** buildGroupProposalQuestion output; copy stays in change-copy.ts. */
  body: string
  /** Verify-confirm handoff: stamp this VERIFY proposal CONFIRMED in the same tx. */
  resolveVerifyProposalId?: string
}
export type CreateGroupProposalResult =
  | { status: "created"; proposal: ChangeProposal }
  | { status: "skipped"; reason: "already_asked" }
export async function createGroupProposal(input: CreateGroupProposalInput): Promise<CreateGroupProposalResult>

// read.ts: LiveProposal widens to
export type LiveProposal = ChangeProposal & {
  event: Event & { rsvps: Rsvp[] }
  votes: (ProposalVote & { user: User })[]
  asker: User
}
```

- [ ] **Step 1: Write the failing tests.** Extend `proposals.test.ts` with a `createGroupProposal` describe block. The load-bearing cases, each built from fresh `[TEST]` fixtures:

```ts
it("creates message, GROUP proposal, and the asker's seeded YES in one shape", async () => {
  const r = await createGroupProposal(baseInput())
  expect(r.status).toBe("created")
  const votes = await prisma.proposalVote.findMany({ where: { proposalId: r.proposal.id } })
  expect(votes).toHaveLength(1)
  expect(votes[0]).toMatchObject({ userId: asker.id, answer: "YES" })
  const orbitMsg = await prisma.message.findUnique({ where: { id: r.proposal.orbitMessageId } })
  expect(orbitMsg?.authorType).toBe("ORBIT")
})

it("double-fire on the same source message skips (compound key, kind GROUP)", async () => {
  await createGroupProposal(baseInput())
  const second = await createGroupProposal(baseInput())
  expect(second).toEqual({ status: "skipped", reason: "already_asked" })
})

it("a VERIFY and a GROUP row can share a source message (the handoff)", async () => {
  // priorVerify created with createChangeProposal on the same sourceMessageId
  const r = await createGroupProposal({ ...baseInput(), resolveVerifyProposalId: priorVerify.id })
  expect(r.status).toBe("created")
  const verify = await prisma.changeProposal.findUnique({ where: { id: priorVerify.id } })
  expect(verify?.answer).toBe("CONFIRMED")
})

it("newest wins per event: a live GROUP proposal on the event is stamped SUPERSEDED", async () => {
  const first = await createGroupProposal(baseInput())
  const second = await createGroupProposal({ ...baseInput({ otherSourceMessage: true, otherAsker: true }) })
  const old = await prisma.changeProposal.findUnique({ where: { id: (first as any).proposal.id } })
  expect(old?.answer).toBe("SUPERSEDED")
  expect(second.status).toBe("created")
})

it("newest wins per asker: the asker's live proposal on ANOTHER event is superseded too", async () => {
  const onClimbing = await createGroupProposal(baseInput())
  const onBeers = await createGroupProposal(baseInput({ otherEvent: true, otherSourceMessage: true }))
  const old = await prisma.changeProposal.findUnique({ where: { id: (onClimbing as any).proposal.id } })
  expect(old?.answer).toBe("SUPERSEDED")
  expect(onBeers.status).toBe("created")
})

it("someone else's live proposal on a DIFFERENT event is left alone", async () => { /* same builder, different asker + different event, expect answer null */ })
```

Also extend the existing `findLiveProposals` tests: a SUPERSEDED proposal is not live; the returned rows now carry `votes` (with `user`), `asker`, and `event.rsvps`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- proposals`. Expected: FAIL, `createGroupProposal` not exported.

- [ ] **Step 3: Implement.** In `create.ts`:

```ts
export async function createGroupProposal({
  groupId, eventId, askerUserId, sourceMessageId,
  proposedStartsAt, priorStartsAt, body, resolveVerifyProposalId,
}: CreateGroupProposalInput): Promise<CreateGroupProposalResult> {
  const now = new Date()
  try {
    const proposal = await prisma.$transaction(async (tx) => {
      // Newest wins, per event and per asker: a live GROUP proposal on this
      // event (the conversation moved past its number) and any live proposal
      // of this asker's (a correction retracts the mistake it corrects) are
      // both retired before the new one opens. The verify being confirmed, if
      // any, is excluded here because it gets CONFIRMED below, not SUPERSEDED.
      await tx.changeProposal.updateMany({
        where: {
          answer: null,
          id: { not: resolveVerifyProposalId ?? "" },
          OR: [{ kind: ProposalKind.GROUP, eventId }, { askerUserId }],
        },
        data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
      })

      const orbitMessage = await tx.message.create({
        data: { groupId, authorType: MessageAuthor.ORBIT, authorId: null, body },
      })
      const created = await tx.changeProposal.create({
        data: {
          groupId, eventId, askerUserId, sourceMessageId,
          orbitMessageId: orbitMessage.id,
          proposedStartsAt, priorStartsAt,
          kind: ProposalKind.GROUP,
        },
      })
      // The asker's message is their yes, seeded in the same transaction, the
      // gauge-initiator precedent.
      await tx.proposalVote.create({
        data: { proposalId: created.id, userId: askerUserId, answer: ProposalVoteAnswer.YES },
      })
      if (resolveVerifyProposalId) {
        await tx.changeProposal.update({
          where: { id: resolveVerifyProposalId },
          data: { answer: ProposalAnswer.CONFIRMED, answeredAt: now },
        })
      }
      return created
    })
    return { status: "created", proposal }
  } catch (err) {
    // The compound (sourceMessageId, kind) unique: a double-fired detection
    // collides here and the whole transaction, supersedes included, rolls back.
    if ((err as { code?: string }).code === "P2002") {
      return { status: "skipped", reason: "already_asked" }
    }
    throw err
  }
}
```

In `read.ts`, widen the include (filters unchanged; they already fit both kinds):

```ts
    include: {
      event: { include: { rsvps: true } },
      votes: { include: { user: true } },
      asker: true,
    },
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- proposals`. Expected: PASS, old and new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposals && git commit -m "Group proposals: seeded yes, newest-wins supersede, wider live read"
```

---

### Task 7: The move core and the consensus promote

**Files:**
- Modify: `src/lib/events/move.ts`
- Create: `src/lib/proposals/promote.ts`
- Test: `src/lib/events/__tests__/move.test.ts` (must stay green unchanged), `src/lib/proposals/__tests__/promote.test.ts` (new, real DB, modeled on `src/lib/gauges/__tests__/promote.test.ts`)

**Interfaces:**
- Consumes: Task 2's `hasConsensus`; Task 4's `buildConsensusAnnouncement`; Task 6's schema rows.
- Produces:

```ts
// move.ts
export interface MoveCoreInput {
  eventId: string
  expectedStartsAt: Date
  newStartsAt: Date
  /** Everyone seeded IN on the moved plan. Part one passes [requesterUserId]. */
  seedInUserIds: string[]
  announcementBody: string
  resolveProposalId?: string
}
export async function moveEventCoreInTx(
  tx: Prisma.TransactionClient,
  input: MoveCoreInput
): Promise<MoveEventResult>
// moveEventTime keeps its exact existing signature and behavior, now one line:
// prisma.$transaction((tx) => moveEventCoreInTx(tx, { ...args, seedInUserIds: [requesterUserId] }))

// promote.ts
export type ProposalPromoteResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_proposal" | "not_live" | "below_bar" | "stale" }
export async function promoteProposalMove(proposalId: string, now: Date): Promise<ProposalPromoteResult>
```

- [ ] **Step 1: Extract the core with the suite as the harness.** Move the body of `moveEventTime`'s transaction into `moveEventCoreInTx` verbatim, with one change: the single `tx.rsvp.create` for the requester becomes

```ts
    await tx.rsvp.deleteMany({ where: { eventId } })
    if (seedInUserIds.length > 0) {
      await tx.rsvp.createMany({
        data: seedInUserIds.map((userId) => ({ eventId, userId, status: RsvpStatus.IN })),
        skipDuplicates: true,
      })
    }
```

Everything else (pre-read guards, the conditional `updateMany` stale guard, `previousStartsAt`, the announcement write, the optional proposal stamp) moves unchanged. Run `npm test -- move`. Expected: PASS with zero edits to `move.test.ts`; if any move test needed changing, the extraction changed behavior, stop and fix.

- [ ] **Step 2: Write the failing promote tests.** Fixture builder mirrors `gauges/__tests__/promote.test.ts`: `[TEST]` users, a group with N memberships, an event with chosen IN RSVPs, a member source message, then `createGroupProposal` plus direct `prisma.proposalVote` writes to stage vote states. Core cases:

```ts
it("below the bar: no move, nothing written", async () => {
  // 5 members, 4 IN on current, only the asker's seeded YES
  const r = await promoteProposalMove(proposal.id, now)
  expect(r).toEqual({ status: "skipped", reason: "below_bar" })
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  expect(event?.startsAt.getTime()).toBe(oldStart.getTime())
})

it("the bar clears: moved, YES voters seeded IN, KEEP voters get no row", async () => {
  // 5 members, 4 IN; YES from asker + two members (one of them was IN), KEEP from one
  const r = await promoteProposalMove(proposal.id, now)
  expect(r).toEqual({ status: "moved" })
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  expect(event?.startsAt.getTime()).toBe(newStart.getTime())
  expect(event?.previousStartsAt?.getTime()).toBe(oldStart.getTime())
  const rsvps = await prisma.rsvp.findMany({ where: { eventId } })
  expect(new Set(rsvps.map((r) => r.userId))).toEqual(new Set(yesVoterIds))
  expect(rsvps.every((r) => r.status === "IN")).toBe(true)
  const stamped = await prisma.changeProposal.findUnique({ where: { id: proposal.id } })
  expect(stamped?.answer).toBe("CONFIRMED")
  const announcement = await prisma.message.findFirst({
    where: { groupId, authorType: "ORBIT" }, orderBy: { createdAt: "desc" },
  })
  expect(announcement?.body).toContain("That settles it.")
})

it("the seed's deadlock case moves: three members, all IN, all YES", async () => { /* expect moved */ })

it("a stale baseline skips instead of moving from a state nobody saw", async () => {
  // move the event by hand first, then promote
  const r = await promoteProposalMove(proposal.id, now)
  expect(r).toEqual({ status: "skipped", reason: "stale" })
})

it("non-member votes do not count toward the bar", async () => {
  // stage a YES from a user with no membership; bar must not clear
})
```

Run: `npm test -- src/lib/proposals/__tests__/promote`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `promote.ts`**

```ts
// src/lib/proposals/promote.ts
//
// The consensus promote, the gauges/promote.ts shape: cheap pre-checks outside
// the transaction, then everything re-read inside it, so a racing mind-change
// or RSVP can never move a plan the rows no longer support.

import { prisma } from "@/lib/prisma"
import { ProposalKind, ProposalAnswer, ProposalVoteAnswer, RsvpStatus } from "@prisma/client"
import { hasConsensus } from "./consensus"
import { moveEventCoreInTx } from "@/lib/events/move"
import { buildConsensusAnnouncement } from "@/lib/orbit/change-copy"

export type ProposalPromoteResult =
  | { status: "moved" }
  | { status: "skipped"; reason: "no_proposal" | "not_live" | "below_bar" | "stale" }

class BelowBarInTx extends Error {}
class StaleInTx extends Error {}

export async function promoteProposalMove(
  proposalId: string,
  now: Date
): Promise<ProposalPromoteResult> {
  const proposal = await prisma.changeProposal.findUnique({
    where: { id: proposalId },
    include: { event: true, group: true },
  })
  if (!proposal || proposal.kind !== ProposalKind.GROUP) {
    return { status: "skipped", reason: "no_proposal" }
  }
  if (
    proposal.answer !== null ||
    proposal.event.startsAt.getTime() <= now.getTime() ||
    proposal.proposedStartsAt.getTime() <= now.getTime() ||
    proposal.priorStartsAt.getTime() !== proposal.event.startsAt.getTime()
  ) {
    return { status: "skipped", reason: "not_live" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Everything the bar reads is re-read here: two people can tap in the
      // same second, RSVPs can land mid-vote, and the losing snapshot must
      // never decide a move (the gauge-promote precedent).
      const [votes, memberships, rsvps] = await Promise.all([
        tx.proposalVote.findMany({
          where: { proposalId },
          select: { userId: true, answer: true },
        }),
        tx.membership.findMany({
          where: { groupId: proposal.groupId },
          select: { userId: true },
        }),
        tx.rsvp.findMany({
          where: { eventId: proposal.eventId, status: RsvpStatus.IN },
          select: { userId: true },
        }),
      ])
      const memberIds = new Set(memberships.map((m) => m.userId))
      const memberVotes = votes.filter((v) => memberIds.has(v.userId))
      const yesVoterIds = memberVotes
        .filter((v) => v.answer === ProposalVoteAnswer.YES)
        .map((v) => v.userId)
      const input = {
        yesVoterIds,
        keepVoterIds: memberVotes
          .filter((v) => v.answer === ProposalVoteAnswer.KEEP)
          .map((v) => v.userId),
        currentInUserIds: rsvps.map((r) => r.userId).filter((id) => memberIds.has(id)),
        memberCount: memberIds.size,
      }
      if (!hasConsensus(input)) throw new BelowBarInTx()

      const label =
        proposal.event.activityLabel ?? proposal.event.title.toLowerCase()
      const moved = await moveEventCoreInTx(tx, {
        eventId: proposal.eventId,
        expectedStartsAt: proposal.priorStartsAt,
        newStartsAt: proposal.proposedStartsAt,
        // KEEP voters get no row, deliberately (spec: their tap compared two
        // times, it never answered attendance at the new one).
        seedInUserIds: yesVoterIds,
        announcementBody: buildConsensusAnnouncement(
          label, proposal.proposedStartsAt, proposal.priorStartsAt,
          proposal.group.timeZone, now
        ),
        resolveProposalId: proposal.id,
      })
      if (moved.status !== "moved") throw new StaleInTx()
    })
    return { status: "moved" }
  } catch (err) {
    if (err instanceof BelowBarInTx) return { status: "skipped", reason: "below_bar" }
    if (err instanceof StaleInTx) return { status: "skipped", reason: "stale" }
    throw err
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- promote` (both promote test files run; gauge's must stay green). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/move.ts src/lib/proposals/promote.ts src/lib/proposals/__tests__/promote.test.ts
git commit -m "Move core extraction and the consensus promote"
```

---

### Task 8: The vote action

**Files:**
- Create: `src/app/actions/proposal-vote.ts`
- Test: covered by Task 7's transaction tests plus Task 13's suite; the action itself follows `src/app/actions/gauge-vote.ts` line for line where behaviors match, and actions are exercised in the browser walkthrough (the repo's standing pattern for server actions).

**Interfaces:**
- Produces: `proposalVoteAction(prevState: ProposalVoteState, formData: FormData): Promise<ProposalVoteState>` with `ProposalVoteState = { errors?: { general?: string } }`; formData fields `proposalId`, `answer` in `{"YES","KEEP"}`.

- [ ] **Step 1: Implement** (mirror `gauge-vote.ts`: same session re-verification, same revalidate placement)

```ts
"use server"

// Follow gauge-vote.ts for the session block and the revalidatePath tail.
// The deltas that matter, in order:

const ANSWERS = ["YES", "KEEP"] as const

// 1. Guards after loading the proposal (include: { event: true }):
//    - not found or kind !== ProposalKind.GROUP  -> { errors: { general: "That question is gone." } }
//    - answer !== null                            -> { errors: { general: "That one's settled." } }
//    - event.startsAt <= now, proposedStartsAt <= now,
//      or priorStartsAt !== event.startsAt        -> { errors: { general: STALE_PROPOSAL_ERROR } }

// 2. Membership, checked here unlike gauge-vote (this vote can move a plan):
const membership = await prisma.membership.findUnique({
  where: { userId_groupId: { userId: user.id, groupId: proposal.groupId } },
})
if (!membership) return { errors: { general: "Only members can vote on this." } }

// 3. The vote, one row per person, mind-changing updates it:
await prisma.proposalVote.upsert({
  where: { proposalId_userId: { proposalId: proposal.id, userId: user.id } },
  create: { proposalId: proposal.id, userId: user.id, answer },
  update: { answer },
})

// 4. Only a YES can clear the bar (a KEEP only raises it), and the promote is
//    best-effort exactly like gauge-vote's: its failure must never eat the vote.
if (answer === "YES") {
  try {
    await promoteProposalMove(proposal.id, new Date())
  } catch (err) {
    console.error("[proposal-vote] promote failed", err)
  }
}

// 5. revalidatePath(`/groups/${proposal.groupId}`) and
//    revalidatePath(`/events/${proposal.eventId}`), outside any catch.
```

- [ ] **Step 2: Compile check**

Run: `npx tsc --noEmit`. Expected: no errors in this file (others may still be red until Tasks 10-12).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/proposal-vote.ts && git commit -m "Group proposal vote action with membership gate"
```

---

### Task 9: Feed rendering, group chips, and the tally

**Files:**
- Create: `src/app/groups/[id]/GroupProposalChips.tsx`
- Modify: `src/app/groups/[id]/page.tsx`, `src/app/groups/[id]/MessageFeed.tsx`, `src/app/groups/[id]/GroupHome.tsx` (prop threading only)
- Test: `src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx` (jsdom, modeled on `ProposalChips.test.tsx`)

**Interfaces:**
- Produces:

```ts
export interface FeedGroupProposal {
  id: string
  orbitMessageId: string
  labels: { yes: string; keep: string }
  tallyLine: string
  viewerAnswer: "YES" | "KEEP" | null
}
```

- MessageFeed gains props `groupProposals: FeedGroupProposal[]` and `viewerIsMember: boolean`, threaded from page.tsx through GroupHome exactly the way `proposals: FeedProposal[]` already travels.

- [ ] **Step 1: Write the failing component test** (representative cases; follow `ProposalChips.test.tsx` for the jsdom directive, action mocking, and render helpers)

```tsx
it("renders both chips from labels and the tally line", () => {
  render(<GroupProposalChips proposal={{
    id: "p1", orbitMessageId: "m1",
    labels: { yes: "9am works", keep: "Keep 8am" },
    tallyLine: "Sam says yes", viewerAnswer: null,
  }} />)
  expect(screen.getByRole("button", { name: "9am works" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Keep 8am" })).toBeInTheDocument()
  expect(screen.getByText("Sam says yes")).toBeInTheDocument()
})

it("marks the viewer's own standing answer", () => { /* viewerAnswer: "YES": the yes chip carries the selected state, mirroring GaugeChips */ })
```

Run: `npm test -- GroupProposalChips`. Expected: FAIL, component missing.

- [ ] **Step 2: Build the component.** Copy `GaugeChips.tsx`'s structure (optimistic answer flip via `useOptimistic`, `useTransition`, error string above the chips, never a feed message) with two chips submitting `proposalVoteAction` with `answer: "YES" | "KEEP"`, and the tally line rendered below the chips the way `GaugeTally` sits in the bubble. Then run the test: PASS.

- [ ] **Step 3: Compose in `page.tsx`.** After the existing gauge and proposal composition (which stays, now filtered to `kind === "VERIFY"`), add:

```tsx
  const groupProposals: FeedGroupProposal[] = liveProposals
    .filter((p) => p.kind === "GROUP")
    .map((p) => {
      const memberVotes = p.votes.filter((v) => memberIds.has(v.userId))
      const yesVoters = memberVotes.filter((v) => v.answer === "YES")
      const consensusInput = {
        yesVoterIds: yesVoters.map((v) => v.userId),
        keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
        currentInUserIds: p.event.rsvps
          .filter((r) => r.status === "IN" && memberIds.has(r.userId))
          .map((r) => r.userId),
        memberCount: group.memberships.length,
      }
      return {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, group.timeZone),
        tallyLine: buildProposalTallyLine(
          yesVoters.map((v) => v.user.name),
          consensusInput.keepVoterIds.length,
          oneMoreClearsIt(consensusInput)
        ),
        // Unfiltered, the gauge precedent: the viewer's own chip must reflect
        // what they chose, member or not.
        viewerAnswer: p.votes.find((v) => v.userId === viewer?.id)?.answer ?? null,
      }
    })
  const viewerIsMember = viewer ? memberIds.has(viewer.id) : false
```

Note the single `findLiveProposals` call now feeds both compositions; the VERIFY filter keeps part one's asker-only rule, and the existing `liveProposals` line loses its `viewer ?` guard (GROUP rows render for everyone; the VERIFY filter still needs `viewer`).

- [ ] **Step 4: Wire `MessageFeed`.** Build `groupProposalByMessageId` beside the existing maps; for an Orbit message carrying one, render the tally and, when `viewerIsMember`, the chips. Chips are member-gated because the vote is; the message and tally are feed history for everyone.

- [ ] **Step 5: Verify and commit.** Run `npm test -- GroupProposalChips` and `npx tsc --noEmit` (page/feed/home must compile; `detect-intent.ts` may still be red until Task 12, confirm its errors are the only remaining ones).

```bash
git add src/app/groups/[id] && git commit -m "Group proposal chips, tally, and member-gated feed wiring"
```

---

### Task 10: The verify-confirm handoff

**Files:**
- Modify: `src/app/actions/proposal-answer.ts`

**Interfaces:**
- Consumes: `consensusFloor` (Task 2), `createGroupProposal` (Task 6), `buildGroupProposalQuestion` (Task 4). The proposal load gains `include: { event: true, group: true, asker: true }`.

- [ ] **Step 1: Rewrite the CONFIRM branch.** Keep the two liveness guards and the label line, then replace the move with:

```ts
      const memberCount = await prisma.membership.count({
        where: { groupId: proposal.groupId },
      })
      if (consensusFloor(memberCount) === 1) {
        // A group of one: part one's immediate move, unchanged.
        const announcement = buildChangeAnnouncement(
          label, proposal.proposedStartsAt, proposal.priorStartsAt,
          proposal.group.timeZone, now, null
        )
        const moved = await moveEventTime({
          eventId: proposal.eventId,
          expectedStartsAt: proposal.priorStartsAt,
          newStartsAt: proposal.proposedStartsAt,
          requesterUserId: user.id,
          announcementBody: announcement,
          resolveProposalId: proposal.id,
        })
        if (moved.status === "skipped") {
          errorMsg = moved.reason === "stale" ? STALE_PROPOSAL_ERROR : "Couldn't save that, try again."
        }
      } else {
        // The asker confirmed the reading; the question now goes to the group.
        const created = await createGroupProposal({
          groupId: proposal.groupId,
          eventId: proposal.eventId,
          askerUserId: proposal.askerUserId,
          sourceMessageId: proposal.sourceMessageId,
          proposedStartsAt: proposal.proposedStartsAt,
          priorStartsAt: proposal.priorStartsAt,
          body: buildGroupProposalQuestion(
            proposal.asker.name, label, proposal.proposedStartsAt,
            proposal.priorStartsAt, proposal.group.timeZone, now,
            null // the verify already named the time to the asker; the group question names both times itself
          ),
          resolveVerifyProposalId: proposal.id,
        })
        if (created.status === "skipped") {
          errorMsg = "That one's already out to the group."
        }
      }
```

- [ ] **Step 2: Compile check, then commit**

Run: `npx tsc --noEmit` (this file clean).

```bash
git add src/app/actions/proposal-answer.ts && git commit -m "Verify confirm opens the group proposal"
```

---

### Task 11: The model's context and prompt

**Files:**
- Modify: `src/lib/orbit/spark.ts` (IntentContext, detectIntentClaim, INTENT_SYSTEM_PROMPT; INTENT_SCHEMA is untouched, by spec)
- Test: `src/lib/orbit/__tests__/spark.test.ts` (extend the `detectIntentClaim` block; update all six existing calls to the new context shape)

**Interfaces:**
- Produces:

```ts
export interface IntentContext {
  upcomingLines: string[]
  /** buildConversationWindow output: now-anchor, timestamped lines, marked trigger. */
  conversationBlock: string
  /** One line per live GROUP proposal, empty when none. */
  openProposalLines: string[]
}
```

- [ ] **Step 1: Extend the failing tests** (existing six get `conversationBlock: ""` and `openProposalLines: []` added to their context argument; then add)

```ts
it("the conversation window rides the user message", async () => {
  await detectIntentClaim("sorry i meant beers", {
    upcomingLines: ["1. Climbing, Tue Jul 28"],
    conversationBlock: "Right now it is Tue Jul 28, 6:12pm (group time).\n\nWINDOW-SENTINEL",
    openProposalLines: [],
  })
  const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
  expect(userMsg).toContain("WINDOW-SENTINEL")
  expect(userMsg.indexOf("On this group's calendar")).toBeLessThan(userMsg.indexOf("WINDOW-SENTINEL"))
})

it("open proposals are named between calendar and conversation", async () => {
  await detectIntentClaim("actually 10 works better", {
    upcomingLines: ["1. Beers, Thu Jul 30"],
    conversationBlock: "x",
    openProposalLines: ["A question is already out to the group: move beers to 9pm (asked by Sam)."],
  })
  const userMsg = vi.mocked(callExtractionModel).mock.calls.at(-1)![1]
  expect(userMsg).toContain("already out to the group")
})

it("the system prompt teaches corrections and timestamp judgment", async () => {
  await detectIntentClaim("hey", { upcomingLines: [], conversationBlock: "", openProposalLines: [] })
  const system = vi.mocked(callExtractionModel).mock.calls.at(-1)![0]
  expect(system).toContain("correction")
  expect(system.toLowerCase()).toContain("timestamps")
})
```

Run: `npm test -- spark.test`. Expected: FAIL.

- [ ] **Step 2: Implement.** `detectIntentClaim` becomes:

```ts
export async function detectIntentClaim(
  body: string,
  context: IntentContext
): Promise<unknown> {
  const calendarBlock = context.upcomingLines.length
    ? `On this group's calendar right now:\n${context.upcomingLines.join("\n")}`
    : `This group has nothing on its calendar right now.`
  const proposalBlock = context.openProposalLines.length
    ? `\n\n${context.openProposalLines.join("\n")}`
    : ""

  const user = `${calendarBlock}${proposalBlock}

${context.conversationBlock}

The message to classify:
${body}`

  return callExtractionModel(INTENT_SYSTEM_PROMPT, user, INTENT_SCHEMA)
}
```

Into `INTENT_SYSTEM_PROMPT`, insert this paragraph after the three-bullet classification list (before "Be conservative in both directions"):

```
You are shown the recent conversation with timestamps, including Orbit's own messages, plus the current date and time. Use it to resolve short messages: which plan a bare follow-up like "can we do 9 instead?" is about (usually the plan just discussed), what "it" refers to, and a correction like "sorry, I meant beers, not climbing", which is a change request for the plan the person now names, carrying the time from the exchange it corrects. Judge from the timestamps whether an earlier message is still what the group is talking about. The numbered calendar list, not the conversation, is the only source of plan numbers. When a note says a question is already out to the group about moving a plan, a message that simply agrees with it is neither a spark nor a change request; the chips handle agreement.
```

And extend two field bullets: `targetEventNumber` gains "Use the conversation to tell which plan a bare follow-up or correction means."; `requestedTime` gains "The time may come from an earlier message in the conversation when the new message plainly refers back to it."

- [ ] **Step 3: Verify, then commit**

Run: `npm test -- spark.test`. Expected: PASS, all (the six updated plus the new three).

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts
git commit -m "Intent context: window, now-anchor, open proposals; schema untouched"
```

---

### Task 12: The orchestrator

**Files:**
- Modify: `src/app/actions/detect-intent.ts`

**Interfaces:**
- Consumes: everything above. No exported shape changes; `DetectIntentResult` statuses are unchanged (`propose` reports as `"asked"`).

- [ ] **Step 1: Grow the context assembly.** The message load gains the memberships (`include: { group: { include: { memberships: true } } }`); after the `upcomingLines` block, add:

```ts
    // The conversational window: the 19 messages before the trigger plus the
    // trigger itself, oldest first. Fetched separately from the trigger so the
    // trigger is always the marked last entry even under created-at ties.
    const prior = await prisma.message.findMany({
      where: { groupId: group.id, id: { not: message.id }, createdAt: { lte: message.createdAt } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: WINDOW_MESSAGES - 1,
      include: { author: true },
    })
    const toWindowMessage = (m: (typeof prior)[number]) => ({
      authorName: m.author?.name ?? null,
      isOrbit: m.authorType === MessageAuthor.ORBIT,
      body: m.body,
      createdAt: m.createdAt,
    })
    const conversationBlock = buildConversationWindow(
      [...prior.reverse().map(toWindowMessage), toWindowMessage(message)],
      group.timeZone,
      now
    )

    const liveProposals = await findLiveProposals(group.id, now)
    const openProposalLines = liveProposals
      .filter((p) => p.kind === ProposalKind.GROUP)
      .map((p) => {
        const label = p.event.activityLabel ?? p.event.title.toLowerCase()
        return `A question is already out to the group: move ${label} to ${formatTime(p.proposedStartsAt, group.timeZone)} (asked by ${p.asker.name}).`
      })

    const claim = await detectIntentClaim(message.body, {
      upcomingLines,
      conversationBlock,
      openProposalLines,
    })
```

(`message` includes `author` only if the existing include is widened; it is the sender, so `user.name` serves for the trigger's `authorName` if the include is left narrow. Prefer widening the include to keep `toWindowMessage` uniform.)

- [ ] **Step 2: The new planChange call and the propose branch.** The change arm becomes:

```ts
      const candidates = events.map((e) => ({
        id: e.id,
        label: e.activityLabel ?? e.title.toLowerCase(),
        startsAt: e.startsAt,
      }))
      const target =
        intent.change.targetEventIndex !== null
          ? candidates[intent.change.targetEventIndex]
          : null

      const plan = planChange(
        intent.change, target, candidates, user.name,
        group.memberships.length, group.timeZone, now
      )

      if (plan.action === "quiet") return { status: "quiet" }

      if (plan.action === "reply") { /* unchanged from part one */ }
      else if (plan.action === "move") { /* part one's moveEventTime call, unchanged except every target.id / target.startsAt reference becomes resolvedTarget.id / resolvedTarget.startsAt (see the resolved-target note below) */ }
      else if (plan.action === "propose") {
        const resolvedTarget = target ?? candidates[0]
        const created = await createGroupProposal({
          groupId: group.id,
          eventId: resolvedTarget.id,
          askerUserId: user.id,
          sourceMessageId: message.id,
          proposedStartsAt: plan.proposedStartsAt,
          priorStartsAt: resolvedTarget.startsAt,
          body: plan.question,
        })
        if (created.status !== "created") return { status: "quiet" }
        outcome = "asked"
        touchedGroupId = group.id
      } else { /* "ask": unchanged createChangeProposal path, with the same resolvedTarget rule */ }
```

**Resolved-target note (this is the one subtle seam):** the ladder resolves a null target to the single candidate internally; the orchestrator needs the same event id for the row it writes. Apply `const resolvedTarget = target ?? (candidates.length === 1 ? candidates[0] : null)` once, before the branches, and use it in the move, ask, and propose branches; `planChange` only ever returns those actions when that expression is non-null, and TypeScript's non-null assertion on it must carry a comment saying exactly that.

- [ ] **Step 3: Full compile and suite**

Run: `npx tsc --noEmit` (clean, the last red file is done) and `npm test` (full suite green).

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/detect-intent.ts && git commit -m "Detection reads the window and proposes to the group"
```

---

### Task 13: The gate

- [ ] **Step 1: Full verification**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: suite green (baseline ~450 plus this slice's additions), zero type errors, zero lint errors. Record the exact final test count for the PR and the build notes.

- [ ] **Step 2: Fix anything red, then commit any fixes.** Do not proceed to QA with a red gate.

---

### Task 14: Dev-test reset and the two-plan browser walkthrough

The sandbox is dirty from part-one QA (Tuesday Climbers, moved events, QA feed noise; recorded in build-notes and project memory). Reset it first, then verify on a **two-plan sandbox**, because the owner's two-plan QA caught what a one-plan walkthrough structurally could not.

- [ ] **Step 1: Confirm the target, then clear it**

Run `npm run db:which`; it must print `pxbewardwvoyqqcvogel` and exit 0. Then run a one-off scratch script (scratchpad, not the repo; import the Prisma client the way `src/lib/prisma.ts` builds it, or import that module directly) that deletes `group` rows first (cascades events, messages, gauges, proposals, votes, RSVPs, memberships) and then `user` rows, and prints final counts. Expected output: 0 groups, 0 users, 0 events, 0 messages. The 27 July precedent is exactly this end state.

- [ ] **Step 2: Rebuild through the real product.** Start the dev server via the preview tools. Walk `/create` to found a group with a weekly rhythm (one scheduled event appears). Join three more members through the invite link in separate sessions. Spark a second plan ("beers friday?" plus three yeses) so the calendar holds two events. This is the QA sandbox.

- [ ] **Step 3: Replay the three owner-QA failures, verbatim**

1. Move one plan by name through a full consensus round, then send the bare follow-up "can we do 9 instead?" and confirm the proposal opens on the plan the conversation was about, not the calendar's first.
2. Stage a wrong-target proposal, then send "sorry i meant beers, not climbing" and confirm the beers proposal opens carrying the earlier time and the climbing proposal's chips are gone (superseded).
3. Send "can we move it to tony's?" with both plans live and confirm the venue decline arrives.

- [ ] **Step 4: Walk one full consensus arc and the edges.** Propose, second yes (tally updates, no new message), third yes moves the plan in the same tap: announcement in the feed, card on the new time, YES voters IN on the event page, KEEP and silent members back to pending. Then one supersede ("actually 10 works better" while a proposal is live) and one revert through the same consensus rule ("put it back at 8"). Screenshot each proof; note anything that could not be verified honestly.

Browser-pane gotchas (from the project's own QA history): never resize a tab mid-flow (clicks die; use a fresh tab), `read_console_messages` accumulates across navigations (prefer `preview_logs`), and confirm real URLs with `location.href`.

- [ ] **Step 5: Leave the sandbox in place as PR evidence** (the standing convention: QA data lives while its PR is open, cleared at merge).

---

### Task 15: Decision record, CLAUDE.md, and the PR

- [ ] **Step 1: Write the build-notes §11 entry** for this slice: what it is, the consensus arithmetic and why side-switching resolves the seed's deadlock, the keep-voter divergence from spark's seeding, newest-wins, the ladder rewrite, the window's shape, what QA proved, and the debt register (reply idempotency, the three-job prompt with a larger context, detection latency in front of replies, spark's own small-group edge, the gauge vote action's membership check status after verifying it).

- [ ] **Step 2: Update CLAUDE.md's "Where the build is"**: change request part two lands (consensus, window, never-silent replies); next slice becomes the one-bump resurface with its two recorded open questions.

- [ ] **Step 3: Open the PR and stop.** Push the branch, open a PR titled for the slice, body in product language, including: the owner-flagged spec decisions and where each landed, the QA evidence from Task 14, the exact final test count, and a five-minute manual QA script (the three replayed failures plus one consensus arc, with staged state offered). Do not merge; the merge signal is the owner's.

---

## Session handoff (carryover prompt)

The prompt below is for the fresh execution session, per the plan-to-disk rule. It assumes the owner has reviewed the spec's flagged decisions.

```
Execute docs/superpowers/plans/2026-07-28-change-request-part-two.md in
interplanetary-groups. The spec it implements is
docs/superpowers/specs/2026-07-28-change-request-part-two-design.md; where they
differ, the spec wins. Read CLAUDE.md first; the "Two databases, never crossed"
rule and npm run db:which apply before any DB work. Use
superpowers:subagent-driven-development, and use subagents for any codebase
investigation so this session's context stays clean. Start from a current main
(git checkout main && git pull), branch feat/change-request-consensus, and work
task by task with TDD as the plan specifies. The dev-test sandbox is dirty from
part-one QA; Task 14 resets it before any browser verification and requires a
two-plan sandbox. Open a PR at the end with the manual QA script and stop; do
not merge.
```

