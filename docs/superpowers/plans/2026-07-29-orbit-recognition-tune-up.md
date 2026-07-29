# Orbit Recognition Tune-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the hole where a direct ask ("can we move it?") is classified as not-a-request and dies silently upstream of the never-silent reply ladder, and leave behind a way to measure whether it stayed closed.

**Architecture:** Three fixes upstream of the ladder: two edits to the intent prompt's prose (`src/lib/orbit/spark.ts`) and one deletion of a guard in the claim-to-fact boundary (`normalizeIntent`) that kills a bare ask deterministically. Around them, a new database-free eval bench under `evals/` that runs real model calls through the real prompt, the real normalize layer, and the real reply planner, scoring the outcome a member would actually see. Baseline is recorded before any fix lands.

**Tech Stack:** TypeScript, `tsx` (already a devDependency, `^4.22.4`), `dotenv` (`^17.4.2`), `@anthropic-ai/sdk` (`^0.112.4`), Vitest `^4.1.9`, Anthropic `claude-haiku-4-5`.

**Spec:** [docs/superpowers/specs/2026-07-29-orbit-recognition-tune-up-design.md](../specs/2026-07-29-orbit-recognition-tune-up-design.md)

## Global Constraints

- **Branch:** `feat/orbit-recognition-tune-up`, already cut from a clean `main` at `a3caef5`. Commit here. Do not open a second branch. Do not merge.
- **The baseline runs before any fix.** Tasks 1 and 2 must be complete and their numbers recorded before Task 4 or 5 changes behavior. An after-number with no before-number is not evidence.
- **Option A, not option B.** No fourth intent class. No new field in `INTENT_SCHEMA`. Recognition gets more willing to call a plan-shaped ask a change request; it does not grow a general "aimed at Orbit" class.
- **The claim-to-fact boundary still degrades, never invents.** Deleting the empty-`requestedFields` guard removes a rejection. Do not replace it with a default value such as `["time"]`.
- **Eval files must never be named `*.test.ts` or `*.spec.ts`.** `vitest.config.ts` sets no `include`, so Vitest's default glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) would otherwise collect them and put paid network calls in CI.
- **The suite baseline is 38 files / 514 tests, all passing.** Any change to the file count must be a test file this plan adds on purpose.
- **Sweep lane:** the sweep in Task 3 finds and lists everything. It fixes only what sits in the change-request recognition path. Findings in the spark path, the gauge path, or elsewhere go on the checklist and into the owner report. They are not changed in this slice.
- **Orbit copy rules apply to any user-facing string:** plain and warm, roughly 7th-8th grade reading level, no em-dashes, soft declines. This slice is not expected to add new Orbit copy; if it does, these hold.
- **No em-dashes or en-dashes** in commit messages, docs, or the PR body.
- **Do not run `npm run db:which` migrations or seeds.** This slice touches no database and no schema.
- **Environment:** the bench needs `ANTHROPIC_API_KEY` in `.env`. It is already there (the app calls the model on every message). Never print it.

---

## File Structure

**Created:**

- `evals/detect/cases.ts` — the fixture set: types plus the case data. Data only, no logic, no imports from `src/`.
- `evals/detect/run.ts` — builds the exact context the server action builds, calls the model, runs the answer through `normalizeIntent` and `planChange`, and grades it. No printing, no database, no `process.exit`.
- `scripts/eval-detect.ts` — the CLI: loads `.env`, parses args, runs cases with a small concurrency pool, prints the scoreboard.
- `docs/superpowers/plans/2026-07-29-orbit-recognition-tune-up.md` — this file.

**Modified:**

- `src/lib/orbit/spark.ts` — two prompt edits (lines 130 and 135), one guard deleted (lines 227-228).
- `src/lib/orbit/__tests__/spark.test.ts` — invert the guard test, update the prompt-wording pins.
- `src/lib/orbit/__tests__/change-plan.test.ts` — pin that an empty `requestedFields` reaches the ask rungs.
- `package.json` — add the `eval:detect` script.
- `docs/build-notes.md` — the checklist section, and the §11 slice entry.
- `CLAUDE.md` — "Where the build is" rewrite, plus a one-line pointer to the checklist.

**Why the bench is three files:** the cases change constantly and should be readable as data by someone who is not reading code. The runner changes rarely and is the only place that knows how the action assembles context. The CLI is the only place allowed to print or exit. Keeping them apart is what lets the case list grow to a hundred entries without the runner growing at all.

---

### Task 1: The bench skeleton, proving it reproduces the owner's failure

The riskiest part of this slice is that nothing in this repo has ever run the intent prompt against the real model in a harness. This task de-risks that first, on one case: the owner's own 29 July failure. It is not finished until the bench reproduces the bug on today's unchanged code.

**Files:**
- Create: `evals/detect/cases.ts`
- Create: `evals/detect/run.ts`
- Create: `scripts/eval-detect.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildConversationWindow(messages: WindowMessage[], timeZone: string, now: Date): string` and `WINDOW_MESSAGES` from `src/lib/orbit/window.ts`; `detectIntentClaim(body: string, context: IntentContext): Promise<unknown>` and `normalizeIntent(raw: unknown, upcomingCount: number): NormalizedIntent` from `src/lib/orbit/spark.ts`; `planChange(change, target, candidates, askerName, memberCount, timeZone, now): ChangePlan` and `type ChangeTarget` from `src/lib/orbit/change-plan.ts`; `formatEventDate(startsAt: Date, endsAt: Date | null, timeZone: string): string` and `formatTime(date: Date, timeZone: string): string` from `src/lib/events/format.ts`.
- Produces: `EvalCase`, `Expected`, `Bucket`, `CASES` from `evals/detect/cases.ts`; `runCase(c: EvalCase, runs: number, now: Date): Promise<CaseResult>` and `CaseResult` from `evals/detect/run.ts`.

---

- [ ] **Step 1: Prove `tsx` can resolve the `@/` alias from `evals/`**

`src/lib/orbit/window.ts` imports `@/lib/events/format`. The existing harness precedent (`scripts/try-extract.ts`) never crosses that alias, so this is unproven. Find out before building on it.

Create a scratch file `evals/detect/alias-check.ts`:

```ts
import { buildConversationWindow, WINDOW_MESSAGES } from "../../src/lib/orbit/window"

console.log("WINDOW_MESSAGES:", WINDOW_MESSAGES)
console.log(
  buildConversationWindow(
    [{ authorName: "Sam", isOrbit: false, body: "hello", createdAt: new Date() }],
    "America/Los_Angeles",
    new Date()
  )
)
```

Run: `npx tsx evals/detect/alias-check.ts`

Expected: prints `WINDOW_MESSAGES: 20` and a three-line window block ending in `>>> [Wed Jul 29, ...] Sam: hello`.

**If it fails with a module-resolution error on `@/lib/events/format`,** do not work around it with relative-path rewrites inside `src/`. Add `--tsconfig tsconfig.json` to the invocation, and if that still fails, stop and report it as a blocker: it changes the bench's shape and is the owner's call.

- [ ] **Step 2: Delete the scratch file**

```bash
rm evals/detect/alias-check.ts
```

- [ ] **Step 3: Write the case types and the owner's case**

Create `evals/detect/cases.ts`:

```ts
// evals/detect/cases.ts
//
// Recognition eval fixtures: a short setting, one message, and the outcome a
// member should experience. NOT a test file. These hit the real model, vary
// run to run, and are scored as a rate rather than passing or failing. The
// filename deliberately avoids *.test.ts so Vitest's default glob never
// collects them into CI, where they would cost money on every run.

export type Bucket = "must-recognize" | "must-stay-quiet" | "ambiguous"

/**
 * What the member should end up seeing. `action` is optional on purpose: for
 * some asks more than one ladder rung is a correct, non-silent answer (a bare
 * "can we move it?" is answered honestly by either a which-plan or a which-time
 * question, depending on whether the model resolved the target), and pinning
 * one of them would fail the bench for being right in the other way.
 */
export type Expected =
  | { kind: "none" }
  | { kind: "spark" }
  | {
      kind: "change"
      action?: "reply" | "ask" | "propose" | "move"
      /** Substring of the reply, question, or announcement Orbit produced. */
      replyContains?: string
    }

export interface CalendarPlan {
  title: string
  /** What Orbit calls the plan in copy. */
  label: string
  /** Minutes into the future from the run's now-anchor. Must be positive. */
  minutesFromNow: number
}

export interface HistoryLine {
  /** A member's name, or the literal "Orbit". */
  author: string
  body: string
  /** Minutes before the run's now-anchor. Must be positive. */
  minutesAgo: number
}

export interface EvalCase {
  id: string
  bucket: Bucket
  /** Why this case exists. Printed next to a failure. */
  description: string
  /** Plans on the calendar, in the order the group's carousel shows them. */
  calendar: CalendarPlan[]
  /** Prior feed messages, oldest first. Trimmed to the window by the runner. */
  history: HistoryLine[]
  /** The message being classified. Always the newest thing in the feed. */
  trigger: { author: string; body: string }
  /** A live group proposal, when one is open. */
  liveProposal?: { planIndex: number; proposedMinutesFromNow: number; asker: string }
  memberCount: number
  expected: Expected
}

export const CASES: EvalCase[] = [
  {
    id: "bare-ask-after-move",
    bucket: "must-recognize",
    description:
      "The owner's 29 July failure, verbatim. A bare ask sent right after Orbit announced a consensus move got silence. Nothing here names a plan or a time, and that is the point: the ladder answers this shape with a question, so recognition must not eat it first.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Sam", body: "can we push climbing to 9?", minutesAgo: 22 },
      { author: "Priya", body: "works for me", minutesAgo: 18 },
      { author: "Jo", body: "yeah 9 is better", minutesAgo: 14 },
      {
        author: "Orbit",
        body: "Done, climbing is at 9am now. Everyone's answer got cleared, so have another look when you get a sec.",
        minutesAgo: 12,
      },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
]
```

- [ ] **Step 4: Write the runner**

Create `evals/detect/run.ts`:

```ts
// evals/detect/run.ts
//
// Runs recognition cases against the real model. Builds exactly the context
// src/app/actions/detect-intent.ts builds, then grades the outcome a member
// would experience: the classification, and then the reply ladder's action on
// top of it. Never touches the database, so it is safe to run repeatedly.

import { formatEventDate, formatTime } from "../../src/lib/events/format"
import { planChange, type ChangeTarget } from "../../src/lib/orbit/change-plan"
import { detectIntentClaim, normalizeIntent } from "../../src/lib/orbit/spark"
import {
  buildConversationWindow,
  WINDOW_MESSAGES,
  type WindowMessage,
} from "../../src/lib/orbit/window"
import type { Bucket, EvalCase } from "./cases"

/** One zone for every case, so a case never depends on where it is run. */
const TIME_ZONE = "America/Los_Angeles"

export interface CaseResult {
  id: string
  bucket: Bucket
  description: string
  runs: number
  passes: number
  /** One line per failing run, for the scoreboard. */
  failures: string[]
}

/** What actually happened on one run, flattened for comparison and printing. */
type Outcome =
  | { kind: "none" }
  | { kind: "spark" }
  | { kind: "change"; action: string; text: string }

function describe(o: Outcome): string {
  return o.kind === "change" ? `change / ${o.action}: ${o.text}` : o.kind
}

async function runOnce(c: EvalCase, now: Date): Promise<Outcome> {
  const plans = c.calendar.map((p) => ({
    ...p,
    startsAt: new Date(now.getTime() + p.minutesFromNow * 60_000),
  }))

  const upcomingLines = plans.map(
    (p, i) => `${i + 1}. ${p.title}, ${formatEventDate(p.startsAt, null, TIME_ZONE)}`
  )

  // Same cap the action applies: the newest 19 prior messages plus the trigger.
  // Without this, a deliberately long case would test a window the product
  // never actually sends.
  const prior = c.history.slice(-(WINDOW_MESSAGES - 1))
  const windowMessages: WindowMessage[] = [
    ...prior.map((h) => ({
      authorName: h.author === "Orbit" ? null : h.author,
      isOrbit: h.author === "Orbit",
      body: h.body,
      createdAt: new Date(now.getTime() - h.minutesAgo * 60_000),
    })),
    { authorName: c.trigger.author, isOrbit: false, body: c.trigger.body, createdAt: now },
  ]
  const conversationBlock = buildConversationWindow(windowMessages, TIME_ZONE, now)

  const openProposalLines = c.liveProposal
    ? [
        `A question is already out to the group: move ${plans[c.liveProposal.planIndex].label} to ${formatTime(
          new Date(now.getTime() + c.liveProposal.proposedMinutesFromNow * 60_000),
          TIME_ZONE
        )} (asked by ${c.liveProposal.asker}).`,
      ]
    : []

  const claim = await detectIntentClaim(c.trigger.body, {
    upcomingLines,
    conversationBlock,
    openProposalLines,
  })
  const intent = normalizeIntent(claim, plans.length)

  if (intent.kind === "none") return { kind: "none" }
  if (intent.kind === "spark") return { kind: "spark" }

  const candidates: ChangeTarget[] = plans.map((p) => ({
    id: p.title,
    label: p.label,
    startsAt: p.startsAt,
  }))
  const target =
    intent.change.targetEventIndex !== null ? candidates[intent.change.targetEventIndex] : null
  const plan = planChange(
    intent.change,
    target,
    candidates,
    c.trigger.author,
    c.memberCount,
    TIME_ZONE,
    now
  )

  const text =
    plan.action === "reply"
      ? plan.body
      : plan.action === "move"
        ? plan.announcement
        : plan.action === "quiet"
          ? ""
          : plan.question
  return { kind: "change", action: plan.action, text }
}

function grade(c: EvalCase, o: Outcome): string | null {
  const e = c.expected
  if (e.kind !== o.kind) return `expected ${e.kind}, got ${describe(o)}`
  if (e.kind !== "change" || o.kind !== "change") return null
  if (e.action && e.action !== o.action) {
    return `expected change / ${e.action}, got ${describe(o)}`
  }
  if (e.replyContains && !o.text.includes(e.replyContains)) {
    return `expected reply containing "${e.replyContains}", got ${describe(o)}`
  }
  return null
}

export async function runCase(c: EvalCase, runs: number, now: Date): Promise<CaseResult> {
  const failures: string[] = []
  let passes = 0
  for (let i = 0; i < runs; i++) {
    try {
      const problem = grade(c, await runOnce(c, now))
      if (problem === null) passes++
      else failures.push(problem)
    } catch (err) {
      // A thrown call is a failure, never a skipped run. Swallowing it here
      // would be the same mistake this slice exists to fix.
      failures.push(`threw: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { id: c.id, bucket: c.bucket, description: c.description, runs, passes, failures }
}
```

- [ ] **Step 5: Write the CLI**

Create `scripts/eval-detect.ts`:

```ts
// scripts/eval-detect.ts
//
// The recognition eval bench. Not part of CI: it costs money and hits the
// network, following the same precedent as scripts/try-extract.ts. Run it
// deliberately, before and after any change to how Orbit decides what a
// message means.
//
// Usage: npm run eval:detect            (5 runs per case, every case)
//        npm run eval:detect -- 3       (3 runs per case)
//        npm run eval:detect -- 5 bare  (only cases whose id contains "bare")

import { config } from "dotenv"
config()

/** How many cases are in flight at once. Keeps a 20-case run near a minute. */
const CONCURRENCY = 5

async function main() {
  const runs = Number(process.argv[2] ?? 5)
  const filter = process.argv[3] ?? ""
  if (!Number.isInteger(runs) || runs < 1) {
    console.error("usage: npm run eval:detect -- [runs] [id-filter]")
    process.exit(1)
  }

  // Imported after dotenv so ANTHROPIC_API_KEY is present.
  const { CASES } = await import("../evals/detect/cases")
  const { runCase } = await import("../evals/detect/run")

  const selected = CASES.filter((c) => c.id.includes(filter))
  if (selected.length === 0) {
    console.error(`no cases match "${filter}"`)
    process.exit(1)
  }

  // One now-anchor for the whole run, so every case sees the same clock.
  const now = new Date()
  console.log(`${selected.length} cases x ${runs} runs = ${selected.length * runs} model calls\n`)

  const results = []
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const chunk = selected.slice(i, i + CONCURRENCY)
    results.push(...(await Promise.all(chunk.map((c) => runCase(c, runs, now)))))
    console.log(`  ...${Math.min(i + CONCURRENCY, selected.length)}/${selected.length}`)
  }

  const buckets = ["must-recognize", "must-stay-quiet", "ambiguous"] as const
  console.log("\n=== SCOREBOARD ===")
  for (const b of buckets) {
    const inBucket = results.filter((r) => r.bucket === b)
    if (inBucket.length === 0) continue
    const passes = inBucket.reduce((n, r) => n + r.passes, 0)
    const total = inBucket.reduce((n, r) => n + r.runs, 0)
    const clean = inBucket.filter((r) => r.passes === r.runs).length
    console.log(
      `${b}: ${passes}/${total} runs, ${clean}/${inBucket.length} cases clean` +
        (b === "ambiguous" ? "  (no bar, watched for drift)" : "")
    )
  }

  const bad = results.filter((r) => r.passes < r.runs)
  if (bad.length === 0) {
    console.log("\nNo failures.")
    return
  }
  console.log(`\n=== FAILURES (${bad.length}) ===`)
  for (const r of bad) {
    console.log(`\n[${r.bucket}] ${r.id}  ${r.passes}/${r.runs}`)
    console.log(`  ${r.description}`)
    for (const f of [...new Set(r.failures)]) {
      const n = r.failures.filter((x) => x === f).length
      console.log(`  x${n} ${f}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 6: Add the npm script**

In `package.json`, add `eval:detect` to the scripts block, after `db:which`:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:which": "tsx scripts/db-which.ts",
    "eval:detect": "tsx scripts/eval-detect.ts"
  },
```

- [ ] **Step 7: Run the bench on the owner's case against unchanged code**

Run: `npm run eval:detect -- 5 bare-ask-after-move`

Expected: a scoreboard line reading `must-recognize: N/5 runs, ...` with **N less than 5**, and a failure block showing `expected change, got none` at least once.

**This is the gate for the whole slice.** If the case passes 5/5 on unchanged code, the bench does not reproduce the bug the owner hit and is therefore not measuring the right thing. Do not proceed to Task 2. Stop and report: either the case setting is wrong (most likely the history does not match what was really in the feed) or the failure is rarer than assumed and needs more runs to surface. Both are the owner's call.

- [ ] **Step 8: Confirm the eval files stayed out of the automated suite**

Run: `npm test 2>&1 | tail -5`

Expected: `Test Files  38 passed (38)` and `Tests  514 passed (514)`, exactly the pre-existing baseline. If either number moved, an eval file is being collected. Rename it; do not add a Vitest exclude.

- [ ] **Step 9: Commit**

```bash
git add evals/detect/cases.ts evals/detect/run.ts scripts/eval-detect.ts package.json
git commit -m "$(cat <<'EOF'
Eval bench, and proof it reproduces the silence the owner hit

Recognition varies run to run, so a single clean walkthrough was never
evidence that a fix worked. This is the smallest thing that can tell the
difference: a case is a short setting plus one message plus the outcome a
member should see, run five times, scored as a rate.

It grades what someone would actually experience, not just a label. After
the model answers, the answer goes through the same claim-to-fact boundary
and the same reply ladder the product uses, so a case says "this produces a
which-plan question" rather than "this classified as a change request". It
reads the model and nothing else; no database is touched.

The only case in it so far is the owner's own 29 July failure, and it fails
against today's unchanged code, which is the point. A bench that cannot
reproduce the bug cannot prove the bug is gone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The full case set, and the recorded baseline

**Files:**
- Modify: `evals/detect/cases.ts`

**Interfaces:**
- Consumes: `EvalCase` from Task 1.
- Produces: a `CASES` array of 21 entries, and a recorded baseline the later tasks compare against.

The must-stay-quiet bucket is the load-bearing half of this task. It is the only thing standing between this slice and a chattier Orbit, and `move-on-topic`, `info-question`, and `reaction-to-orbit-move` are its sharpest probes: each is a near neighbour of something we are deliberately teaching Orbit to catch.

- [ ] **Step 1: Add the remaining eight must-recognize cases**

Append to the `CASES` array in `evals/detect/cases.ts`, inside the closing `]`:

```ts
  {
    id: "bare-ask-one-plan",
    bucket: "must-recognize",
    description:
      "Same bare ask with only one plan on the calendar. The target is unambiguous, so the honest answer is to ask what time.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Priya", body: "see you all there", minutesAgo: 40 }],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply" },
  },
  {
    id: "bare-ask-no-plans",
    bucket: "must-recognize",
    description:
      "A bare ask with nothing on the calendar. The ladder has an honest answer for this and it must get the chance to give it.",
    calendar: [],
    history: [{ author: "Jo", body: "quiet week", minutesAgo: 90 }],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply", replyContains: "I don't see any plans" },
  },
  {
    id: "indirect-push-later",
    bucket: "must-recognize",
    description:
      "An indirect ask with a plan-shaped verb and no time. Politeness is not the same as not asking.",
    calendar: [{ title: "Beers", label: "beers", minutesFromNow: 60 * 50 }],
    history: [{ author: "Priya", body: "looking forward to it", minutesAgo: 30 }],
    trigger: { author: "Sam", body: "any chance we push it later?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "reschedule-word",
    bucket: "must-recognize",
    description: "The plainest possible ask with no time attached.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 20 }],
    history: [{ author: "Jo", body: "excited", minutesAgo: 55 }],
    trigger: { author: "Sam", body: "can we reschedule?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "correction-names-plan",
    bucket: "must-recognize",
    description:
      "The owner's 28 July correction failure. Names a plan, names no time, arrives right after Orbit acted on the wrong one. Which rung answers it depends on whether the model carries the time from the exchange, and both are honest.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Sam", body: "can we do 9 instead?", minutesAgo: 20 },
      { author: "Orbit", body: "Sounds like you want climbing moved to 9am. Want me to make the change?", minutesAgo: 19 },
      { author: "Sam", body: "yes", minutesAgo: 17 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 16 },
    ],
    trigger: { author: "Sam", body: "sorry i meant beers, not climbing" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "follow-up-bare-hour",
    bucket: "must-recognize",
    description:
      "A bare hour following a discussion about one specific plan. Tests that the window is doing its job as well as that recognition fires.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Priya", body: "is beers still on for friday?", minutesAgo: 25 },
      { author: "Jo", body: "yep, 7", minutesAgo: 24 },
    ],
    trigger: { author: "Sam", body: "can we do 9 instead?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "put-it-back",
    bucket: "must-recognize",
    description:
      "A revert is just another change request. Names no clock time of its own, which is exactly the shape the deleted guard used to kill.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "9 is rough for me honestly", minutesAgo: 15 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 40 },
    ],
    trigger: { author: "Sam", body: "put it back" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "venue-ask-two-plans",
    bucket: "must-recognize",
    description:
      "A venue ask must still reach its honest decline, which never needed to know the target. This is the third of the owner's 28 July failures and it must not regress while recognition is being loosened.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [{ author: "Priya", body: "where are we meeting?", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "can we move it to tony's?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply", replyContains: "spot" },
  },
  {
    id: "bare-ask-long-history",
    bucket: "must-recognize",
    description:
      "The same bare ask under a full window's worth of chatter, so the plan talk sits near the edge of what Orbit is sent. Twenty-four prior messages against a nineteen-message cap.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "climbing at 8 still good?", minutesAgo: 300 },
      { author: "Priya", body: "yep", minutesAgo: 295 },
      { author: "Sam", body: "cool", minutesAgo: 290 },
      { author: "Jo", body: "anyone seen my chalk bag", minutesAgo: 200 },
      { author: "Priya", body: "no", minutesAgo: 195 },
      { author: "Sam", body: "haha", minutesAgo: 190 },
      { author: "Jo", body: "it was in my car", minutesAgo: 185 },
      { author: "Priya", body: "classic", minutesAgo: 180 },
      { author: "Sam", body: "lol", minutesAgo: 175 },
      { author: "Jo", body: "weather looks ok", minutesAgo: 170 },
      { author: "Priya", body: "nice", minutesAgo: 165 },
      { author: "Sam", body: "finally", minutesAgo: 160 },
      { author: "Jo", body: "new shoes arrived", minutesAgo: 155 },
      { author: "Priya", body: "which ones", minutesAgo: 150 },
      { author: "Sam", body: "the red ones", minutesAgo: 145 },
      { author: "Jo", body: "nice", minutesAgo: 140 },
      { author: "Priya", body: "jealous", minutesAgo: 135 },
      { author: "Sam", body: "they were on sale", minutesAgo: 130 },
      { author: "Jo", body: "link?", minutesAgo: 125 },
      { author: "Priya", body: "sent it", minutesAgo: 120 },
      { author: "Sam", body: "thanks", minutesAgo: 115 },
      { author: "Jo", body: "ok see you all soon", minutesAgo: 110 },
      { author: "Priya", body: "yep", minutesAgo: 105 },
      { author: "Sam", body: "👍", minutesAgo: 100 },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
```

- [ ] **Step 2: Add the nine must-stay-quiet cases**

Append to `CASES`:

```ts
  {
    id: "agreement",
    bucket: "must-stay-quiet",
    description: "Plain agreement. Nothing is being asked of Orbit.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "climbing at 8 works for me", minutesAgo: 10 }],
    trigger: { author: "Sam", body: "sounds good" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "reaction-to-orbit-move",
    bucket: "must-stay-quiet",
    description:
      "The nearest neighbour of the owner's failure: same position in the feed, right after Orbit moved a plan, but a reaction rather than an ask. If loosening recognition breaks anything, it breaks here first.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "yeah 9 is better", minutesAgo: 14 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 12 },
    ],
    trigger: { author: "Sam", body: "nice, thanks orbit" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "move-on-topic",
    bucket: "must-stay-quiet",
    description:
      "A movement verb that has nothing to do with a plan. This is the false-positive option A is explicitly not supposed to buy.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "anyway that's settled", minutesAgo: 8 }],
    trigger: { author: "Sam", body: "should we move on?" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "info-question",
    bucket: "must-stay-quiet",
    description:
      "A question that only asks for information about an existing plan. The prompt bullet covering this is being narrowed in Task 5, so this case is what proves the narrowing did not go too far.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "see you tomorrow", minutesAgo: 30 }],
    trigger: { author: "Sam", body: "what time again?" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "availability-late",
    bucket: "must-stay-quiet",
    description: "Availability, not a request. Sam is telling people, not asking Orbit.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 2 }],
    history: [{ author: "Jo", body: "heading over now", minutesAgo: 5 }],
    trigger: { author: "Sam", body: "running late, start without me" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "availability-cant-make",
    bucket: "must-stay-quiet",
    description:
      "Names a clock time and a problem, but asks for nothing. The closest a stay-quiet case gets to a change request without being one.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8am tomorrow then", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "I can't make 8" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "commentary-wish",
    bucket: "must-stay-quiet",
    description: "A wish about a time that does not ask for anything to change.",
    calendar: [{ title: "Beers", label: "beers", minutesFromNow: 60 * 50 }],
    history: [{ author: "Jo", body: "beers at 7 friday", minutesAgo: 25 }],
    trigger: { author: "Sam", body: "9 would've been better" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "small-talk",
    bucket: "must-stay-quiet",
    description: "No activity and no plan in it at all.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "did you see that video", minutesAgo: 12 }],
    trigger: { author: "Sam", body: "haha same" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "agrees-with-live-proposal",
    bucket: "must-stay-quiet",
    description:
      "Agreement while a group proposal is open. The chips handle this; a message is not a vote. Guards the prompt rule that a live proposal makes agreement neither a spark nor a change request.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Priya", body: "can we push climbing to 9?", minutesAgo: 6 },
      { author: "Orbit", body: "Priya wants to move climbing to 9am. Does that work?", minutesAgo: 5 },
    ],
    liveProposal: { planIndex: 0, proposedMinutesFromNow: 60 * 31, asker: "Priya" },
    trigger: { author: "Sam", body: "yeah that works for me" },
    memberCount: 4,
    expected: { kind: "none" },
  },
```

- [ ] **Step 3: Add the three ambiguous cases**

Append to `CASES`:

```ts
  {
    id: "might-be-late-implies-move",
    bucket: "ambiguous",
    description:
      "Reads as availability and as a hint that the time should move. No right answer; recorded to watch which way the dial drifts.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8am start", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "I might be late again, 8 is rough" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "group-grumble",
    bucket: "ambiguous",
    description:
      "Commentary on behalf of the group that stops just short of asking. Watched, not barred.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8 is early", minutesAgo: 15 }],
    trigger: { author: "Sam", body: "nobody really likes 8 do they" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "referent-past-the-window",
    bucket: "ambiguous",
    description:
      "The plan being referred to was discussed further back than the nineteen prior messages Orbit is sent, so the trigger arrives with its referent trimmed away. Records what Orbit does when the window genuinely cannot help.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Jo", body: "beers is the one I want to shift", minutesAgo: 400 },
      { author: "Priya", body: "ok", minutesAgo: 395 },
      { author: "Sam", body: "sure", minutesAgo: 390 },
      { author: "Jo", body: "unrelated: chalk bag found", minutesAgo: 200 },
      { author: "Priya", body: "good", minutesAgo: 195 },
      { author: "Sam", body: "nice", minutesAgo: 190 },
      { author: "Jo", body: "weather ok", minutesAgo: 185 },
      { author: "Priya", body: "yep", minutesAgo: 180 },
      { author: "Sam", body: "cool", minutesAgo: 175 },
      { author: "Jo", body: "new shoes", minutesAgo: 170 },
      { author: "Priya", body: "which", minutesAgo: 165 },
      { author: "Sam", body: "red", minutesAgo: 160 },
      { author: "Jo", body: "nice", minutesAgo: 155 },
      { author: "Priya", body: "jealous", minutesAgo: 150 },
      { author: "Sam", body: "on sale", minutesAgo: 145 },
      { author: "Jo", body: "link", minutesAgo: 140 },
      { author: "Priya", body: "sent", minutesAgo: 135 },
      { author: "Sam", body: "thanks", minutesAgo: 130 },
      { author: "Jo", body: "see you soon", minutesAgo: 125 },
      { author: "Priya", body: "yep", minutesAgo: 120 },
      { author: "Sam", body: "👍", minutesAgo: 115 },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
]
```

- [ ] **Step 4: Type-check the case file**

Run: `npx tsc --noEmit`

Expected: no errors. (Lint holds at one pre-existing error in `OnboardingWizard.tsx`, untouched by this branch; that one is expected and is not a regression.)

- [ ] **Step 5: Run the full baseline**

Run: `npm run eval:detect 2>&1 | tee /tmp/eval-baseline.txt`

Expected: 21 cases x 5 runs = 105 model calls, roughly a minute, and a full scoreboard. Some must-recognize cases will fail; that is the bug this slice fixes.

- [ ] **Step 6: Record the baseline in the plan file**

Paste the scoreboard's three bucket lines and the list of failing case ids into a new section at the bottom of this plan file titled `## Baseline (before any fix)`, with the date. This is the before-number the whole slice is measured against, and it must live somewhere durable before behavior changes.

- [ ] **Step 7: Commit**

```bash
git add evals/detect/cases.ts docs/superpowers/plans/2026-07-29-orbit-recognition-tune-up.md
git commit -m "$(cat <<'EOF'
Twenty-one recognition cases, and the number to beat

Nine asks Orbit must not miss, nine messages it must not answer, and three
with no right answer that are recorded to watch the dial drift.

The stay-quiet nine are the load-bearing half. Each of the sharpest three
sits right next to something this slice is deliberately teaching Orbit to
catch: a reaction in the same feed position as the ask that started all
this, a question about a plan that only wants information, and a movement
verb with no plan behind it. If loosening recognition costs anything, it
shows up there first.

Baseline recorded against unchanged code, so the after-number means
something.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The sweep

**Files:**
- Create: nothing yet. Produces a written list used by Tasks 5 and 7.

The sweep runs before the fixes so the fixes act on a complete list rather than the three holes that happened to be found first.

- [ ] **Step 1: Catalogue every exit into silence on the detection path**

Read, in full, and list every branch that ends without Orbit saying anything:

- `src/app/actions/detect-intent.ts` in its entirety
- `src/lib/orbit/change-plan.ts` in its entirety
- `src/lib/orbit/spark.ts` lines 56-83 and 209-251
- `src/lib/orbit/window.ts`

For each, record: file:line, what triggers it, and whether it is **structural** (Orbit genuinely has nothing to answer, e.g. the message is Orbit's own), **correct** (a real stay-quiet decision the owner has affirmed), or **stale** (part one's philosophy that the 28 July amendment replaced).

- [ ] **Step 2: Grep the prompt and the docs for the old philosophy**

```bash
grep -rn "not sure\|conservative\|costs nothing\|stay quiet\|quiet\|silence\|interjecting" src/lib/orbit/ CLAUDE.md docs/build-notes.md
```

Read each hit. The target is any wording that instructs, or documents, a preference for silence when Orbit is unsure whether someone is asking it for something.

- [ ] **Step 3: Sort every finding into two lists**

**In lane** (fix in Task 5): anything in the change-request recognition path, meaning the intent prompt's classification instructions and the normalize guards that convert an unclear change request into none.

**Out of lane** (checklist plus owner report, do not touch): the spark arm's suppressions, the gauge path, the swallowed-error path at the end of `detectIntentAction`, and anything in another feature entirely.

- [ ] **Step 4: Write the findings into a scratch note**

Write the two lists to `/tmp/sweep-findings.md`. Tasks 5 and 7 consume it. Nothing is committed in this task; the sweep's product is a decision about what Tasks 5 and 7 do.

- [ ] **Step 5: Report to the owner before fixing anything**

If the in-lane list contains anything beyond the three holes named in the spec, stop and report it before proceeding. More than three means the spec's scope estimate was wrong, and whether to widen this slice or split is the owner's call, not the builder's.

---

### Task 4: Hole 3, the guard that kills a bare ask every time

The only deterministic hole, so it gets a real regression test rather than a rate.

**Files:**
- Modify: `src/lib/orbit/spark.ts:222-228`
- Modify: `src/lib/orbit/__tests__/spark.test.ts`
- Modify: `src/lib/orbit/__tests__/change-plan.test.ts`

**Interfaces:**
- Consumes: `normalizeIntent(raw: unknown, upcomingCount: number): NormalizedIntent`, `planChange(...)`, `ChangeTarget` (all unchanged in signature).
- Produces: `normalizeIntent` now returns `{ kind: "change", change: { ..., requestedFields: [] } }` where it previously returned `{ kind: "none" }`. No type changes; `requestedFields` was always `ChangeField[]` and an empty array was always in that type.

- [ ] **Step 1: Find the existing test that asserts the opposite**

```bash
grep -n "requestedFields" src/lib/orbit/__tests__/spark.test.ts
```

There is an existing case asserting that an empty or fully-filtered `requestedFields` normalizes to `{ kind: "none" }`. Note its line number; Step 4 replaces it. Do not leave it in place asserting the old behavior, and do not delete the sibling assertions about dropping unknown field names and de-duplicating, which are still correct.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/orbit/__tests__/spark.test.ts`, inside the existing `describe("normalizeIntent", ...)` block, next to the other `requestedFields` cases:

```ts
  it("keeps a change request that names nothing to change", () => {
    // "can we move it?" names no plan, no time, and no field. The reply ladder
    // answers exactly this shape with a question, so normalize must not
    // convert it to silence before the ladder ever sees it.
    const r = normalizeIntent(
      {
        ...changeClaim,
        targetEventNumber: null,
        requestedTime: null,
        requestedTimeAmbiguous: false,
        requestedFields: [],
      },
      2
    )
    expect(r).toEqual({
      kind: "change",
      change: {
        targetEventIndex: null,
        requestedTime: null,
        requestedTimeAmbiguous: false,
        requestedFields: [],
        intentClear: true,
      },
    })
  })
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts -t "names nothing to change"`

Expected: FAIL, with the received value being `{ kind: "none" }`.

- [ ] **Step 4: Delete the guard**

In `src/lib/orbit/spark.ts`, replace lines 222-228:

```ts
  const requestedFields = Array.isArray(o.requestedFields)
    ? ([...new Set(o.requestedFields)].filter((f): f is ChangeField =>
        CHANGE_FIELDS.includes(f as string)
      ) as ChangeField[])
    : []
  // A change request that names nothing to change is not one.
  if (requestedFields.length === 0) return { kind: "none" }
```

with:

```ts
  const requestedFields = Array.isArray(o.requestedFields)
    ? ([...new Set(o.requestedFields)].filter((f): f is ChangeField =>
        CHANGE_FIELDS.includes(f as string)
      ) as ChangeField[])
    : []
  // An empty list is deliberately kept. A bare "can we move it?" names no
  // field, and the reply ladder answers that shape with a which-plan or
  // which-time question. Rejecting it here was part one's stay-quiet default
  // outliving the 28 July rule that a direct ask never gets silence, and it
  // failed identically on every run rather than only sometimes. Not defaulted
  // to ["time"]: that would assert a claim the model never made, on the one
  // boundary whose whole job is to avoid that, and it would be wrong for
  // someone who meant the venue.
```

Then find and replace the old test identified in Step 1 so it asserts the new behavior rather than the old.

- [ ] **Step 5: Run the test and the whole spark suite**

Run: `npx vitest run src/lib/orbit/__tests__/spark.test.ts`

Expected: PASS, all cases in the file.

- [ ] **Step 6: Pin the ladder side of the change**

Add to `src/lib/orbit/__tests__/change-plan.test.ts`, following the file's existing factory style:

```ts
  it("asks which plan when a change request names nothing at all", () => {
    // The shape normalize now lets through: no target, no time, no field.
    const plan = planChange(
      makeChange({ targetEventIndex: null, requestedTime: null, requestedFields: [] }),
      null,
      [climbing, beers],
      "Sam",
      4,
      "America/Los_Angeles",
      now
    )
    expect(plan.action).toBe("reply")
    if (plan.action !== "reply") throw new Error("unreachable")
    expect(plan.body).toContain("Which plan")
  })
```

Adapt `makeChange`, `climbing`, `beers`, and `now` to the exact names the file already uses (read the top of the file first; the factory is a local helper around line 14-23). If the which-plan copy differs from `"Which plan"`, assert against the actual string in `src/lib/orbit/change-copy.ts` rather than changing the copy.

- [ ] **Step 7: Run the full suite**

Run: `npm test 2>&1 | tail -5`

Expected: `Test Files  38 passed (38)`, `Tests  516 passed (516)`. The file count is unchanged; the test count is up by exactly the two tests added here. If any other test failed, it was pinning the old behavior; read it before touching it and report anything whose intent is not obviously the deleted guard.

- [ ] **Step 8: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts src/lib/orbit/__tests__/change-plan.test.ts
git commit -m "$(cat <<'EOF'
A bare ask no longer dies in our own code

"Can we move it?" names no plan, no time, and no part of the plan to
change. Four lines in the claim-to-fact boundary threw away any change
request that named nothing to change, so even on a run where Orbit did
recognize the ask, our own code converted it to silence before the reply
ladder saw it. Unlike the prompt side of this, it failed the same way every
single time.

The empty list now flows through, and the ladder answers it the way it was
always built to: by asking which plan, or what time. Deliberately not
defaulted to a time change, which would put a claim in the model's mouth on
the one boundary that exists to prevent exactly that, and would be wrong for
someone who meant the venue.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Holes 1 and 2, the prompt

**Files:**
- Modify: `src/lib/orbit/spark.ts:130` and `src/lib/orbit/spark.ts:135`
- Modify: `src/lib/orbit/__tests__/spark.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes. `INTENT_SYSTEM_PROMPT` stays module-private; the bench reaches it through `detectIntentClaim`.

- [ ] **Step 1: Narrow the negative-list bullet**

In `src/lib/orbit/spark.ts`, line 130, replace:

```
- questions about an existing plan ("what time again?", "where is it?")
```

with:

```
- questions that only ask for information about an existing plan ("what time again?", "where is it?"). A question that asks for the plan to change ("can we move it?", "any chance we push it later?") IS a change request, even when it names no time and no plan
```

- [ ] **Step 2: Replace the tiebreak sentence**

In `src/lib/orbit/spark.ts`, line 135, replace:

```
If you are not sure, answer isSpark false and isChangeRequest false. Missing something real costs nothing; interjecting on ordinary chat is worse. A message cannot be both: if it somehow reads as both, set only the one it mostly is.
```

with:

```
Two different kinds of doubt, and they get opposite answers. If the message is asking for a plan to change, say so even when it does not say which plan or what time: leave those fields null and set isChangeRequest true, because the missing pieces get asked about and an incomplete ask is still an ask. If you are not sure the message is asking for anything at all, answer isSpark false and isChangeRequest false. A message cannot be both: if it somehow reads as both, set only the one it mostly is.
```

The mutual-exclusion sentence is kept verbatim; `normalizeIntent` depends on it (`spark.ts:213` treats a both-true claim as neither).

- [ ] **Step 3: Apply any additional in-lane findings from Task 3**

If the sweep's in-lane list held anything beyond these two edits and Task 4's guard, apply it here, and only what is on that list. Everything on the out-of-lane list stays untouched.

- [ ] **Step 4: Update the prompt-wording pins**

```bash
grep -n "not sure\|exactly one\|INTENT_SYSTEM_PROMPT\|system" src/lib/orbit/__tests__/spark.test.ts | head -30
```

Inside `describe("detectIntentClaim", ...)` there are assertions pinning phrases in the system prompt. Any assertion that pins the deleted sentence must be replaced, not deleted outright, so the new rule stays pinned. Add:

```ts
  it("tells the model an incomplete ask is still an ask", async () => {
    await detectIntentClaim("can we move it?", {
      upcomingLines: ["1. Climbing, Sun, Jul 26 · 8am"],
      conversationBlock: "Right now it is Sat Jul 25, 9am (group time).",
      openProposalLines: [],
    })
    const [system] = vi.mocked(callExtractionModel).mock.calls.at(-1)!
    expect(system).toContain("an incomplete ask is still an ask")
    expect(system).not.toContain("Missing something real costs nothing")
  })
```

Match the file's existing style for reaching the mock (the surrounding tests already read `vi.mocked(callExtractionModel).mock.calls.at(-1)`); copy their exact form rather than the sketch above if it differs.

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -5`

Expected: `Test Files  38 passed (38)`, `Tests  517 passed (517)`.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: `tsc` clean. Lint shows the one pre-existing error in `OnboardingWizard.tsx` and no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orbit/spark.ts src/lib/orbit/__tests__/spark.test.ts
git commit -m "$(cat <<'EOF'
The prompt stops arguing the rule the owner replaced

Two sentences in the intent prompt were still teaching the model part one's
philosophy, a full day after the owner replaced it. One said outright that
missing a real ask costs nothing and interjecting is worse, which is the
exact belief the never-silent rule overturned. The other listed questions
about an existing plan as something to ignore, and "can we move it?" is a
question about an existing plan, so the instruction and the intent collided
and the model resolved it as written.

The tiebreak now splits a doubt that was being treated as one thing. Unsure
whether anyone is asking Orbit for anything at all: stay quiet, unchanged,
anti-clutter still governs that. Unsure only about what they meant, once
they have plainly asked for a plan to change: say so and let the ladder ask
which plan or what time.

This is the whole reason the fix took a day of looking to find. The rule
lives in two places, code and prose, in two files, written for two readers,
with nothing connecting them. The ladder learned it and the prompt did not,
and both looked right on their own.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The after-run

**Files:**
- Modify: `docs/superpowers/plans/2026-07-29-orbit-recognition-tune-up.md`

- [ ] **Step 1: Re-run the bench**

Run: `npm run eval:detect 2>&1 | tee /tmp/eval-after.txt`

- [ ] **Step 2: Compare against the baseline**

```bash
diff /tmp/eval-baseline.txt /tmp/eval-after.txt
```

Read both scoreboards side by side. The three questions to answer, in order:

1. Did `bare-ask-after-move` go from failing to 5/5?
2. Did **must-stay-quiet** hold at its bar? A drop here is the cost of the fix and is the single most important number in the slice.
3. Did anything in must-recognize get worse rather than better?

- [ ] **Step 3: Re-run any case that is not clean, at higher volume**

For any case scoring between 1 and 4 out of 5 in either barred bucket:

Run: `npm run eval:detect -- 15 <case-id>`

Five runs distinguishes always from sometimes and nothing finer. Fifteen tells you roughly where between them it sits. Record the number; do not round it into a claim.

- [ ] **Step 4: Record the after-numbers**

Append a `## After (post-fix)` section to this plan file with both scoreboards' bucket lines, the per-case results for anything not clean, and a plain sentence naming what did not reach its bar. Do not smooth a 4/5 into "fixed."

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-29-orbit-recognition-tune-up.md
git commit -m "$(cat <<'EOF'
Before and after, in the record

Both scoreboards, the per-case numbers for anything that did not come back
clean, and a plain sentence about what still misses its bar. Recorded rather
than summarized, because the point of building the bench was to stop
claiming a fix worked on the strength of one good walkthrough.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The checklist, the records, and the PR

**Files:**
- Modify: `docs/build-notes.md` (new checklist section, plus a §11 slice entry)
- Modify: `CLAUDE.md` ("Where the build is", plus a pointer to the checklist)

- [ ] **Step 1: Write the checklist into build-notes**

Add a new section to `docs/build-notes.md` titled **"Where Orbit decides to speak or stay quiet"**, built from Task 3's findings. One line per decision point: the file and line, what triggers it, which way it currently leans, and whether it is structural, correct, or open.

End the section with the maintenance rule, in these words or close to them:

> A checklist is only true the day it is written. Any slice that adds a new speak-or-stay-quiet decision adds its line here. Without that, this rots into something worse than nothing: a list that looks complete and is not.

- [ ] **Step 2: Point at it from CLAUDE.md**

Add one line to the Orbit guardrails section of `CLAUDE.md`, beneath the existing "never leave a direct ask hanging" bullet:

```markdown
- **Every place Orbit decides to speak or stay quiet is listed in build-notes ("Where Orbit decides to speak or stay quiet").** Read it before changing how eager Orbit is; the rule lives in code and in prompt prose in separate files, and the 29 July recognition bug was the two disagreeing. Any slice that adds a new such decision adds its line.
```

- [ ] **Step 3: Write the build-notes §11 slice entry**

Add an entry to §11 covering: the two-copies-of-one-rule mechanism that caused it; the three holes, with the deterministic one called out as different in kind from the other two; option A chosen over option B with the additive path recorded; the bench's design (a case is a setting plus a message plus an outcome, graded through the real ladder, never touching a database) and its baseline and after-numbers; the sweep's out-of-lane findings as named open questions for the owner; and the debt below.

Debt to record:
- The bench covers recognition only; spark's own classification and the gauge path are not in it.
- Five runs is a coarse instrument, always-or-sometimes and no finer.
- Option B stays open, and the checklist is where the case for it accumulates.
- The intent prompt is still doing three jobs, carried forward from part one and part two, not resolved here.
- Anything the sweep found out of lane.

- [ ] **Step 4: Rewrite "Where the build is" in CLAUDE.md**

Update the section for the new slice boundary: recognition no longer eats a direct ask, the bench exists and how to run it, and replace the "Next slice" block with the one-bump resurface, which this slice did not touch and which keeps its two open questions.

- [ ] **Step 5: Verify everything one last time**

```bash
npm test 2>&1 | tail -5 && npx tsc --noEmit && npm run lint
```

Expected: 38 files / 517 tests passing, `tsc` clean, lint at the one pre-existing `OnboardingWizard.tsx` error.

- [ ] **Step 6: Commit the records**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "$(cat <<'EOF'
The checklist, so the next tune-up starts from a list

This bug took a day of looking because nothing anywhere said where Orbit's
speak-or-stay-quiet decision actually gets made. It is made in a prompt, in
a normalize guard, and in a reply ladder, across three files, and the rule
they are all supposed to implement lives in a fourth. Loosening it in one
place looked complete from every angle except the one the owner hit.

Build-notes now lists every one of those places, which way each leans, and
the rule that a slice adding a new one adds its line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push and open the PR, then stop**

```bash
git push -u origin feat/orbit-recognition-tune-up
```

Open the PR with `gh pr create`. The body must carry, in product language: what the slice does, the before-and-after bench numbers stated honestly including anything below its bar, the sweep's out-of-lane findings as questions for the owner, and the debt.

The PR body must end with this manual QA script, and the same script must be repeated in the chat message announcing the PR:

```markdown
## Five-minute QA

Staging: a group with two upcoming plans and at least three members. Offer to seed it.

1. **The bug itself.** In the group chat, ask a member to move something without naming what or when: "can we move it?" Orbit should answer within a few seconds with a question, either asking which plan or asking what time. It must not sit silent. Send it again a minute later; it should answer again rather than going quiet on the second try.
2. **Right after Orbit acts.** Run a real time change to completion so Orbit posts its announcement, then immediately send "can we move it?" again. This is the exact moment the bug was found and the worst moment for silence.
3. **The cost of the fix, and the part worth your judgment.** Send each of these and confirm Orbit stays quiet: "sounds good", "what time again?", "should we move on?", "running late", "9 would've been better". Any reply here is Orbit being too eager, which is the trade this slice made. One reply among the five is a judgment call worth telling me about; two or more means the dial went too far.
4. **The declines still work.** Send "can we move it to tony's?" Orbit should still say it can't change the spot yet. Send "can we do it saturday instead?" It should still say it can't move it to another day.
5. **Voice check.** Read Orbit's new questions out loud. Plain and warm, no jargon, nothing that reads like a form.

Automated verification cannot reach steps 3 and 5: whether an extra Orbit message feels intrusive in a real conversation, and whether the copy sounds right, are both judgment calls. The bench measures step 1 and step 3 as rates over 5 runs, which tells you always-or-sometimes and nothing finer.
```

**Stop after opening the PR. Do not merge.**

---

## Self-Review Notes

**Spec coverage:** three holes → Tasks 4 and 5. Sweep → Task 3, with its findings consumed in Tasks 5 and 7. Bench → Tasks 1, 2, 6. Checklist → Task 7. Baseline-before-fix ordering → enforced by the task order and by Task 1 Step 7's stop condition. PR plus QA script → Task 7 Step 7.

**Known imprecision, flagged rather than papered over:** three steps say to match the surrounding file's existing style rather than quoting it exactly (Task 4 Step 6's factory names, Task 5 Step 4's mock-reading form, Task 4 Step 1's existing test). Those files were mapped, not read line by line, and inventing an exact quote for them would be a fabrication. Each of those steps names the file and what to look for.

---

## Baseline (before any fix)

Recorded 29 July 2026, against unchanged code at commit `7427ec4` (the bench itself,
no behavior touched). 22 cases x 5 runs = 110 model calls.

Note on the count: this plan's prose above says 21 cases; the case blocks it
specifies literally contain 22 (ten must-recognize, nine must-stay-quiet, three
ambiguous). The data is the authority, so 22 is what was built and measured.

```
must-recognize:  26/50 runs,  5/10 cases clean
must-stay-quiet: 45/45 runs,  9/9  cases clean
ambiguous:        0/15 runs,  0/3  cases clean  (no bar, watched for drift)
```

Failing must-recognize cases:

| Case | Score | Failure |
|---|---|---|
| `bare-ask-after-move` | 0/5 | expected change, got none |
| `bare-ask-one-plan` | 0/5 | expected change, got none |
| `bare-ask-no-plans` | 0/5 | expected change, got none |
| `reschedule-word` | 1/5 | expected change, got none (x4) |
| `bare-ask-long-history` | 0/5 | expected change, got none |

Clean must-recognize cases at baseline: `indirect-push-later`, `correction-names-plan`,
`follow-up-bare-hour`, `put-it-back`, `venue-ask-two-plans` (all 5/5).

Ambiguous cases, recorded for drift only, all leaning to silence at baseline:
`might-be-late-implies-move` 0/5, `group-grumble` 0/5, `referent-past-the-window` 0/5.

**What the baseline says.** Every bare ask that names no field dies, and it dies on
every run, which matches the deterministic guard in Task 4 rather than model variance.
The asks that do name something (a correction, a follow-up hour, a revert with a prior
time in the window, a venue ask) all survive today. The stay-quiet bucket is perfect,
so it has the whole 45/45 to lose and nothing to gain.

---

## After (post-fix)

Recorded 29 July 2026, after all three fixes, at commit `97d2b15`. Same 22 cases,
same 5 runs, same one-hour window as the baseline.

```
                  BASELINE                   AFTER
must-recognize:   26/50 runs,  5/10 clean    50/50 runs, 10/10 clean
must-stay-quiet:  45/45 runs,  9/9  clean    45/45 runs,  9/9  clean
ambiguous:         0/15 runs,  0/3  clean     5/15 runs,  1/3  clean
```

**The three questions the plan asked, answered in order.**

1. **Did `bare-ask-after-move` go from failing to 5/5?** Yes. 0/5 to 5/5, and 15/15 on
   a confirmation run. Every other bare-ask case moved the same way:
   `bare-ask-one-plan` 0/5 to 5/5, `bare-ask-no-plans` 0/5 to 5/5, `reschedule-word`
   1/5 to 5/5, `bare-ask-long-history` 0/5 to 5/5.
2. **Did must-stay-quiet hold?** Yes, at 45/45, unchanged. Not one message moved from
   silence to a reply. The three sharpest probes were re-run at 15 runs each and each
   came back 15/15: `reaction-to-orbit-move`, `move-on-topic`, `info-question`.
3. **Did anything in must-recognize get worse?** No. The five cases clean at baseline
   are still clean; the five failing ones are now clean.

**Nothing is below its bar.** Both barred buckets are at 100% of runs.

**The ambiguous bucket moved, which is the drift this slice bought.** One of the three
changed sides: `referent-past-the-window` went 0/5 to 5/5, meaning a bare ask whose
referent has been trimmed out of the window now gets a which-plan question instead of
silence. That is the intended direction. The other two, `might-be-late-implies-move`
("I might be late again, 8 is rough") and `group-grumble` ("nobody really likes 8 do
they"), still classify as nothing on all five runs. Commentary that stops short of
asking stayed on the quiet side of the line.

**What these numbers cannot claim.** Twenty-two cases at five runs measures twenty-two
cases. The confirmation runs at fifteen raise confidence on four of them and nothing
else. This is a floor that should keep rising, not proof that recognition is correct in
general. The stay-quiet bucket in particular is a 45-run sample of a behavior that has
to hold across every message a real group sends.
