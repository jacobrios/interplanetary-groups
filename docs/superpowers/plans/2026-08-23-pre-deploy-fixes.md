# Pre-deploy Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pre-launch audit's three fix-before-deploy findings, the two postscript items nobody owned, the two never-run checks, and the CLAUDE.md claims the audit disproved, so that slice B can deploy from a clean main.

**Architecture:** Nine independent tasks against `feat/pre-deploy-fixes`. Task 1 is docs-only and runs first by standing rule (the always-loaded file must stop asserting things the audit disproved). Task 2 is the framework bump, second so every later task is written and tested against the version that ships. Tasks 3 and 4 are TDD code fixes. Tasks 5 to 7 add the product's own static assets and metadata. Tasks 8 and 9 are docs and a read. No task depends on another's code.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Supabase Postgres, Vitest, `sharp` (already present as a Next dependency) for one-off raster generation.

**Spec:** `docs/superpowers/specs/2026-08-23-pre-deploy-fixes-design.md`

## Global Constraints

- **Baseline: 92 files / 935 tests green, 71.4s.** Recorded on this branch before any code. Every task ends with the suite green. Report the number, never assert it without running.
- **`npm run db:which` must print `pxbewardwvoyqqcvogel` before anything that touches the database.** Production and dev-test are separate Supabase projects and must never be crossed.
- **Never run `npm run eval:detect` or `npm run eval:onboarding`.** They cost money and hit the network.
- **Never start a dev server for the owner.** Give him the command in a fenced `bash` block. Any QA URL uses the machine's LAN address read fresh, never `localhost`.
- **No em dashes or en dashes** in anything Orbit says (product-voice rule) or in anything written to the owner. Standard hyphens in compound words are fine.
- **Orbit's voice is plain and warm, roughly 7th-8th grade reading level.**
- **Teal (`--action`, #18bccb) marks an action that genuinely matters. Lime (`--lime`, #a4ef4e) is Orbit's brand and never an action.** Neither appears in this slice's new work except inside the mark itself.
- **Database-touching tests hit the real dev-test database (repo idiom).** Name fixtures with a `[TEST]` prefix and clean them up. Never call `reconcileScheduledEvents(now)` unscoped in a test; see the warning at the top of `src/lib/orbit/__tests__/reconcile.test.ts`.
- **Stay in the slice's lane.** The other 45 audit findings belong to the triage session. If you spot something, note it for the PR body; do not fix it.
- **A passing test is only evidence if it could have failed.** Every code task shows its test failing first.

---

### Task 1: Correct CLAUDE.md, and register the second-viewer gap

**Files:**
- Modify: `CLAUDE.md:17`, `CLAUDE.md:31`, `CLAUDE.md:41`, `CLAUDE.md:153`
- Modify: `docs/build-notes.md` §8 (append one entry)
- Test: none. Docs-only task.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read. Runs first because the file loads into every session, including the sessions that execute tasks 2 to 9.

**Context you need before editing.** `CLAUDE.md` is append-only in spirit: corrections are dated inline notes or `~~strikethrough~~` with a date and a pointer, never silent rewrites. Match the file's existing house style, which you can see all over its current-state section. Source for every correction below is `docs/audits/2026-08-22-pre-launch-audit.md`; read the cited finding before writing the amendment.

- [ ] **Step 1: Read the five claims and their contradicting findings**

Read these, in this order:
- `docs/audits/2026-08-22-pre-launch-audit.md`, the section headed `## 3. CLAUDE.md current-state claims nobody checked` (inside the completeness critic).
- The same file's `# Postscript, 23 Aug 2026: one finding the audit missed, found in conversation`.
- Findings 10 and 16 in the `### Queue` section.

- [ ] **Step 2: Correct the session-loss claim at `CLAUDE.md:153`**

The current text ends: "The known cost, carried on purpose: a member who loses their session meets the wall until email sign-in exists, and the invite link is their way back."

Replace that clause. The correction, in the file's voice:

```markdown
~~The known cost, carried on purpose: a member who loses their session meets the wall until email sign-in exists, and the invite link is their way back.~~ (Struck 23 Aug 2026, pre-deploy-fixes slice: that reading was too kind and it was wrong. Losing a session does not lock a member out, it duplicates them. They still have the link, they tap it, they have no session, so they join as a *second* member: the group holds two of them, their earlier answers belong to an identity nobody can reach, and every count is quietly wrong, in the one product whose whole claim is accurate attendance. Nobody sees an error, and one cache clear or one switch from phone to laptop is enough. This is the strongest argument for moving the email arc forward, and it is why **email sign-in is the slice immediately after the deploy**, by the owner's call, 23 Aug 2026. Reasoning in the audit's 23 Aug postscript.)
```

- [ ] **Step 3: Correct the current-members-only claim at `CLAUDE.md:41`**

The current text contains: "and every count and tally already reads current members only, so removal self-heals with no extra write."

Strike it and replace with the narrower true statement. Audit finding 10 establishes that removal deletes only the membership row, so old RSVP and gauge-vote rows survive; a rejoin through the same link makes them count again with nobody answering anything. Lane 2 verified the self-healing claim for `src/lib/proposals/promote.ts` only.

```markdown
~~and every count and tally already reads current members only, so removal self-heals with no extra write~~ (struck 23 Aug 2026, pre-deploy-fixes slice: the audit's finding 10 disproves the general claim. Removal deletes the membership row and nothing else, so a removed member's old RSVPs and gauge votes survive and start counting again the moment they rejoin through the same link, which is the documented way back in. The self-healing claim was verified for `src/lib/proposals/promote.ts` alone. Queued as audit finding 10, not fixed here)
```

- [ ] **Step 4: Correct the mechanism clause at `CLAUDE.md:153`**

The current text contains: "Every write path refuses a non-member server-side through the shared check in `src/lib/auth/membership.ts`."

The conclusion holds and stays. The mechanism clause is what is false: per the audit's appendix item A-2-6, `src/app/actions/proposal-vote.ts:82` uses the pre-write form of the check, outside the transaction it is protecting. Amend the sentence so it stops claiming uniformity:

```markdown
Every write path refuses a non-member server-side (amended 23 Aug 2026, pre-deploy-fixes slice: through `src/lib/auth/membership.ts`, but not through one uniform call shape. The audit's A-2-6 found `src/app/actions/proposal-vote.ts:82` using the pre-write form, outside the transaction it protects. The wall holds; the "shared check" wording overstated how evenly it is applied).
```

- [ ] **Step 5: Scope the bench readings at `CLAUDE.md:31`**

The numbers ("80/80 runs on the sixteen cases Orbit must recognize, 65/65 on the thirteen it must stay quiet about, and 10/20 on the four deliberately ambiguous ones") are real and stay. Append one dated sentence giving them their true scope:

```markdown
(Scoped 23 Aug 2026, pre-deploy-fixes slice: the numbers are real and they measure less than the sentence around them implies. The audit's F-3-20 found no bench case exists for the product's core spark behaviour, F-3-2 found four day-comment cases stopping short of the deciding code, and F-3-27 found the flagship regression case rebuilding its failure with words Orbit no longer says. Fixing the bench is its own slice; the benches were not re-run here because they cost money and hit the network.)
```

- [ ] **Step 6: Add the fail-soft consequence at `CLAUDE.md:17`**

The clause "from which the founder heads into the group home carrying their first scheduled event and their detected timezone" is true on the happy path. Add what happens when it is not:

```markdown
(Amended 23 Aug 2026, pre-deploy-fixes slice: true on the happy path, and the failure branch is deliberately fail-soft. When the first-event reconcile throws, `create-group.ts` logs "first-event reconcile failed (cron will catch up)" and carries on, so the founder lands on an **empty** group home, on the first screen after creation, for up to an hour, with nothing on screen saying so. Noticed by the audit's completeness critic, not fixed here.)
```

- [ ] **Step 7: Register the second-viewer gap in `docs/build-notes.md` §8**

§8 is the out-of-scope / queued register. Append an entry. It must describe the gap and NOT propose a solution; sequencing it is the owner's call.

Content to convey: every state change in the product is delivered by `revalidatePath`, which refreshes only the browser that fired the action. A search across `src/` finds no `setInterval`, no `EventSource`, no `WebSocket` and no `visibilitychange`. So a second member sees nothing (not another member's message, not Orbit's reply, not a vote landing, not the third yes creating a plan) until they navigate or reload. In a group-chat product that is the shape of the product, not a detail. Found by the audit's completeness critic and confirmed by hand in its postscript item 4; registered nowhere until now. Match §8's existing entry style, and date it 23 Aug 2026.

- [ ] **Step 8: Verify the diff says what you think it says**

Run: `git diff --stat && git diff CLAUDE.md`
Expected: five amendments in `CLAUDE.md`, one addition in `docs/build-notes.md`. No deletions of existing text except the two deliberate strikethroughs, which keep the original words visible inside `~~ ~~`.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md docs/build-notes.md
git commit -m "The always-loaded file stops claiming things the audit disproved

Five corrections, and the sharpest is about losing a session. The file said
a member who loses theirs meets the invite-only wall until email sign-in
exists. What actually happens is they tap their link again and join as a
second person, so the group holds two of them and every count is quietly
wrong, with no error anywhere. Email sign-in is the slice after the deploy.

Also: removal does not self-heal the way the file claimed, the members-only
wall is not applied through one uniform call shape, the recognition bench
numbers measure less than the sentence around them implies, and a founder
whose first event fails to schedule lands on an empty group home for up to
an hour with nothing saying so.

And the second-viewer gap is registered in build-notes for the first time:
nobody sees a message, a vote, or a plan being created until they reload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bump `next` 16.2.9 to 16.3.2

**Files:**
- Modify: `package.json` (dependencies `next`, devDependencies `eslint-config-next`)
- Modify: `package-lock.json` (generated)
- Test: the existing suite, unchanged.

**Interfaces:**
- Consumes: nothing.
- Produces: the framework version every later task is written and tested against.

**Why this is a task and not a chore.** `npm audit --omit=dev` currently reports 12 vulnerabilities in shipping dependencies (4 moderate, 8 high). Every one that matters resolves through this single bump: `next` itself, plus its bundled `postcss` and `sharp`. The sharpest advisory is an unauthenticated disclosure of internal Server Function endpoints, which is only reachable once the URL is public, which is exactly what slice B does.

- [ ] **Step 1: Record the before numbers**

Run: `npm audit --omit=dev 2>&1 | tail -3 && npm audit 2>&1 | tail -3`
Expected before: `12 vulnerabilities (4 moderate, 8 high)` for the production tree, `15 vulnerabilities (5 moderate, 10 high)` for the full tree.
Write both down; they go in the PR body.

- [ ] **Step 2: Bump the two pinned versions by hand**

Both are pinned exactly (no caret), so edit them literally.

```bash
sed -i '' 's/"next": "16.2.9"/"next": "16.3.2"/' package.json
sed -i '' 's/"eslint-config-next": "16.2.9"/"eslint-config-next": "16.3.2"/' package.json
grep -n '"next"\|"eslint-config-next"' package.json
```

**Do NOT run `npm audit fix --force`.** It is free to pick other majors and will happily move things this slice has not reasoned about.

- [ ] **Step 3: Install**

Run: `npm install`
Expected: completes, `package-lock.json` changes.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: success. Prisma 7 does not auto-generate, and a reinstall can leave the client stale.

- [ ] **Step 5: Run the full suite**

Run: `npm run db:which && npm test`
Expected: `pxbewardwvoyqqcvogel` on all three sources, then `92 passed (92)` files and `935 passed (935)` tests.
If anything goes red, STOP and report. Do not work around a framework regression; whether to keep the bump is the owner's call.

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: exit code 0, all nine routes compiled.
This step is the one that matters most in this task. A framework bump can pass every unit test and still fail to compile a route, because nothing in the suite renders a page.

- [ ] **Step 7: Record the after numbers**

Run: `npm audit --omit=dev 2>&1 | tail -3 && npm audit 2>&1 | tail -3`
Expected: the production-tree count drops substantially. Some findings will remain in the full tree, all inside the Prisma CLI's own dependency chain (`@prisma/dev`, `hono`, `valibot`, `deepmerge-ts`, `brace-expansion`). Those are dev dependencies and never ship. Do not chase them in this slice; record them.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git commit -m "Update the framework for the security fixes before the URL is public

Nobody had ever checked this repo's dependencies for known vulnerabilities.
Twelve of them sit in code that actually ships, and every one that matters
resolves through one version step. The sharpest lets an unauthenticated
caller discover internal server endpoints, which costs nothing today and
costs something the moment the site is reachable.

Verified by the full suite (935 tests) and a production build, because a
framework change can pass every test and still fail to compile a page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Mint the invite token with a cryptographic generator

**Files:**
- Modify: `prisma/schema.prisma:52`
- Create: `src/lib/groups/__tests__/invite-token.test.ts`

**Interfaces:**
- Consumes: `provisionFounderGroup` from `src/lib/groups/provision.ts` (exported, returns `Promise<{ user: User; group: Group }>`); `resetInviteToken` from `src/lib/groups/reset-invite.ts` (exported, returns `Promise<string>`).
- Produces: nothing other tasks read.

**The defect (audit finding 3).** `prisma/schema.prisma:52` reads `inviteToken String @unique @default(cuid())`, while `src/lib/groups/reset-invite.ts:34` correctly uses `randomUUID()`. The invite link is the entire credential to a group: its name, roster, schedule, meeting address, and one tap into the feed. A cuid is mostly a timestamp plus a machine fingerprint with a short ordinary-random tail. This is a missing guarantee rather than an open door, and it rates fix-now purely on timing: it is one line now and means rotating every group's link out from under its members after launch.

**Two facts already established, do not re-derive them.**
1. **There is no migration.** Verified by `npx prisma migrate diff --from-schema <current> --to-schema <changed>`, which printed `No difference detected`. Confirmed independently at `prisma/migrations/20260619003631_init/migration.sql:37`, where the column is declared `"inviteToken" TEXT NOT NULL` with no `DEFAULT` clause. `cuid()` and `uuid()` are Prisma **client** generators; Postgres never sees them. If `prisma migrate dev` offers to create an empty migration, decline it.
2. **`@default(uuid(4))` validates against this schema.** Verified with `npx prisma validate`. Prisma's client generator for `uuid` calls `crypto.randomUUID`, the same primitive `reset-invite.ts` uses.

**Why change the schema default rather than mint in `provision.ts`.** `src/lib/groups/provision.ts:57` creates the group and sets no `inviteToken` at all, relying on the default. So do many test fixtures across the repo, which call `prisma.group.create` directly with no token (for example `src/app/events/[id]/calendar.ics/__tests__/route.test.ts:38`). Dropping the default would break every one of them for no gain. Keep one obvious answer to "where does an invite token come from," and make that answer cryptographic.

**Existing rows keep their old tokens.** Production has none. Dev-test's demo groups are not worth rotating, and rotating them would break any link already pasted into a QA note. Do not write a backfill.

- [ ] **Step 1: Write the failing test**

Create `src/lib/groups/__tests__/invite-token.test.ts`:

```typescript
// src/lib/groups/__tests__/invite-token.test.ts
//
// The invite link is the whole credential to a group, so the token behind it
// must be cryptographically random, and it must be the SAME shape whether it
// came from group creation or from the founder tapping "Reset link". The two
// paths disagreed until 23 Aug 2026 (pre-launch audit, finding 3): creation
// used cuid() and reset used randomUUID().
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { provisionFounderGroup } from "../provision"
import { resetInviteToken } from "../reset-invite"

// RFC 4122 version 4: 8-4-4-4-12 hex, with the version nibble pinned to 4 and
// the variant nibble to 8/9/a/b. A cuid ("c" + 24 lowercase alphanumerics)
// cannot match this, which is what makes the assertion able to fail.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("invite token generation", () => {
  const userIds: string[] = []
  const groupIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) {
      await prisma.group.delete({ where: { id } }).catch(() => {})
    }
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  async function makeGroup(tag: string) {
    const { user, group } = await provisionFounderGroup({
      supabaseAuthId: `test-invite-${tag}-${Date.now()}-${Math.random()}`,
      founderName: "[TEST] Token Founder",
      groupName: "[TEST] Token Group",
    })
    userIds.push(user.id)
    groupIds.push(group.id)
    return group
  }

  it("mints a cryptographically random token at group creation", async () => {
    const group = await makeGroup("create")
    expect(group.inviteToken).toMatch(UUID_V4)
  })

  it("mints the same shape at creation as the reset path does", async () => {
    const group = await makeGroup("reset")
    const founder = await prisma.user.findUnique({ where: { id: group.founderId } })
    const rotated = await resetInviteToken({
      supabaseAuthId: founder!.supabaseAuthId!,
      groupId: group.id,
    })

    expect(rotated).toMatch(UUID_V4)
    expect(rotated).not.toBe(group.inviteToken)
  })

  it("does not repeat a token across two groups created back to back", async () => {
    const a = await makeGroup("uniq-a")
    const b = await makeGroup("uniq-b")
    expect(a.inviteToken).not.toBe(b.inviteToken)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run db:which && npx vitest run src/lib/groups/__tests__/invite-token.test.ts`
Expected: `pxbewardwvoyqqcvogel` first, then the first two tests FAIL. The failure message shows a received value like `"cmey3k1x40000..."` not matching the UUID pattern. The third test (uniqueness) passes on both generators, which is correct and is why it is not the load-bearing assertion.

**If the first two tests pass here, stop.** It means the assertion cannot fail and the test is worthless. Check that the regex is being applied and that you are reading the real `inviteToken`.

- [ ] **Step 3: Change the schema default**

```bash
sed -i '' 's/inviteToken         String             @unique @default(cuid())/inviteToken         String             @unique @default(uuid(4))/' prisma/schema.prisma
grep -n "inviteToken" prisma/schema.prisma
```

Expected line 52: `  inviteToken         String             @unique @default(uuid(4))`

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: success. The generator change lives in the client, so nothing takes effect until this runs.

- [ ] **Step 5: Confirm there is no migration to write**

Run: `npx prisma migrate status`
Expected: no pending migration and no drift reported for this change. Do not run `prisma migrate dev`. If it somehow offers to create a migration, decline and record it in the PR body as a surprise worth explaining.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/groups/__tests__/invite-token.test.ts`
Expected: 3 passed.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 93 files (the new one) and 938 tests, all green. Report the real numbers.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/groups/__tests__/invite-token.test.ts
git commit -m "The invite link's key is generated the same way the reset button already does

The link is the whole credential to a group: its name, its roster, its
schedule, its meeting address, and one tap into the feed. It was being
generated by an id generator that is mostly a timestamp plus a machine
fingerprint, while the founder's own Reset link button correctly used a
cryptographic one. The two disagreed in writing, in a codebase an investor
may read.

Small now, expensive later: after launch this means rotating every group's
link out from under its members.

No migration. The column never had a database default, so the generator
lives in the Prisma client alone, confirmed by an empty schema diff.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: One bad group must not stop Orbit's hourly work for every group

**Files:**
- Modify: `src/lib/orbit/reconcile.ts:29-31` (the `ReconcileResult` union) and `:62-132` (the loop body)
- Create: `src/lib/orbit/__tests__/reconcile-resilience.test.ts`

**Interfaces:**
- Consumes: `reconcileScheduledEvents(now: Date, opts?: { groupId?: string }): Promise<ReconcileResult[]>` from `src/lib/orbit/reconcile.ts`.
- Produces: a widened `ReconcileResult` union that later readers of the cron response will see:

```typescript
export type ReconcileResult =
  | { groupId: string; status: "created"; eventId: string }
  | { groupId: string; status: "skipped"; reason: "no_rhythm" | "upcoming_exists" | "duplicate" }
  | { groupId: string; status: "failed"; reason: string }
```

**The defect (audit finding 4, found independently by lanes 1, 3 and 6).** The hourly cron handler (`src/app/api/cron/orbit/route.ts:49-55`) runs three sweeps in sequence, and `reconcileScheduledEvents` is first. `src/lib/orbit/reconcile.ts:130` re-throws any non-P2002 error, so one unexpected database error in one group kills that group's recurring plan, every group after it in the same run, and the other two sweeps entirely (last calls, idea goodbyes, stalled time-change closures). A one-off glitch costs an hour and heals itself. A fault that repeats on the same group keeps Orbit's entire scheduled half switched off until somebody notices, with only a failed cron run to show for it. Both sibling sweeps already survive a bad row; this one, which runs first, does not.

**Correction to the original estimate, carried into this plan.** The audit's "Do" line reads "wrap the per-group work in the same try/catch the two sibling sweeps already use," and it was scoped in conversation as replacing one `throw`. That is not sufficient. The existing `try` at `reconcile.ts:89` covers only steps d and e (`createEvent` and `createMessage`). Steps a to c run **outside** it, and step b is `await hasUpcomingScheduledEvent(groupId, now)`, a database call and the single most likely source of exactly the transient error this finding is about. Replacing the `throw` alone would leave the main hole open.

**Do this instead:** extract the per-group body into a module-level helper and wrap the *call* in try/catch. This keeps the diff small (no 40-line re-indentation), puts every per-group database call inside the guard, and leaves the tested P2002 branch untouched inside the helper.

- [ ] **Step 1: Write the failing test**

Create `src/lib/orbit/__tests__/reconcile-resilience.test.ts`:

```typescript
// src/lib/orbit/__tests__/reconcile-resilience.test.ts
//
// One group's failure must not take out the rest of the sweep.
//
// This file mocks the database rather than hitting it, deliberately, and it is
// the exception to the repo's integration-test idiom. The reason is the hard
// rule at the top of reconcile.test.ts: an UNSCOPED reconcile against the
// shared dev-test database creates a real event and a real ORBIT announcement
// in every group that has a rhythm, and those leak permanently. Proving "group
// A fails, group B still gets its event" needs more than one group in a single
// sweep, and { groupId } scoping only ever admits one. So the loop's error
// handling is unit-tested with no database at all, and reconcile.test.ts keeps
// covering the real thing, scoped.
//
// parseRhythm and computeNextOccurrence are left REAL. Fewer mocks, and the
// fixture rhythms below are the genuine stored shape.
import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { group: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

const hasUpcoming = vi.fn()
vi.mock("@/lib/events/upcoming-list", () => ({
  hasUpcomingScheduledEvent: (...a: unknown[]) => hasUpcoming(...a),
}))

const createEvent = vi.fn()
vi.mock("@/lib/events/create", () => ({
  createEvent: (...a: unknown[]) => createEvent(...a),
}))

const createMessage = vi.fn()
vi.mock("@/lib/messages/create", () => ({
  createMessage: (...a: unknown[]) => createMessage(...a),
}))

import { reconcileScheduledEvents } from "../reconcile"

const NOW = new Date("2099-01-07T12:00:00.000Z") // a Wednesday

// The genuine stored shape, validated by the REAL parseRhythm: daysOfWeek is
// integers 0=Sun..6=Sat, timeLocal is "HH:mm", and cadence must be exactly
// the lowercase "weekly" (rhythm.ts:82-106). Get any of these wrong and
// parseRhythm returns null, every group comes back "skipped: no_rhythm", and
// the test passes or fails for a reason that has nothing to do with the fix.
function group(id: string) {
  return {
    id,
    timeZone: "UTC",
    recurringActivities: [
      {
        activity: "climbing",
        title: "Climbing",
        daysOfWeek: [0],
        timeLocal: "09:00",
        cadence: "weekly",
      },
    ],
  }
}

describe("reconcileScheduledEvents resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasUpcoming.mockResolvedValue(false)
    createMessage.mockResolvedValue({ id: "msg" })
  })

  it("keeps going when one group's event creation throws", async () => {
    findMany.mockResolvedValue([group("bad"), group("good")])
    createEvent
      .mockRejectedValueOnce(new Error("connection terminated unexpectedly"))
      .mockResolvedValueOnce({ id: "evt-good", startsAt: NOW, title: "Climbing" })

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "good", status: "created" })
    )
    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "bad", status: "failed" })
    )
  })

  it("keeps going when the upcoming-event lookup throws, which runs before the existing guard", async () => {
    findMany.mockResolvedValue([group("bad"), group("good")])
    hasUpcoming
      .mockRejectedValueOnce(new Error("too many connections"))
      .mockResolvedValueOnce(false)
    createEvent.mockResolvedValue({ id: "evt-good", startsAt: NOW, title: "Climbing" })

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "good", status: "created" })
    )
    expect(results).toContainEqual(
      expect.objectContaining({ groupId: "bad", status: "failed" })
    )
  })

  it("still skips a duplicate rather than calling it a failure", async () => {
    findMany.mockResolvedValue([group("dupe")])
    createEvent.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }))

    const results = await reconcileScheduledEvents(NOW)

    expect(results).toEqual([
      { groupId: "dupe", status: "skipped", reason: "duplicate" },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/orbit/__tests__/reconcile-resilience.test.ts`
Expected: the first two tests FAIL because the whole call rejects (`connection terminated unexpectedly`, `too many connections`) instead of returning results. The third test PASSES already, which is correct: it is a regression guard on the P2002 branch, present so the fix cannot quietly turn a deliberate skip into a failure.

The second test is the one that proves the estimate correction. Against today's code it fails for a different reason than the first: that error is thrown outside the existing `try` entirely.

**The third test doubles as a fixture guard.** It can only pass by reaching `createEvent`, which means `parseRhythm` accepted the fixture rhythm. If the fixture shape were wrong, every group would come back `skipped: no_rhythm` and this test would fail immediately, rather than the whole file passing or failing for a reason unrelated to the fix.

- [ ] **Step 3: Widen the result union**

In `src/lib/orbit/reconcile.ts`, replace the `ReconcileResult` type with:

```typescript
export type ReconcileResult =
  | { groupId: string; status: "created"; eventId: string }
  | { groupId: string; status: "skipped"; reason: "no_rhythm" | "upcoming_exists" | "duplicate" }
  | { groupId: string; status: "failed"; reason: string }
```

- [ ] **Step 4: Extract the per-group body and guard the call**

Move the entire body of the `for (const group of groups)` loop into a module-level helper that returns one `ReconcileResult`, converting each `results.push(x); continue` into `return x`, and each `results.push(x)` at the end into `return x`. Leave the inner P2002 `try/catch` exactly as it is, including its comment.

The loop then becomes:

```typescript
  for (const group of groups) {
    try {
      results.push(await reconcileOneGroup(group, now))
    } catch (err) {
      // One bad group must not take the sweep down. This runs first of three
      // in the hourly cron (src/app/api/cron/orbit/route.ts), so a throw here
      // used to cost every later group its recurring plan AND both sibling
      // sweeps (last calls, idea goodbyes, stalled vote closures) for that
      // hour. Both siblings already survive a bad row; this one did not.
      // Pre-launch audit, finding 4. Logged, never swallowed silently:
      // endgame.ts:148 is the pattern.
      console.error("[orbit-reconcile] group failed:", group.id, err)
      results.push({
        groupId: group.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
```

Give the helper this signature so the types stay explicit:

```typescript
async function reconcileOneGroup(
  group: { id: string; recurringActivities: unknown; timeZone: string | null },
  now: Date
): Promise<ReconcileResult>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/orbit/__tests__/reconcile-resilience.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Run the existing reconcile tests, which are the real-database ones**

Run: `npm run db:which && npx vitest run src/lib/orbit/__tests__/reconcile.test.ts`
Expected: dev-test ref, then all green. This is the check that the extraction did not change behaviour on the path that actually runs.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green, file and test counts up by the new file. Report real numbers.

- [ ] **Step 8: Commit**

```bash
git add src/lib/orbit/reconcile.ts src/lib/orbit/__tests__/reconcile-resilience.test.ts
git commit -m "One group's bad data no longer switches Orbit off for everyone

Orbit's hourly job does three things in order, and the first one gave up
entirely on any unexpected database error in any single group. That group
lost its recurring plan, so did every group after it, and the other two
jobs (last calls, idea goodbyes, stalled vote closures) never ran at all.
A one-off glitch costs an hour. A fault that keeps happening to the same
group keeps Orbit's whole scheduled half switched off until a human
notices, and nothing anywhere would say so.

Wider than first scoped: the existing guard only covered creating the
event, and the most likely thing to fail was the database lookup one step
earlier, outside it. Both are covered now, and the test proves the second
one because it fails against the old code for its own reason.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Ship the product's own artwork

**Files:**
- Delete: `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg`
- Delete: `src/app/favicon.ico`
- Create: `src/app/icon.svg`
- Create: `scripts/build-brand-assets.ts`
- Create: `src/app/apple-icon.png` (generated, committed)

**Interfaces:**
- Consumes: the mark's geometry from `src/components/OrbitMark.tsx:8-27` and `:55-88`.
- Produces: `scripts/build-brand-assets.ts`, which task 6 extends to also emit the Open Graph image. Its contract: reads `src/app/icon.svg`, writes rasters next to it.

**The defect (audit postscript item 2).** `public/` still holds five create-next-app SVGs, all dated 17 June, and `src/app/favicon.ico` is still Next's default 25,931-byte icon. None were in the audit's file ledger and no lane was pointed at them, which is why a static-asset problem survived a whole-repo audit.

**Geometry you must not approximate.** `OrbitMark.tsx` renders into `viewBox="0 0 240 240"` and then scales itself to 156% inside a smaller slot with overflow visible, because the moon and the orbit path sit outside the sphere. For a standalone icon file there is no slot, so the same 240x240 viewBox holds the whole mark with room to spare (the drawn content spans roughly x 16 to 224, y 52 to 189). Copy the shapes; do not redraw them and do not crop.

- [ ] **Step 1: Confirm nothing references the five SVGs**

Run: `grep -rn "next.svg\|vercel.svg\|file.svg\|globe.svg\|window.svg" src/ docs/ *.ts *.tsx *.json 2>/dev/null`
Expected: no hits in `src/`. The audit's own coverage says nobody ever read `public/`, so this is the first time anyone has checked. If there IS a hit, stop and report it rather than deleting.

- [ ] **Step 2: Delete the starter artwork**

```bash
git rm public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg src/app/favicon.ico
```

Note on `favicon.ico`: Next's docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md:171`) state you cannot generate a `favicon`, and that `icon` is the supported route. An `icon.svg` is a first-class replacement and every browser this product targets renders it. Accepted limitation, worth one line in the PR: a client that demands `.ico` specifically gets a 404 rather than a fallback icon.

- [ ] **Step 3: Create `src/app/icon.svg`**

Ported from `src/components/OrbitMark.tsx`. The gradient and clip-path ids are static here (no `useId`, because this is a standalone document and cannot collide).

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <radialGradient id="osph" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#c2f878"/>
      <stop offset="55%" stop-color="#a4ef4e"/>
      <stop offset="100%" stop-color="#8ad53b"/>
    </radialGradient>
    <clipPath id="omc">
      <path d="M100 136 L140 136 A 20 22 0 0 1 100 136 Z"/>
    </clipPath>
  </defs>
  <g transform="rotate(-18 120 120)">
    <ellipse cx="120" cy="120" rx="106" ry="42" fill="none" stroke="#8b99ad" stroke-width="4.5"/>
  </g>
  <circle cx="120" cy="120" r="74" fill="url(#osph)" stroke="#181c12" stroke-width="9"/>
  <circle cx="92" cy="86" r="7" fill="#eaffc9" opacity="0.85"/>
  <circle cx="96" cy="116" r="16" fill="#1c2218"/>
  <circle cx="144" cy="116" r="16" fill="#1c2218"/>
  <circle cx="101.5" cy="109.5" r="5.5" fill="#fff"/>
  <circle cx="149.5" cy="109.5" r="5.5" fill="#fff"/>
  <circle cx="83" cy="129" r="5" fill="#45a6ff"/>
  <path d="M100 136 L140 136 A 20 22 0 0 1 100 136 Z" fill="#1c2218"/>
  <g clip-path="url(#omc)">
    <ellipse cx="120" cy="158" rx="14" ry="11" fill="#ff8f7a"/>
  </g>
  <path d="M100 136 L140 136 A 20 22 0 0 1 100 136 Z" fill="none" stroke="#181c12" stroke-width="6" stroke-linejoin="round"/>
  <g transform="rotate(-18 120 120)">
    <circle cx="185.26" cy="86.9" r="13.5" fill="#45a6ff" stroke="#181c12" stroke-width="6"/>
  </g>
</svg>
```

- [ ] **Step 4: Write the raster generator**

Create `scripts/build-brand-assets.ts`. `sharp` is already present (a Next dependency, verified at version 8.17.3 of libvips) and is used here only at authoring time, never at runtime.

```typescript
// scripts/build-brand-assets.ts
//
// Renders the committed brand rasters from src/app/icon.svg, which is the one
// source of truth for the mark outside the React component. Run by hand when
// the mark changes; the outputs are committed so nothing renders at build time
// or at request time.
//
//   npx tsx scripts/build-brand-assets.ts
//
// No text is drawn into any of these. Font rendering here would depend on
// whatever fonts happen to be installed on the machine that ran the script,
// which is not a thing to make a shipped asset depend on. The words in a link
// preview come from the page's metadata instead, where the receiving app
// renders them in its own type.
import sharp from "sharp"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")
const SVG = readFileSync(join(ROOT, "src/app/icon.svg"))

// --surface-base, globals.css. The home-screen tile is composited on an opaque
// background, so transparency is not an option the way it is for a tab icon.
const SURFACE_BASE = { r: 0x15, g: 0x16, b: 0x1e, alpha: 1 }

async function appleIcon() {
  const MARK = 150 // inset inside the 180 tile, so the mark is not edge to edge
  const mark = await sharp(SVG).resize(MARK, MARK).png().toBuffer()
  const out = await sharp({
    create: { width: 180, height: 180, channels: 4, background: SURFACE_BASE },
  })
    .composite([{ input: mark, top: (180 - MARK) / 2, left: (180 - MARK) / 2 }])
    .png()
    .toBuffer()
  writeFileSync(join(ROOT, "src/app/apple-icon.png"), out)
  console.log("wrote src/app/apple-icon.png (180x180)")
}

async function main() {
  await appleIcon()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 5: Generate the home-screen icon**

Run: `npx tsx scripts/build-brand-assets.ts`
Expected: `wrote src/app/apple-icon.png (180x180)`.

Then confirm it is a real image and not a blank tile:

```bash
node -e "const s=require('sharp');s('src/app/apple-icon.png').stats().then(r=>console.log('channels:',r.channels.map(c=>Math.round(c.mean))))"
```
Expected: three or four channel means that are NOT all within a point or two of 21, 22, 30 (the base surface). If they are, the mark did not composite and you have shipped an empty square.

- [ ] **Step 6: Run the build so Next picks up the new file conventions**

Run: `npm run build`
Expected: exit 0.

Then confirm the tags are actually emitted:

```bash
grep -o '<link rel="icon"[^>]*>\|<link rel="apple-touch-icon"[^>]*>' .next/server/app/index.html 2>/dev/null || echo "check the rendered head in step 8 instead"
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green, unchanged counts (this task adds no tests; it is a visual claim and gets rendered evidence instead).

- [ ] **Step 8: Get rendered evidence, because this is a visual claim**

Standing rule: never claim a visual match without having looked. Start the dev server, load the front door, and screenshot the browser tab showing the icon. Then read the machine's LAN address fresh (`ipconfig getifaddr en0`) and hand the owner the address so he can check the home-screen icon on his own phone. Do NOT leave a dev server running for him; the QA script hands him the command to start it himself.

- [ ] **Step 9: Commit**

```bash
git add -A public src/app/icon.svg src/app/apple-icon.png scripts/build-brand-assets.ts
git commit -m "The product wears its own face instead of the starter kit's

Five leftover create-next-app graphics and the default framework favicon
were still in the repo, all dated 17 June. Nobody had ever looked at them:
they were missing from the audit's own file ledger, which is how a
whole-repo read missed the browser tab icon.

Orbit's mark now serves as the tab icon and the home-screen icon, ported
from the component rather than redrawn. The home-screen one matters more
than it sounds: the product's front door says there is no app to download,
which makes adding to a home screen the closest thing to installing it,
and this is the icon people get.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The invite link gets a preview

**Files:**
- Modify: `src/app/layout.tsx:15-19`
- Modify: `src/app/join/[inviteToken]/page.tsx` (add `generateMetadata`)
- Modify: `scripts/build-brand-assets.ts` (add the Open Graph raster)
- Create: `src/app/opengraph-image.png` (generated, committed)
- Create: `src/lib/site-url.ts`
- Create: `src/lib/__tests__/site-url.test.ts`
- Create: `src/app/join/[inviteToken]/__tests__/metadata.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; the mark from task 5's `src/app/icon.svg`.
- Produces:

```typescript
// src/lib/site-url.ts
export function siteUrl(): URL
```

**The defect (audit postscript item 3).** `src/app/layout.tsx:15` declares `title` and `description` and no `openGraph`. `generateMetadata` appears nowhere in `src/`. The invite link is this product's entire distribution mechanism and it currently previews in a group text as a bare URL, with no image and no name.

**Settled, do not relitigate.** The preview names the group over one static image. Rejected: a generic preview (does not earn the tap) and a per-group rendered image (more surface, no gain). The accepted cost, already stated to the owner: link-unfurling services read the group's name without a human tapping. This is consistent with polish slice three, where the join screen shows the group's name, member count and rhythms to anyone holding the link, because the link is the credential.

**Do not add an `APP_URL` environment variable.** The `.ics` route already answers "what host are we" by reading the origin off the request (`src/app/events/[id]/calendar.ics/route.ts:47`). Metadata is generated where there may be no request origin available, so it reads Vercel's own production URL variable instead. Two readers, one answer each, neither of them a hand-edited value that can drift.

- [ ] **Step 1: Write the failing test for the site URL helper**

Create `src/lib/__tests__/site-url.test.ts`:

```typescript
// src/lib/__tests__/site-url.test.ts
//
// metadataBase needs an absolute URL, and Next throws a build error if a
// relative metadata path is used without one. This reads the host Vercel
// already sets rather than adding an env var somebody has to remember to
// set at deploy time (which would be a second, driftable answer to "what
// host are we" — the .ics route already answers it from the request).
import { describe, it, expect, afterEach } from "vitest"
import { siteUrl } from "../site-url"

const KEYS = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "PORT"] as const
const saved: Record<string, string | undefined> = {}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
    delete saved[k]
  }
})

function setEnv(k: (typeof KEYS)[number], v: string | undefined) {
  saved[k] = process.env[k]
  if (v === undefined) delete process.env[k]
  else process.env[k] = v
}

describe("siteUrl", () => {
  it("prefers the stable production host over the per-deployment one", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "interplanetary-groups.vercel.app")
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })

  it("falls back to the per-deployment host on a preview build", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined)
    setEnv("VERCEL_URL", "interplanetary-groups-abc123.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups-abc123.vercel.app/")
  })

  it("falls back to localhost when neither is set, so a local build still works", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined)
    setEnv("VERCEL_URL", undefined)
    setEnv("PORT", undefined)
    expect(siteUrl().toString()).toBe("http://localhost:3000/")
  })

  it("never returns a URL with a scheme already attached twice", () => {
    setEnv("VERCEL_PROJECT_PRODUCTION_URL", "https://interplanetary-groups.vercel.app")
    expect(siteUrl().toString()).toBe("https://interplanetary-groups.vercel.app/")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/site-url.test.ts`
Expected: FAIL, "Failed to resolve import ../site-url".

- [ ] **Step 3: Write the helper**

Create `src/lib/site-url.ts`:

```typescript
// src/lib/site-url.ts
//
// The absolute base URL for metadata. Metadata is generated where a request
// origin is not reliably available, so it reads the host Vercel sets rather
// than the request. Deliberately NOT a new environment variable: that would be
// a second answer to "what host are we" that somebody has to set by hand and
// that can silently drift from the first one (the .ics route, which reads the
// origin off the request — see src/app/events/[id]/calendar.ics/route.ts).
//
// VERCEL_PROJECT_PRODUCTION_URL is the stable production host and is preferred.
// VERCEL_URL is per-deployment and changes every push, which is right for a
// preview build and wrong for a link somebody keeps.
export function siteUrl(): URL {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null

  if (!host) {
    return new URL(`http://localhost:${process.env.PORT ?? 3000}`)
  }

  return new URL(host.startsWith("http") ? host : `https://${host}`)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/__tests__/site-url.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Add the Open Graph raster to the generator**

In `scripts/build-brand-assets.ts`, add this function and call it from `main()`:

```typescript
async function openGraphImage() {
  // 1200x630 is the size every major unfurler crops to. The mark is generous
  // because it is the only thing in the frame: no text is drawn here, so this
  // asset never depends on a font being installed.
  const MARK = 420
  const mark = await sharp(SVG).resize(MARK, MARK).png().toBuffer()
  const out = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: SURFACE_BASE },
  })
    .composite([{ input: mark, top: (630 - MARK) / 2, left: (1200 - MARK) / 2 }])
    .png()
    .toBuffer()
  writeFileSync(join(ROOT, "src/app/opengraph-image.png"), out)
  console.log("wrote src/app/opengraph-image.png (1200x630)")
}
```

Update `main()` to `await appleIcon(); await openGraphImage();`

- [ ] **Step 6: Generate it**

Run: `npx tsx scripts/build-brand-assets.ts`
Expected: both lines printed.

Confirm it is not a blank rectangle:
```bash
node -e "const s=require('sharp');s('src/app/opengraph-image.png').metadata().then(m=>console.log(m.width,m.height));s('src/app/opengraph-image.png').stats().then(r=>console.log('means:',r.channels.map(c=>Math.round(c.mean))))"
```
Expected: `1200 630`, and channel means that differ from the flat base surface.

- [ ] **Step 7: Add the root metadata**

Replace the `metadata` export in `src/app/layout.tsx`:

```typescript
const TITLE = "Interplanetary Groups"
const DESCRIPTION =
  "Casual plans shouldn't need a wedding planner. Orbit picks a day, asks the group, and keeps track of who's in."

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
}
```

Add `import { siteUrl } from "@/lib/site-url"` at the top. Do not name the image here: `src/app/opengraph-image.png` is a file convention and Next attaches it automatically to this segment and everything below it.

- [ ] **Step 8: Write the failing test for the join route's metadata**

Create `src/app/join/[inviteToken]/__tests__/metadata.test.ts`:

```typescript
// src/app/join/[inviteToken]/__tests__/metadata.test.ts
//
// The invite link is the product's entire distribution mechanism, so what it
// looks like in a group text is a product surface. The group's name is in the
// title deliberately (owner's call, 23 Aug 2026): the preview's job is to make
// the recipient trust it enough to tap, and the link is the credential anyway
// — the join screen already shows the group to anyone holding it.
//
// Integration test — hits the real dev database (repo idiom).
import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { generateMetadata } from "../page"

describe("join route metadata", () => {
  const userIds: string[] = []
  const groupIds: string[] = []

  afterAll(async () => {
    for (const id of groupIds) await prisma.group.delete({ where: { id } }).catch(() => {})
    for (const id of userIds) await prisma.user.delete({ where: { id } }).catch(() => {})
    await prisma.$disconnect()
  })

  async function fixture() {
    const founder = await prisma.user.create({
      data: { name: "[TEST] Meta Founder", supabaseAuthId: `test-meta-${Date.now()}-${Math.random()}` },
    })
    userIds.push(founder.id)
    const group = await prisma.group.create({
      data: {
        name: "[TEST] Sunday Climbers",
        founderId: founder.id,
        memberships: { create: [{ userId: founder.id }] },
      },
    })
    groupIds.push(group.id)
    return group
  }

  it("names the group in the title when the token resolves", async () => {
    const group = await fixture()
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: group.inviteToken }),
    })
    expect(meta.title).toContain(group.name)
    expect(meta.openGraph?.title).toContain(group.name)
  })

  it("falls back to the product title for a token that resolves to nothing", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: "not-a-real-token" }),
    })
    expect(meta.title).toBe("Interplanetary Groups")
  })

  it("says nothing that distinguishes a dead token from a live one", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ inviteToken: "not-a-real-token" }),
    })
    const blob = JSON.stringify(meta).toLowerCase()
    for (const leak of ["invalid", "expired", "not found", "no longer", "wrong"]) {
      expect(blob).not.toContain(leak)
    }
  })
})
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npm run db:which && npx vitest run "src/app/join/[inviteToken]/__tests__/metadata.test.ts"`
Expected: dev-test ref, then FAIL, "generateMetadata is not a function".

- [ ] **Step 10: Add `generateMetadata` to the join page**

In `src/app/join/[inviteToken]/page.tsx`, add above the default export. Import `type { Metadata } from "next"`.

```typescript
// The shared invite link's preview card. Orbit's voice, and it never
// distinguishes a dead token from a live one: a preview that said "invalid
// invite" would turn every mis-typed link into a probe. A failure here must
// never take the page down, so the lookup is best-effort.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { inviteToken } = await params

  const group = await prisma.group
    .findUnique({ where: { inviteToken }, select: { name: true } })
    .catch(() => null)

  if (!group) {
    return { title: "Interplanetary Groups" }
  }

  const title = `Join ${group.name}`
  const description =
    "You've been invited. No app to download, no password. You'll land right in the group."

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  }
}
```

Note the description reuses the join screen's own corrected reassurance copy (polish slice three), so the preview and the page it opens say the same thing.

- [ ] **Step 11: Run it to verify it passes**

Run: `npx vitest run "src/app/join/[inviteToken]/__tests__/metadata.test.ts"`
Expected: 3 passed.

- [ ] **Step 12: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: suite green with the two new files, build exit 0. The build is required here: a relative metadata path without a `metadataBase` is a build error, not a test failure.

- [ ] **Step 13: Verify the tags render, and record what cannot be verified**

Start the dev server, open a real join URL, and read the page head to confirm `og:title` carries the group's name and `og:image` resolves. That proves the tags. It does NOT prove the preview.

**Write this in the PR body verbatim, and do not soften it:** the text-message preview cannot be verified in this slice at all. Apple, WhatsApp and Slack cannot fetch a laptop on a home network. The metadata is written and unproven; slice B proves it by the owner texting himself the live link. Never write "works" or "matches" about this task.

- [ ] **Step 14: Commit**

```bash
git add src/lib/site-url.ts src/lib/__tests__/site-url.test.ts src/app/layout.tsx "src/app/join/[inviteToken]/page.tsx" "src/app/join/[inviteToken]/__tests__/metadata.test.ts" scripts/build-brand-assets.ts src/app/opengraph-image.png
git commit -m "A texted invite link stops arriving as a bare URL

Sharing the link is the only way anyone joins a group, and it previewed in
a group text as naked blue text: no picture, no name, nothing saying what
it was. Now it carries Orbit's face and the group's own name.

The group's name is in the preview deliberately. The preview's job is to
make the person trust it enough to tap, and a generic card does not do
that; the link is the credential either way, and the join screen already
shows the group to anyone holding it. The accepted cost is that the
services building those preview cards read the group's name without anyone
tapping anything.

A dead link previews exactly like a live one, so a mistyped URL cannot be
used to probe for real groups.

Unproven here, on purpose: no messaging service can reach a laptop on a
home network, so the preview itself is verified after deploy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Search engines see the front door and nothing else

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/__tests__/robots.test.ts`

**Interfaces:**
- Consumes: `siteUrl` from `src/lib/site-url.ts` (task 6).
- Produces: nothing other tasks read.

**Settled.** The front door is indexable; group, event and join routes are not. Those URLs are credentials or contain them. Link unfurlers ignore `robots.txt` by design, so task 6 is unaffected.

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/robots.test.ts`:

```typescript
// src/app/__tests__/robots.test.ts
//
// Group, event and join URLs are credentials or contain one, and none of them
// belongs in a search result. The front door is the exception: it is the only
// page written to be found by a stranger.
//
// This is NOT access control. robots.txt is a request that well-behaved
// crawlers honour; the membership wall (src/lib/auth/membership.ts) is what
// actually keeps non-members out.
import { describe, it, expect } from "vitest"
import robots from "../robots"

describe("robots", () => {
  const rules = () => {
    const r = robots().rules
    return Array.isArray(r) ? r[0] : r
  }

  it("lets crawlers see the front door", () => {
    expect(rules().allow).toBe("/")
  })

  it("keeps groups, events and invite links out of search results", () => {
    const disallow = rules().disallow
    const list = Array.isArray(disallow) ? disallow : [disallow]
    expect(list).toContain("/groups/")
    expect(list).toContain("/events/")
    expect(list).toContain("/join/")
  })

  it("points at an absolute host rather than a relative path", () => {
    expect(String(robots().sitemap ?? "")).toMatch(/^https?:\/\//)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/__tests__/robots.test.ts`
Expected: FAIL, "Failed to resolve import ../robots".

- [ ] **Step 3: Write the route**

Create `src/app/robots.ts`. Next's convention is documented at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md`.

```typescript
// src/app/robots.ts
//
// The front door is the only page written to be found by a stranger. A group
// URL, an event URL and an invite link are all credentials or contain one, and
// none of them belongs in a search result.
//
// This is NOT access control. robots.txt is a request that well-behaved
// crawlers honour, and nothing more. The membership wall
// (src/lib/auth/membership.ts) is what actually keeps non-members out.
//
// Link unfurlers ignore robots.txt by design, which is why the invite link's
// preview (src/app/join/[inviteToken]/page.tsx) still works.
import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site-url"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/groups/", "/events/", "/join/", "/create"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  }
}
```

Note `/create` is disallowed too: the onboarding wizard is a flow, not a page anyone should land on from a search result, and the front door already points at it.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/app/__tests__/robots.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Confirm the route actually serves**

Start the dev server and fetch `/robots.txt`. Expected body:

```
User-Agent: *
Allow: /
Disallow: /groups/
Disallow: /events/
Disallow: /join/
Disallow: /create
```

Note in the PR body that the `Sitemap:` line points at a `/sitemap.xml` this product does not have. That is harmless (crawlers 404 and move on) and it is the one loose end this task leaves. If you would rather not leave it, drop the `sitemap` key and delete the third test with it; either answer is defensible, so pick one and say which in the PR.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/app/robots.ts src/app/__tests__/robots.test.ts
git commit -m "Search engines get the front page and nothing else

A group URL, an event URL and an invite link are credentials or contain
one. None of them belongs in a search result. The front door is the
exception, because it is the only page written for a stranger to find.

Worth saying out loud so nobody later mistakes this for protection: this
is a request that well-behaved crawlers honour, not a wall. The membership
check is the wall. Link preview services ignore this file by design, which
is exactly why a texted invite still shows its card.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Add the two missing pre-deploy checklist items

**Files:**
- Modify: `docs/build-notes.md` §11, the checklist beginning at `:338` ("Before first Vercel deploy — prerequisites checklist")
- Test: none. Docs-only task.

**Interfaces:**
- Consumes: nothing.
- Produces: the checklist slice B executes.

**The defect (audit findings 1 and 2).** The checklist currently has ten items and reads as complete. It omits two things, either of which takes the entire site down on its first request.

**House style, follow it exactly.** Each item is a bold one-line instruction, then an italic `*Why it blocks deploy:*` paragraph, then an italic `*Detail:*` line. Every addition to this list has been followed by an italic `*Correction, DD Mon YYYY (slice name): N items now...*` line, per the append-only rule. Read items 9 and 10 and their correction lines before writing.

- [ ] **Step 1: Add item 11, the two Supabase client variables**

```markdown
11. **Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel dashboard** (Environment Variables → Production) **before the build runs, not merely before the first visitor.**
    *Why it blocks deploy:* `src/lib/supabase/env.ts:4` throws by name when either is missing, so every page of the site fails on its first request. The checklist read as complete without them, which is the dangerous shape: the deploy goes green and the site is entirely down. Because both are `NEXT_PUBLIC_`, they are inlined at build time, so setting them after a green build does nothing until the next build. That timing distinction is the whole reason this is a checklist item rather than a fix-it-when-it-breaks.
    *Detail:* pre-launch audit, finding 1 (22 Aug 2026). The thrown error names the missing variable, so diagnosis is fast once somebody looks.
```

- [ ] **Step 2: Add item 12, anonymous sign-ins**

```markdown
12. **Turn on anonymous sign-ins in the production Supabase project** (Authentication → Sign In / Providers → Anonymous sign-ins).
    *Why it blocks deploy:* every identity in the product starts as an anonymous session, and both doors mint one (`src/app/actions/create-group.ts:70`, `src/app/actions/join-group.ts:38`). Production is a different Supabase project from the one everything was built against, and this is a dashboard switch that does not carry over. With it off, the founder completes the entire onboarding wizard and gets "Could not create a session. Please try again." forever, and so does everyone who opens the invite link. The message points at nothing, which is what makes this expensive to diagnose and cheap to prevent.
    *Detail:* pre-launch audit, finding 2 (22 Aug 2026). Anonymous-first identity is a founding decision, build-notes §3.
```

- [ ] **Step 3: Add the count-correction line, matching the file's own pattern**

```markdown
*Correction, 23 Aug 2026 (pre-deploy-fixes slice): twelve items now. Same reading as above: check all of them. Both additions come from the pre-launch audit's fix-before-deploy findings, and both take the whole site down rather than degrading one feature, which is a class the first ten items did not contain.*
```

- [ ] **Step 4: Verify the diff**

Run: `git diff docs/build-notes.md`
Expected: three additions, no deletions, and the existing items 1 to 10 untouched.

- [ ] **Step 5: Commit**

```bash
git add docs/build-notes.md
git commit -m "Two missing checklist items, either of which takes the whole site down

The pre-deploy checklist read as complete and was missing both Supabase
connection settings and the switch that lets anyone have a session at all.
Without the first, every page fails on the first request. Without the
second, a founder finishes the entire onboarding wizard and is told the
session could not be created, forever, and so is everyone who opens the
invite link.

The timing detail is the reason this is a checklist item and not a
troubleshooting note: the two connection settings are baked in when the
site is built, so setting them after a successful build changes nothing
until the next one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Read all 14 migration files and report

**Files:**
- Read: all 14 `prisma/migrations/*/migration.sql`, plus `prisma/migrations/migration_lock.toml`
- Create: `docs/audits/findings/2026-08-23-migration-read.md`
- Test: none. This task reports; it does not fix.

**Interfaces:**
- Consumes: nothing.
- Produces: a written report that slice B reads before running `prisma migrate deploy` against the production database.

**The gap.** The audit's completeness critic found that not one of the 14 migration SQL files was opened by any lane, and 13 of 14 are not mentioned anywhere in any lane file in any form. Lane 7 audited the *checklist's list of* migrations without opening one. The critic ran a cheap drift check (every schema column appears in the SQL, enums intact) and said plainly that nobody proved the production database can be built from this history alone. Slice B answers that for real, against the empty production database. This task is the read that makes going in there informed rather than hopeful.

**Do not fix anything.** If something looks wrong, write it down. A finding becomes its own decision, in slice B or in the triage session.

- [ ] **Step 1: Read all 14 in chronological order**

```bash
for d in prisma/migrations/*/; do echo "=== $d ==="; cat "$d/migration.sql"; done
```

- [ ] **Step 2: Answer each of these six questions in writing**

1. **Anything destructive or order-dependent** that would behave differently against an empty database than against the dev-test one it was authored on. A `DROP`, an `ALTER ... SET NOT NULL` on a populated table, a backfill `UPDATE`.
2. **Enum values added or renamed**, and whether any migration assumes rows already exist. Postgres has historically restricted adding an enum value inside a transaction; note any migration where that could bite.
3. **`migration_lock.toml`'s provider** versus the production database. Expected `postgresql`.
4. **Any migration hand-edited after generation.** Look for SQL that Prisma's generator would not emit in that shape, or comments.
5. **Whether the checklist's named migrations are the complete set.** The checklist names four by name (items 5, 7, 8, 10) and the directory holds 14. Establish whether that gap is expected (the checklist calls out only the ones with a stated failure mode, and `migrate deploy` applies all of them regardless) or whether the list has fallen behind. State which, plainly.
6. **Whether `migrate deploy` is the right command** for a database with no `_prisma_migrations` table yet, versus `migrate dev`. Slice B needs the exact command, and `migrate dev` must never be pointed at production.

- [ ] **Step 3: Write the report**

Create `docs/audits/findings/2026-08-23-migration-read.md`. Structure: what was read, the six answers, then anything that should become a checklist item. Open it with a line stating plainly that **nothing was executed**: this is a read, the run is slice B's, and a read is not a run.

- [ ] **Step 4: If anything is load-bearing for the deploy, add it to the checklist**

Only if step 2 turned something up. Same house style as task 8, with its own correction line noting the new count.

- [ ] **Step 5: Commit**

```bash
git add docs/audits/findings/2026-08-23-migration-read.md docs/build-notes.md
git commit -m "Somebody finally opened the fourteen database setup files

The pre-launch audit read the whole repo and not one of its seven lanes
opened a single migration. Its own critic caught that and said plainly
that nobody had established the real database can be built from this
history alone.

This is the read, not the run. Applying them to the production database is
the next slice, and this exists so that goes in informed rather than
hopeful.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Closing the slice

- [ ] Full suite green. Report before (92 files / 935 tests) and after numbers.
- [ ] `npm run build` exit 0.
- [ ] `npm audit --omit=dev` before and after counts recorded.
- [ ] Independent read-only code review; its report goes in the PR body.
- [ ] `docs/build-notes.md` §11 entry for the slice, recording what it decided, including the two premises it corrected mid-flight: the invite-token fix needs no migration (proven by an empty schema diff), and the cron fix is a body extraction rather than a one-line change, because the most likely failure sat outside the existing guard.
- [ ] Update CLAUDE.md's "Where the build is" section to say what is now true.
- [ ] PR body near 300 words, four parts, per the standing rule. It must state that the link preview is written and unproven, and that nothing here establishes the app boots in production or that a second viewer's screen updates.
- [ ] A five-minute manual QA script in the chat message, phone-first, with the dev server command in a fenced `bash` block for the owner to start himself and the LAN address read fresh.
- [ ] Propose the next slice unprompted: slice B (the deploy), then email sign-in.
