# Pending Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A collapsible strip on the group home where a member sees the open idea gauges and open time-change proposals still waiting on their answer, answers them in place with the exact chips the feed already uses, and sees the items they've said yes to.

**Architecture:** A pure derivation module (`src/lib/pending/derive.ts`) turns the rows page.tsx already fetches (`findLiveGauges`, `findLiveProposals`) into a viewer-personal DTO; nothing new is stored and no new queries run. One new client component (`PendingStrip`) renders the strip and panel, reusing `GaugeChips` and `GroupProposalChips` verbatim so votes hit the same server actions and the same tallies as chat. The third yes from the panel promotes with zero new code because `gaugeVoteAction` already promotes on IN.

**Tech Stack:** Next.js 16 (server component page + client islands), Prisma 7 (read-only here), Vitest with per-file jsdom pragma + @testing-library/react, inline styles on CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-10-pending-surface-design.md` (including the 10 Aug postscript). Design source: `docs/design/pending-surface-handoff/` (README is the measurement narrative; `pending-surface.css` is the measurement source of truth).

## Global Constraints

- No model calls anywhere in this slice. No new Prisma models, columns, or migrations. No new env vars.
- Nothing new is stored: open gauge = `event === null` AND `isGaugeLive(...)`; open GROUP proposal = `findLiveProposals` result with `kind === "GROUP"`. Reuse those definitions; never re-derive.
- Chips are reused verbatim: do not restyle or fork `GaugeChips` / `GroupProposalChips`. The only permitted change to them is the additive optional `onAnswered` prop (Task 4).
- Token mapping (spec postscript, decided 10 Aug): handoff `--surface-base` → `var(--surface-page)`, `--hairline` → `var(--border-subtle)`, `--text-faint` and `--placeholder` → `var(--text-placeholder)`, `--text-primary/secondary` map to same names. **Do not add new tokens to globals.css.** Do not use teal or lime anywhere in this region.
- No venue anywhere on rows (spec postscript). Standing-yes holds pending things only, never events.
- Type tokens only (`--type-body/meta/label/eyebrow`), nothing below eyebrow. Layout grows with content, nothing clips; chips and metadata wrap.
- Orbit copy rules: plain and warm, soft declines, no em dashes, no exclamation marks. The caught-up copy is fixed verbatim in Task 6; do not rephrase it.
- Weekdays are three-letter (`formatWeekdayShort`).
- Tests: vitest, `npm test`; component tests need `// @vitest-environment jsdom` as line 1 and manual `afterEach(cleanup)`; no jest-dom matchers exist, assert with `toBeDefined()`/`toBeNull()`/attribute reads. Every test is written first and shown failing before implementation. The suite must stay green from an empty database (pure-function tests here need no DB).
- Suite baseline at slice start: **41 files / 638 tests, all passing, zero skips** (recorded 10 Aug 2026, before any code). Task 1 writes this into build-notes §11; the PR reports before/after.
- Never point anything at production. `npm run db:which` before any staging-script run; it must print the dev-test ref `pxbewardwvoyqqcvogel`.
- Commit after every green test cycle. Work in place on `feat/pending-surface`; no worktrees.

**One recorded deviation from the handoff's literal content (carry into build-notes §11):** the handoff draws counts-only tallies ("3 in · 1 next time · 4 waiting"). We reuse the shipped tally grammar instead: `buildTallyLine` for gauges and `buildProposalTallyLine` for proposals, the same strings the feed shows. One tally grammar product-wide, already member-filtered and tested; the handoff predates those builders. The "N waiting" segment is deliberately dropped with it (the feed's recorded stance: non-voters are noise the chips imply).

---

### Task 1: Record the suite baseline in the decision record

**Files:**
- Modify: `docs/build-notes.md` (§11, append at the end)

**Interfaces:**
- Consumes: nothing.
- Produces: the baseline entry later tasks' PR text cites.

- [ ] **Step 1: Cross-check the previous slice's finishing number.** Read the answer-seam entry at the end of `docs/build-notes.md` §11 and find its finishing suite count. If it does not say 41 files / 638 tests (or does not state a count), do not silently reconcile: note the mismatch in the new entry's text exactly as found.

- [ ] **Step 2: Append the baseline paragraph** at the end of §11 (append-only; touch nothing above it):

```markdown
### Pending surface: slice start (10 August 2026)

Baseline before any code on `feat/pending-surface`: `npm test` → 41 files, 638 tests, all
passing, zero skipped. No pre-existing failures to carry. [State here whether this matches the
answer-seam entry's finishing number, and quote that number.] Spec and design handoff are already
on the branch (docs only). The slice makes no model calls, so the recognition bench is untouched;
its numbers are not this slice's numbers.
```

- [ ] **Step 3: Commit**

```bash
git add docs/build-notes.md
git commit -m "Record the pending-surface suite baseline before any code"
```

---

### Task 2: findLiveGauges carries the idea's proposer

The panel's kind line ("New idea · from Maya") needs the source message's author. `findLiveGauges` includes votes but not the source message today.

**Files:**
- Modify: `src/lib/gauges/read.ts` (the `LiveGauge` type at :11-13 and the include at :38-52)
- Test: extend the existing test file for `findLiveGauges` (look in `src/lib/gauges/__tests__/`; find it with `grep -rl findLiveGauges src --include='*.test.ts'` if named unexpectedly). Mirror that file's existing fixture helpers exactly; the code below shows the assertions, not the fixture style.

**Interfaces:**
- Consumes: Prisma `Gauge.sourceMessage` relation (`Message` with `author: User | null`; null author means Orbit spoke, and a null `sourceMessageId` means an Orbit guess gauge).
- Produces: `LiveGauge` gains `sourceMessage: (Message & { author: User | null }) | null`. Task 3 reads `gauge.sourceMessage?.author?.name ?? null`.

- [ ] **Step 1: Write the failing test** (adapt fixture creation to the file's existing helpers):

```ts
it("includes the source message author so the surface can say who floated it", async () => {
  // fixture: group + member "Maya" + a gauge created from Maya's message (this file
  // already builds exactly this shape for its live-gauge cases; reuse those helpers)
  const gauges = await findLiveGauges(group.id, now)
  expect(gauges[0].sourceMessage?.author?.name).toBe("Maya")
})

it("returns a null source message for an Orbit guess gauge", async () => {
  // fixture: a gauge row with sourceMessageId null (the retry-guess shape)
  const gauges = await findLiveGauges(group.id, now)
  expect(gauges[0].sourceMessage).toBeNull()
})
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/lib/gauges` — expected: TypeScript error / property undefined, because `sourceMessage` is not included.

- [ ] **Step 3: Implement.** In `read.ts`, extend the type and the include:

```ts
export type LiveGauge = Gauge & {
  votes: (GaugeVote & { user: User })[]
  sourceMessage: (Message & { author: User | null }) | null
}
```

and in the `findMany` include block add:

```ts
sourceMessage: { include: { author: true } },
```

(`Message` and `User` come from `@prisma/client`, already imported or add to the existing import.)

- [ ] **Step 4: Run the full suite.** `npm test` — expected: all green (the feed path ignores the new field; nothing else narrows the type).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gauges/read.ts src/lib/gauges/__tests__/
git commit -m "Give findLiveGauges the source author for the pending surface's kind line"
```

---

### Task 3: The pending-set derivation, pure and DB-free

**Files:**
- Create: `src/lib/pending/derive.ts`
- Test: `src/lib/pending/__tests__/derive.test.ts`

**Interfaces:**
- Consumes: `LiveGauge` (Task 2 shape) and `LiveProposal` from `@/lib/proposals/read`; `sparkStartInstant`, `chipLabels`, `buildTallyLine`, `isGaugeLive` NOT needed here (inputs are already live); `formatTimeLocalLabel` from `@/lib/orbit/spark-copy`; `proposalChipLabels`, `buildProposalTallyLine` from `@/lib/orbit/change-copy`; `oneMoreClearsIt` from `@/lib/proposals/consensus`; `formatWeekdayShort`, `formatTime` from `@/lib/events/format`; types `FeedGauge` from `@/app/groups/[id]/GaugeChips` and `FeedGroupProposal` from `@/app/groups/[id]/GroupProposalChips` (type-only imports).
- Produces (Task 5 and Task 6 build against these exact names):

```ts
export interface PendingGaugeItem {
  kind: "gauge"
  key: string          // gauge id
  kindLine: string     // "New idea · from Maya", or "New idea" when no source author
  title: string        // gauge.activity, the member's own words, never rewritten
  whenLine: string     // "Sat 10am"; "Sat" when proposedTime is null
  sortMs: number       // sparkStartInstant(...).getTime()
  chips: FeedGauge
}
export interface PendingProposalItem {
  kind: "proposal"
  key: string          // proposal id
  kindLine: string     // "Time change · from Sam"
  title: string        // proposal.event.title
  nowLabel: string     // "Mon 8am"  (weekday short + formatTime of priorStartsAt)
  newLabel: string     // "Mon 9am"  (weekday short + formatTime of proposedStartsAt)
  sortMs: number       // proposal.event.startsAt.getTime()
  chips: FeedGroupProposal
}
export type PendingItem = PendingGaugeItem | PendingProposalItem
export interface PendingData {
  waiting: PendingItem[]     // viewerAnswer null, soonest first
  standingYes: PendingItem[] // gauge IN / proposal YES, soonest first
}
export interface PendingInputs {
  liveGauges: LiveGauge[]
  liveProposals: LiveProposal[]   // caller passes ALL; derive filters kind === "GROUP"
  viewerId: string
  memberIds: Set<string>
  memberCount: number
  timeZone: string
}
export function derivePending(input: PendingInputs): PendingData
```

Behavior locked by the spec: gauge OUT / NOT_THAT_DAY and proposal KEEP are excluded entirely; one item per gauge (inputs are gauge rows, so no message-keyed duplication can occur); tally and label composition must exactly mirror page.tsx's feed builders (member-filtered votes into the tally, viewer's answer read from unfiltered votes).

- [ ] **Step 1: Write the failing tests.** Fixtures are plain objects cast to the row types; no DB. Build a tiny fixture factory in the test file:

```ts
import { describe, expect, it } from "vitest"
import { derivePending } from "@/lib/pending/derive"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"

const TZ = "America/Chicago"
const VIEWER = "user-viewer"
const MEMBERS = new Set([VIEWER, "user-maya", "user-jesse", "user-sam"])

function gauge(over: Partial<LiveGauge> = {}): LiveGauge {
  return {
    id: "g1", groupId: "grp", sourceMessageId: "m1", orbitMessageId: "om1",
    activity: "bouldering at the new east side gym",
    proposedDate: new Date("2026-08-15T05:00:00.000Z"), // Sat local midnight-ish
    proposedTime: "10:00", bumpMessageId: null, closureMessageId: null,
    retryAskMessageId: null, retryGuessOfGaugeId: null,
    createdAt: new Date("2026-08-10T15:00:00.000Z"),
    votes: [],
    sourceMessage: { author: { name: "Maya" } },
    ...over,
  } as unknown as LiveGauge
}

function vote(userId: string, answer: string, name = userId) {
  return { userId, answer, user: { id: userId, name } } as LiveGauge["votes"][number]
}
// analogous proposal(over) factory: kind "GROUP", event { title: "Monday morning climb",
// startsAt, rsvps: [] }, priorStartsAt, proposedStartsAt, asker { name: "Sam" }, votes: []

describe("derivePending", () => {
  it("puts an unanswered gauge in waiting with kind line, title, when line", () => {
    const out = derivePending({ liveGauges: [gauge()], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting).toHaveLength(1)
    const item = out.waiting[0]
    expect(item.kind).toBe("gauge")
    expect(item.kindLine).toBe("New idea · from Maya")
    expect(item.title).toBe("bouldering at the new east side gym")
    expect(item.whenLine).toBe("Sat 10am")
  })

  it("drops the from-segment for an Orbit guess gauge", () => {
    const out = derivePending({ liveGauges: [gauge({ sourceMessageId: null, sourceMessage: null } as never)],
      liveProposals: [], viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].kindLine).toBe("New idea")
  })

  it("a viewer IN vote moves the gauge to standingYes; OUT and NOT_THAT_DAY exclude it", () => {
    const inG = gauge({ id: "g-in", votes: [vote(VIEWER, "IN")] } as never)
    const outG = gauge({ id: "g-out", votes: [vote(VIEWER, "OUT")] } as never)
    const dayG = gauge({ id: "g-day", votes: [vote(VIEWER, "NOT_THAT_DAY")] } as never)
    const out = derivePending({ liveGauges: [inG, outG, dayG], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting).toHaveLength(0)
    expect(out.standingYes.map((i) => i.key)).toEqual(["g-in"])
  })

  it("tally line matches the feed's grammar: member-filtered names via buildTallyLine", () => {
    const g = gauge({ votes: [vote("user-maya", "IN", "Maya"), vote("outsider", "IN", "Ghost")] } as never)
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].chips.tallyLine).toContain("Maya")
    expect(out.waiting[0].chips.tallyLine).not.toContain("Ghost")
  })

  it("viewer answer is read from unfiltered votes, mirroring the feed", () => {
    const g = gauge({ votes: [vote(VIEWER, "IN")] } as never)
    const nonMemberViewer = "stranger-with-session"
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: new Set(["user-maya"]), memberCount: 1, timeZone: TZ })
    expect(out.standingYes).toHaveLength(1) // split keys off viewer's own row even if not member-listed
  })

  it("GROUP proposals split by YES/KEEP/none; VERIFY proposals never appear", () => {
    const waiting = proposal({ id: "p-open" })
    const yes = proposal({ id: "p-yes", votes: [pvote(VIEWER, "YES")] })
    const keep = proposal({ id: "p-keep", votes: [pvote(VIEWER, "KEEP")] })
    const verify = proposal({ id: "p-verify", kind: "VERIFY" })
    const out = derivePending({ liveGauges: [], liveProposals: [waiting, yes, keep, verify],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting.map((i) => i.key)).toEqual(["p-open"])
    expect(out.standingYes.map((i) => i.key)).toEqual(["p-yes"])
  })

  it("proposal rows carry now/new labels and the feed's proposal tally", () => {
    const p = proposal({}) // priorStartsAt Mon 8am local, proposedStartsAt Mon 9am local
    const out = derivePending({ liveGauges: [], liveProposals: [p],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    const item = out.waiting[0]
    expect(item.kind).toBe("proposal")
    expect(item.kindLine).toBe("Time change · from Sam")
    expect(item.nowLabel).toBe("Mon 8am")
    expect(item.newLabel).toBe("Mon 9am")
  })

  it("both groups sort soonest first across kinds", () => {
    const early = gauge({ id: "g-early", proposedDate: new Date("2026-08-12T05:00:00.000Z") } as never)
    const late = proposal({ id: "p-late" /* event.startsAt 2026-08-20 */ })
    const mid = gauge({ id: "g-mid", proposedDate: new Date("2026-08-15T05:00:00.000Z") } as never)
    const out = derivePending({ liveGauges: [mid, early], liveProposals: [late],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting.map((i) => i.key)).toEqual(["g-early", "g-mid", "p-late"])
  })

  it("whenLine falls back to the weekday alone when proposedTime is null", () => {
    const g = gauge({ proposedTime: null } as never)
    const out = derivePending({ liveGauges: [g], liveProposals: [],
      viewerId: VIEWER, memberIds: MEMBERS, memberCount: 4, timeZone: TZ })
    expect(out.waiting[0].whenLine).toBe("Sat")
  })
})
```

Fill in the `proposal()`/`pvote()` factories analogously to `gauge()`/`vote()`; model the event with `rsvps: []` and add one test where an rsvp IN from a member feeds `oneMoreClearsIt` through to the tally (assert the tally string contains "one more" when two member YES votes exist and the threshold is 3).

- [ ] **Step 2: Run to verify failure.** `npm test -- src/lib/pending` — expected: cannot resolve `@/lib/pending/derive`.

- [ ] **Step 3: Implement `derive.ts`.** Shape (mirror page.tsx:109-170's composition exactly; that file is the reference for the tally/label calls):

```ts
// src/lib/pending/derive.ts
// The pending surface's single derivation: rows in, viewer-personal DTO out.
// Pure on purpose: page.tsx already fetched these rows for the feed, and the
// strip must be a second window onto the same rows, never a second query.
import type { GaugeAnswer, ProposalVoteAnswer } from "@prisma/client"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"
import type { FeedGauge } from "@/app/groups/[id]/GaugeChips"
import type { FeedGroupProposal } from "@/app/groups/[id]/GroupProposalChips"
import { buildTallyLine, chipLabels, formatTimeLocalLabel, sparkStartInstant } from "@/lib/orbit/spark-copy"
import { buildProposalTallyLine, proposalChipLabels } from "@/lib/orbit/change-copy"
import { oneMoreClearsIt } from "@/lib/proposals/consensus"
import { formatWeekdayShort, formatTime } from "@/lib/events/format"

/* …types exactly as the Interfaces block above… */

export function derivePending(input: PendingInputs): PendingData {
  const waiting: PendingItem[] = []
  const standingYes: PendingItem[] = []

  for (const g of input.liveGauges) {
    const viewerAnswer = g.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    if (viewerAnswer === "OUT" || viewerAnswer === "NOT_THAT_DAY") continue
    const memberVotes = g.votes.filter((v) => input.memberIds.has(v.userId))
    const names = new Map(memberVotes.map((v) => [v.userId, v.user.name]))
    const from = g.sourceMessage?.author?.name
    const item: PendingGaugeItem = {
      kind: "gauge",
      key: g.id,
      kindLine: from ? `New idea · from ${from}` : "New idea",
      title: g.activity,
      whenLine: g.proposedTime
        ? `${formatWeekdayShort(g.proposedDate, input.timeZone)} ${formatTimeLocalLabel(g.proposedTime)}`
        : formatWeekdayShort(g.proposedDate, input.timeZone),
      sortMs: sparkStartInstant(g.proposedDate, g.proposedTime, input.timeZone).getTime(),
      chips: {
        id: g.id,
        orbitMessageId: g.orbitMessageId,
        tallyLine: buildTallyLine(memberVotes, names),
        labels: chipLabels(g.proposedDate, input.timeZone),
        viewerAnswer,
      },
    }
    ;(viewerAnswer === "IN" ? standingYes : waiting).push(item)
  }

  for (const p of input.liveProposals) {
    if (p.kind !== "GROUP") continue
    const viewerAnswer = p.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    if (viewerAnswer === "KEEP") continue
    const memberVotes = p.votes.filter((v) => input.memberIds.has(v.userId))
    const yesVoters = memberVotes.filter((v) => v.answer === "YES")
    const consensus = {
      yesVoterIds: yesVoters.map((v) => v.userId),
      keepVoterIds: memberVotes.filter((v) => v.answer === "KEEP").map((v) => v.userId),
      currentInUserIds: p.event.rsvps
        .filter((r) => r.status === "IN" && input.memberIds.has(r.userId))
        .map((r) => r.userId),
      memberCount: input.memberCount,
    }
    const item: PendingProposalItem = {
      kind: "proposal",
      key: p.id,
      kindLine: `Time change · from ${p.asker.name}`,
      title: p.event.title,
      nowLabel: `${formatWeekdayShort(p.priorStartsAt, input.timeZone)} ${formatTime(p.priorStartsAt, input.timeZone)}`,
      newLabel: `${formatWeekdayShort(p.proposedStartsAt, input.timeZone)} ${formatTime(p.proposedStartsAt, input.timeZone)}`,
      sortMs: p.event.startsAt.getTime(),
      chips: {
        id: p.id,
        orbitMessageId: p.orbitMessageId,
        labels: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, input.timeZone),
        tallyLine: buildProposalTallyLine(
          yesVoters.map((v) => v.user.name),
          consensus.keepVoterIds.length,
          oneMoreClearsIt(consensus)
        ),
        viewerAnswer,
      },
    }
    ;(viewerAnswer === "YES" ? standingYes : waiting).push(item)
  }

  waiting.sort((a, b) => a.sortMs - b.sortMs)
  standingYes.sort((a, b) => a.sortMs - b.sortMs)
  return { waiting, standingYes }
}
```

If `formatTime`'s output format differs from "8am" (check `src/lib/events/format.ts:77` before writing), match whatever it actually produces in the test expectations; the rule is reuse, not invention.

- [ ] **Step 4: Run to verify pass.** `npm test -- src/lib/pending` then `npm test` full. Expected: all green. State in the task report why the tests could have failed (they pinned exact strings and orderings before the implementation existed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pending/
git commit -m "Derive the viewer-personal pending set from the feed's own rows"
```

---

### Task 4: Chips learn to report an answer upward (additive, optional)

The panel needs to know when its last waiting row was answered with a decline, to show the caught-up note. The chips own the action call, so they get an optional callback. The feed passes nothing and is untouched in behavior.

**Files:**
- Modify: `src/app/groups/[id]/GaugeChips.tsx` (props at :47-49, `handle` at ~:55-66)
- Modify: `src/app/groups/[id]/GroupProposalChips.tsx` (props at :33-35, its `handle`)
- Test: extend `src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx`; create `src/app/groups/[id]/__tests__/GaugeChips.test.tsx` if it does not exist (mirror GroupProposalChips.test.tsx's structure: jsdom pragma, `vi.mock` of the action module, `afterEach(cleanup)`).

**Interfaces:**
- Consumes: nothing new.
- Produces: `GaugeChips` props become `{ gauge: FeedGauge; onAnswered?: (answer: GaugeAnswer) => void }`; `GroupProposalChips` props become `{ proposal: FeedGroupProposal; onAnswered?: (answer: ProposalVoteAnswer) => void }`. The callback fires only after the action resolves **without** an error string. Task 6 consumes these.

- [ ] **Step 1: Write the failing tests** (shown for GroupProposalChips; mirror for GaugeChips with answers `IN`/`OUT`):

```tsx
it("reports the answer upward after a successful vote", async () => {
  const onAnswered = vi.fn()
  render(<GroupProposalChips proposal={PROPOSAL} onAnswered={onAnswered} />)
  fireEvent.click(screen.getByText("9am works"))
  await waitFor(() => expect(onAnswered).toHaveBeenCalledWith("YES"))
})

it("does not report upward when the action returns an error", async () => {
  const onAnswered = vi.fn()
  voteMock.mockResolvedValueOnce({ errors: { general: "That one's settled." } })
  render(<GroupProposalChips proposal={PROPOSAL} onAnswered={onAnswered} />)
  fireEvent.click(screen.getByText("9am works"))
  await waitFor(() => expect(screen.getByText("That one's settled.")).toBeDefined())
  expect(onAnswered).not.toHaveBeenCalled()
})
```

(Use the exact chip label text from the test file's existing `PROPOSAL` fixture; "9am works" is illustrative.)

- [ ] **Step 2: Run to verify failure.** `npm test -- GroupProposalChips GaugeChips` — expected: FAIL, unknown prop / callback never called.

- [ ] **Step 3: Implement.** In each component's `handle`, after the existing error check:

```ts
const result = await proposalVoteAction({}, formData)
if (result?.errors?.general) {
  setErrorMsg(result.errors.general)
} else {
  onAnswered?.(next)
}
```

- [ ] **Step 4: Run the full suite.** `npm test` — expected: green, including all pre-existing chip tests (the prop is optional; no call sites change).

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/GaugeChips.tsx" "src/app/groups/[id]/GroupProposalChips.tsx" "src/app/groups/[id]/__tests__/"
git commit -m "Let chip rows report a settled answer to whoever rendered them"
```

---

### Task 5: Extract OrbitBubble so the panel can speak in Orbit's voice

The caught-up note must render with the same bubble as the feed, and the bubble is currently inline JSX in `MessageFeed.tsx:141-183`. Extract, don't duplicate.

**Files:**
- Create: `src/components/OrbitBubble.tsx`
- Modify: `src/app/groups/[id]/MessageFeed.tsx` (:141-183, replace the avatar+bubble JSX with the component; the tally and chips that render around it stay where they are)
- Test: `src/components/__tests__/OrbitBubble.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `OrbitBubble({ children }: { children: React.ReactNode })` — renders the 28×28 lime avatar circle (`aria-label="Orbit"`, letter "O") beside a bubble `div` (`backgroundColor: "var(--surface-orbit)"`, `borderRadius: "4px 16px 16px 16px"`, `padding: "0.5rem 0.75rem"`, `maxWidth: "80%"`); `children` render inside the bubble. Copy the exact styles from MessageFeed:141-183 verbatim; this task moves pixels, it must not change them.

- [ ] **Step 1: Write the failing test:**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { OrbitBubble } from "@/components/OrbitBubble"

afterEach(cleanup)

describe("OrbitBubble", () => {
  it("renders the Orbit avatar and the children inside the bubble", () => {
    render(<OrbitBubble><p>hello group</p></OrbitBubble>)
    expect(screen.getByLabelText("Orbit")).toBeDefined()
    expect(screen.getByText("hello group")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify failure.** `npm test -- OrbitBubble` — expected: cannot resolve module.

- [ ] **Step 3: Implement** by cutting the avatar+bubble JSX out of MessageFeed into the new component and rendering `<OrbitBubble>` in its old place, passing the message `<p>` (and the in-bubble `GaugeTally`, which MessageFeed renders inside the bubble today) as children.

- [ ] **Step 4: Run the full suite** `npm test` — expected: green. Then visually confirm the feed is unchanged during Task 7's browser walkthrough (this task's change is covered there; note that in the commit).

- [ ] **Step 5: Commit**

```bash
git add src/components/OrbitBubble.tsx src/components/__tests__/OrbitBubble.test.tsx "src/app/groups/[id]/MessageFeed.tsx"
git commit -m "Extract Orbit's bubble into a shared component the panel can reuse"
```

---

### Task 6: PendingStrip, the strip and panel themselves

**Files:**
- Create: `src/app/groups/[id]/PendingStrip.tsx`
- Test: `src/app/groups/[id]/__tests__/PendingStrip.test.tsx`

**Interfaces:**
- Consumes: `PendingData`, `PendingItem` from `@/lib/pending/derive`; `GaugeChips` + `GroupProposalChips` (with Task 4's `onAnswered`); `OrbitBubble` (Task 5); `Chevron` from `@/components/Chevron` if its API fits (it is 14×14 `direction: "left" | "right"` only, so instead render an inline chevron SVG rotated by state, matching the handoff's 18×18 down/up chevron).
- Produces: `PendingStrip({ pending }: { pending: PendingData })` — a `"use client"` component. Renders `null` when both groups are empty. Page.tsx (Task 7) renders it only for a session-holding viewer.

Layout and measurements come from `docs/design/pending-surface-handoff/pending-surface.css` with the Global Constraints token mapping. The load-bearing behaviors, each with a test:

1. **Nothing pending → nothing rendered.** Both arrays empty → `null`.
2. **Strip line.** Clock SVG (16×16, stroke `var(--text-secondary)`), then `--type-meta` text: bold `--text-primary` count + secondary label per segment, dot-separated: `2 waiting on you · 1 you're in on`. Second segment only when `standingYes.length > 0`; when `waiting` is empty but yeses exist, the line is just `1 you're in on`. Chevron right, pointing down closed / up open. The whole strip is a `<button>` (`aria-expanded`).
3. **Panel opens over, not into.** Wrapper `div` is `position: relative; flexShrink: 0`. Open state renders: a dim layer (`position: absolute; top: 100%; left: 0; right: 0; height: 100dvh; background: rgba(11,12,17,.74); zIndex: 20`) and the panel (`position: absolute; top: 100%; left: 0; right: 0; zIndex: 30; background: var(--surface-page); borderRadius: "0 0 16px 16px"; borderBottom: "1px solid var(--border-subtle)"; boxShadow: "0 22px 46px -14px rgba(0,0,0,.78)"; maxHeight: "calc(100dvh - 240px)"; overflowY: "auto"`). The dim layer has no click handler: tapping the strip header again is the only collapse control, per the handoff.
4. **Waiting rows.** Per item: kind line (`--type-eyebrow`, uppercase, `letterSpacing: ".14em"`, weight 700, `var(--text-placeholder)`), title (`--type-body`, weight 600, `var(--text-primary)`), then for gauges the when line (`--type-meta`, `var(--text-secondary)`) and for proposals the shift line (`NOW` eyebrow label + old label in `var(--text-placeholder)` with `textDecoration: "line-through"`, a 15×15 arrow SVG, `NEW` label + new label bold `var(--text-primary)`), then `<GaugeChips gauge={item.chips} onAnswered={…}/>` or `<GroupProposalChips proposal={item.chips} onAnswered={…}/>` (which render their own tally + chips). Rows: `padding: "10px 18px 11px"`, `borderTop: "1px solid var(--border-subtle)"`, flat, no card.
5. **Standing-yes rows** under a "You're in on" eyebrow group label: title at `--type-meta` weight 600 `var(--text-secondary)`, when line at `--type-label` `var(--text-placeholder)`, then a row with a 14×14 check SVG + "You're in" (`--type-label`, weight 700, `var(--text-secondary)`) and a right-aligned "Change" text button (`--type-label`, weight 600, underlined, never teal). Tapping Change (or the row) toggles the item's chip component below it, so the standing answer can be flipped in place.
6. **Caught-up note.** Component state `caughtUp: boolean`, set true when an `onAnswered` callback fires with a decline (`OUT`, `NOT_THAT_DAY`, or `KEEP`) from the **last** remaining waiting row (`waiting.length === 1` at fire time). While `caughtUp` and `waiting` is empty, the panel body renders `<OrbitBubble><p>…</p></OrbitBubble>` with this copy, verbatim, and the strip label reads `All caught up` with no counts: `Next time it is. That was the last thing waiting on you, so you're all set. I'll say something when the group floats a new idea.` Standing yeses still render below the note if any exist. A yes on the last row does NOT set `caughtUp` (the item just moves down on the next render).
7. **Quiet.** No entrance animation, no attention badge, nothing pulses. (The 180ms fade in the handoff is a nice-to-have; skip it rather than reach for a animation library. Note the skip in the PR.)

- [ ] **Step 1: Write the failing tests.** Mock both action modules (the chips inside will call them); build `PendingData` fixtures from plain objects:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const gaugeVoteMock = vi.fn(async () => ({}))
vi.mock("@/app/actions/gauge-vote", () => ({
  gaugeVoteAction: (...a: unknown[]) => gaugeVoteMock(...a),
}))
const proposalVoteMock = vi.fn(async () => ({}))
vi.mock("@/app/actions/proposal-vote", () => ({
  proposalVoteAction: (...a: unknown[]) => proposalVoteMock(...a),
}))

import { PendingStrip } from "../PendingStrip"
import type { PendingData, PendingGaugeItem, PendingProposalItem } from "@/lib/pending/derive"

afterEach(() => { cleanup(); gaugeVoteMock.mockClear(); proposalVoteMock.mockClear() })

const GAUGE_ITEM: PendingGaugeItem = {
  kind: "gauge", key: "g1", kindLine: "New idea · from Maya",
  title: "bouldering at the new east side gym", whenLine: "Sat 10am", sortMs: 1,
  chips: { id: "g1", orbitMessageId: "om1", tallyLine: "Maya is in",
    labels: { in: "✋ I'm in", out: "🙏 Next time", notThatDay: "📅 Yes, can't Sat" },
    viewerAnswer: null },
}
const PROPOSAL_ITEM: PendingProposalItem = {
  kind: "proposal", key: "p1", kindLine: "Time change · from Sam",
  title: "Monday morning climb", nowLabel: "Mon 8am", newLabel: "Mon 9am", sortMs: 2,
  chips: { id: "p1", orbitMessageId: "om2", labels: { yes: "9am works", keep: "Keep 8am" },
    tallyLine: "", viewerAnswer: null },
}
const YES_ITEM: PendingGaugeItem = { ...GAUGE_ITEM, key: "g2", title: "friday beers",
  whenLine: "Fri 7pm", chips: { ...GAUGE_ITEM.chips, id: "g2", viewerAnswer: "IN" } }

function data(over: Partial<PendingData> = {}): PendingData {
  return { waiting: [GAUGE_ITEM, PROPOSAL_ITEM], standingYes: [YES_ITEM], ...over }
}

describe("PendingStrip", () => {
  it("renders nothing when nothing is pending", () => {
    const { container } = render(<PendingStrip pending={{ waiting: [], standingYes: [] }} />)
    expect(container.firstChild).toBeNull()
  })

  it("composes the count line, second segment only when yeses exist", () => {
    render(<PendingStrip pending={data()} />)
    expect(screen.getByText("waiting on you")).toBeDefined()
    expect(screen.getByText("you're in on")).toBeDefined()
    cleanup()
    render(<PendingStrip pending={data({ standingYes: [] })} />)
    expect(screen.queryByText("you're in on")).toBeNull()
  })

  it("panel is closed until the strip is tapped, then rows render with their chips", () => {
    render(<PendingStrip pending={data()} />)
    expect(screen.queryByText("New idea · from Maya")).toBeNull()
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("New idea · from Maya")).toBeDefined()
    expect(screen.getByText("bouldering at the new east side gym")).toBeDefined()
    expect(screen.getByText("✋ I'm in")).toBeDefined()
    expect(screen.getByText("Mon 8am")).toBeDefined()
    expect(screen.getByText("9am works")).toBeDefined()
  })

  it("standing-yes row steps down and reveals chips on Change", () => {
    render(<PendingStrip pending={data()} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("You're in on")).toBeDefined()
    expect(screen.getByText("friday beers")).toBeDefined()
    expect(screen.queryByText("✓ ✋ I'm in")).toBeNull()
    fireEvent.click(screen.getByText("Change"))
    expect(screen.getByText(/I'm in/)).toBeDefined()
  })

  it("a decline on the last waiting row shows the caught-up note verbatim", async () => {
    render(<PendingStrip pending={data({ waiting: [GAUGE_ITEM] })} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByText("🙏 Next time"))
    await waitFor(() =>
      expect(screen.getByText(
        "Next time it is. That was the last thing waiting on you, so you're all set. I'll say something when the group floats a new idea."
      )).toBeDefined()
    )
    expect(screen.getByText("All caught up")).toBeDefined()
  })

  it("a yes on the last waiting row does not trigger the caught-up note", async () => {
    render(<PendingStrip pending={data({ waiting: [GAUGE_ITEM] })} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByText("✋ I'm in"))
    await waitFor(() => expect(gaugeVoteMock).toHaveBeenCalled())
    expect(screen.queryByText("All caught up")).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure.** `npm test -- PendingStrip` — expected: cannot resolve `../PendingStrip`.

- [ ] **Step 3: Implement** per the numbered behaviors above. Structure sketch (inline styles throughout, matching the codebase):

```tsx
"use client"
export function PendingStrip({ pending }: { pending: PendingData }) {
  const [open, setOpen] = useState(false)
  const [caughtUp, setCaughtUp] = useState(false)
  const [changeOpenKey, setChangeOpenKey] = useState<string | null>(null)
  if (pending.waiting.length === 0 && pending.standingYes.length === 0 && !caughtUp) return null
  const handleAnswered = (answer: string) => {
    if (pending.waiting.length === 1 && answer !== "IN" && answer !== "YES") setCaughtUp(true)
  }
  /* strip <button aria-expanded={open}> …counts or "All caught up"… chevron */
  /* open && dim layer + panel: waiting rows (chips with onAnswered={handleAnswered}),
     caught-up OrbitBubble when caughtUp && waiting empty,
     "You're in on" group with Change-toggled chips */
}
```

Note on `caughtUp` vs fresh props: after the action's `revalidatePath`, the page re-renders and `waiting` shrinks server-side; `caughtUp` is client-session state layered on top, exactly as the spec's "brief caught-up note" intends. When `caughtUp` is true and props later arrive with a new waiting item, drop `caughtUp` (reset it in that render branch) so a new idea wins over an old goodbye.

- [ ] **Step 4: Run to verify pass.** `npm test -- PendingStrip`, then full `npm test`. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/PendingStrip.tsx" "src/app/groups/[id]/__tests__/PendingStrip.test.tsx"
git commit -m "Build the pending strip and panel over the feed's own chips"
```

---

### Task 7: Wire the strip into the group home, stage it, and walk it in a browser

**Files:**
- Modify: `src/app/groups/[id]/page.tsx` (insertion point: the sibling gap between the pinned-card `div` closing at :300 and the chat-section `div` opening at :306; also the imports)
- Create: `scripts/qa-stage-pending.ts` (model it on `scripts/qa-stage-answer.ts` — read that file first and follow its structure, group/member creation, and console output style)

**Interfaces:**
- Consumes: `derivePending` (Task 3), `PendingStrip` (Task 6), and page.tsx's existing `liveGauges` (:97), `liveProposals` (:135), `memberIds` (:103), `viewer` (:57), `group.timeZone`, `group.memberships.length`.
- Produces: the shipped surface.

- [ ] **Step 1: Wire the page.** After `memberIds` and both fetches exist:

```tsx
const pending = viewer
  ? derivePending({
      liveGauges,
      liveProposals,
      viewerId: viewer.id,
      memberIds,
      memberCount: group.memberships.length,
      timeZone: group.timeZone,
    })
  : null
```

and in the JSX gap between the card region and the chat section:

```tsx
{pending ? <PendingStrip pending={pending} /> : null}
```

`PendingStrip`'s own wrapper carries the 16px horizontal inset (`margin: "0 1rem"`) and hairline rules per the handoff; the page adds no styling. No `GroupHome` prop changes; `timeZone` stays un-threaded because derivation happens server-side in the page.

- [ ] **Step 2: Run the suite.** `npm test` — expected: green (the page has no direct tests; this is wiring).

- [ ] **Step 3: Write the staging script.** `scripts/qa-stage-pending.ts`, following `qa-stage-answer.ts`'s pattern exactly (its prisma client setup, its group/member helpers, its printed output). It must stage, in the dev-test DB: one group with four members; one upcoming event with the viewer's RSVP absent (so the card shows); one open gauge from a member ("bouldering at the new east side gym", next Saturday 10:00, one member IN vote, no viewer vote); one open GROUP proposal on the event (prior = event start, proposed = one hour later, one member YES); and a second open gauge the viewer has already answered IN (the standing yes). Print the group URL and which member session to use, matching the existing script's output style. Guard: the script must call the same db guard the existing staging scripts use (see how `qa-stage-answer.ts` protects itself; `npm run db:which` must print `pxbewardwvoyqqcvogel` before running).

- [ ] **Step 4: Stage and walk it.** `npx tsx scripts/qa-stage-pending.ts`, then the dev server via the browser preview (launch config `dev`), and verify against the handoff reference (`docs/design/pending-surface-handoff/pending-surface-design-reference.html`, servable via launch config `design-static`):
  1. Strip shows "2 waiting on you · 1 you're in on"; absent for a fresh session with no votes and nothing waiting? (No: a fresh session sees 2 waiting; absent only when the pending set is empty. Verify the empty case with a staged group holding no gauges.)
  2. Expand: both waiting rows render (kind lines, title, when/shift line, tallies, chips); standing-yes group below, stepped down.
  3. Tap "🙏 Next time" on one gauge: row leaves after refresh, chat tally unchanged elsewhere, no new chat message posted.
  4. Tap the proposal's yes chip: tally updates; same tally visible on the feed's copy of the chips.
  5. Flip the standing yes to "Next time" via Change: chips flip, item leaves on refresh.
  6. Third yes on a gauge from the panel (stage votes so the viewer's yes is third): event appears in the carousel, Orbit announces in the feed, gauge leaves the panel.
  7. Caught-up: answer the last waiting item with a decline; the note appears verbatim; collapse; strip reads counts or disappears appropriately.
  8. Feed regression: Orbit bubbles in the feed look unchanged (Task 5's extraction), chips in the feed still vote.
  Screenshot the strip, the open panel, and the caught-up state for the PR.

- [ ] **Step 5: Commit**

```bash
git add "src/app/groups/[id]/page.tsx" scripts/qa-stage-pending.ts
git commit -m "Wire the pending strip into the group home and stage its QA path"
```

---

### Task 8: Records — build-notes §11 entry and CLAUDE.md current-state

**Files:**
- Modify: `docs/build-notes.md` (§11, append a pending-surface entry after the Task 1 baseline paragraph)
- Modify: `CLAUDE.md` ("Where the build is": add the pending-surface paragraph; update the next-slice candidates line, since this slice was one of the three)

**Interfaces:**
- Consumes: everything above, plus the walkthrough evidence from Task 7.
- Produces: the slice's permanent record.

- [ ] **Step 1: Append the §11 entry.** It must record, in product language: what shipped (the strip, the panel, the three row kinds, the caught-up note); the decisions carried from the spec and its postscript (answer-in-place; gauges + proposals; the tailored-middle view; strip placement; no Orbit chat change; nothing stored; tokens mapped by role with the handoff palette registered for the polish pass; no venue on rows; standing-yes is pending-only); **the tally-grammar deviation from the handoff and why** (one grammar product-wide, the handoff predates the builders); the skipped 180ms transition; the suite numbers before (41 / 638) and after; and the two debts opened (stale-until-refresh counts, chip-only row types with the day-question rework named as successor).

- [ ] **Step 2: Update CLAUDE.md.** Rewrite the "Where the build is" pending-surface candidate into a shipped paragraph; move the settled decisions into the settled-and-not-open list with dates (10 Aug 2026, pending-surface slice); keep the remaining two candidates ("what's open?" questions and day-comment-on-a-live-gauge) as next-slice candidates.

- [ ] **Step 3: Run the suite one last time and record the after-number in the §11 entry.** `npm test` — the entry states before and after counts.

- [ ] **Step 4: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record the pending-surface slice in build-notes and the current-state section"
```

---

## Self-review notes (run at plan time)

- **Spec coverage:** strip states → Task 6; both item types → Tasks 3+6; tailored-middle split → Task 3; answer-in-place + shared tallies → chips reuse (Task 4/6) + actions untouched; third-yes promotion → zero code, verified Task 7 step 4.6; caught-up note → Task 6; empty-state absence → Task 6 test 1; no session → Task 7 wiring (`viewer ? … : null`); freshness posture → revalidatePath, unchanged; no Orbit chat change → no message-posting code anywhere in the plan; verification section → Tasks 1, 3, 6, 7; debts → recorded Task 8. Not-in-slice items: no task touches the day-question, endgame engine, or live refresh. ✓
- **Type consistency:** `PendingData/PendingItem/PendingGaugeItem/PendingProposalItem` defined once (Task 3), consumed by name in Tasks 6-7; `onAnswered` signature defined in Task 4, used in Task 6; `OrbitBubble({ children })` defined in Task 5, used in Task 6. ✓
- **Known softness, named rather than hidden:** exact fixture-helper shapes in Tasks 2 and 7 depend on existing files the implementer must read first (`read.test`-style DB fixtures, `qa-stage-answer.ts`); the plan pins the assertions and defers only the local idiom. `formatTime`'s exact output must be checked before Task 3's expectations are finalized (the plan says so inline).
