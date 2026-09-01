# Site Health Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product able to report that it is broken, by having the hourly cron run a read-only self-check over the data a signed-in screen depends on and report the verdict to Better Stack as a heartbeat.

**Architecture:** Two small modules and one wiring change. `runHealthCheck` walks an ordered list of read-only probes and returns a verdict, never throwing. `reportHealth` POSTs that verdict to a Better Stack heartbeat URL — the base URL when healthy, `<url>/fail` with the reason in the body when not. The existing `/api/cron/orbit` route calls both after its four sweeps. Nothing arriving at all is itself the alarm, which is what covers a dead deploy, a stopped cron, and the free-tier database pause.

**Tech Stack:** Next.js 16 route handler, Prisma 7 (pg driver adapter), Vitest 4, native `fetch` and `AbortSignal.timeout`. Better Stack heartbeats (free tier) as the external alarm.

**Spec:** `docs/superpowers/specs/2026-09-01-site-health-monitoring-design.md`. Read it before Task 1; it carries the reasoning this plan only summarises.

## Global Constraints

- **No new npm package.** `node_modules` is shared with a concurrent worktree. If a task seems to need one, stop and raise it.
- **No database migration.** One new env var (`HEALTH_HEARTBEAT_URL`) is the only deploy obligation.
- **Every probe is a read.** Nothing in this slice writes to the database. A concurrent worktree is running phone QA against the same dev-test database.
- **No raw SQL anywhere.** `src/app/__tests__/no-email-address-on-screen.test.tsx` asserts this repo-wide with an allowlist naming exactly one file (`scripts/qa-stage-email.ts`). Reddening that guard is a decision for the owner, never a test to adjust.
- **Run `npm run db:which` before anything that touches the database.** It must print `DEV-TEST` and the ref `pxbewardwvoyqqcvogel`.
- **Test baseline: 128 files / 1388 tests, all passing, zero skipped.** Taken on this branch at 11:43, 1 Sept 2026. Any failure you see that is not yours is a regression — stop and report it, do not fix it silently.
- **No em dashes in any user-facing copy.** Product-voice rule. (Code comments and commit messages are exempt.)
- **`now` is always passed in, never read from `Date.now()` inside a library function.** House idiom, matching `runDailyDigest` and `reconcileScheduledEvents`.
- **Commit after every task.** Co-author trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/health/check.ts` (create) | The verdict type, the probe runner, `describeError`, and the real probes. One file because the probes are meaningless without the runner and nothing else consumes either. |
| `src/lib/health/heartbeat.ts` (create) | The only place the app talks to Better Stack. Knows nothing about what a probe is. |
| `src/lib/health/__tests__/check.test.ts` (create) | Runner and `describeError` behaviour, with injected probes. No database. |
| `src/lib/health/__tests__/heartbeat.test.ts` (create) | Every heartbeat outcome, with `fetch` stubbed. No network. |
| `src/app/api/cron/orbit/route.ts` (modify) | Composes the sweep result and the health verdict into one report. |
| `src/app/api/cron/orbit/__tests__/route.test.ts` (create) | The composition rules, with sweeps and heartbeat mocked. |
| `scripts/qa-health.ts` (create) | Hand-run proof against a real database. Deliberately outside the test runner. |
| `package.json` (modify) | Adds `qa:health`. |
| `docs/build-notes.md`, `CLAUDE.md` (modify) | The record and the deploy obligations. |

---

### Task 1: The verdict, the runner, and `describeError`

**Files:**
- Create: `src/lib/health/check.ts`
- Test: `src/lib/health/__tests__/check.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type HealthStep = "user_row" | "membership_row" | "group_home_data" | "orbit_sweeps"`
  - `type HealthVerdict = { ok: true; ranSteps: HealthStep[]; skipped: HealthStep[] } | { ok: false; failedStep: HealthStep; detail: string }`
  - `interface Probe { name: HealthStep; run: () => Promise<void | "skip"> }`
  - `function describeError(err: unknown): string`
  - `async function runHealthCheck(now: Date, probes?: Probe[]): Promise<HealthVerdict>`

**Note on `orbit_sweeps`:** it is a step name but never a probe. Task 4's route produces it when the sweeps themselves throw. `realProbes` (Task 3) must never return it. One union rather than two is deliberate: the heartbeat body then has a single vocabulary, so the owner reads the same kind of sentence whatever failed.

**In Task 1 the default `probes` parameter does not exist yet.** Declare the parameter as required for now; Task 3 adds `= realProbes(now)`. Every test here injects its own probes.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/health/__tests__/check.test.ts`:

```ts
// src/lib/health/__tests__/check.test.ts
//
// Pure: no database, no network. Every probe here is injected, which is what
// lets these tests assert the runner's contract rather than the schema's.
// The real probes are deliberately untested — see the comment above
// realProbes in check.ts for why.

import { describe, it, expect, vi } from "vitest"
import { runHealthCheck, describeError, type Probe } from "../check"

function ok(name: Probe["name"]): Probe {
  return { name, run: async () => {} }
}

describe("runHealthCheck", () => {
  it("reports ok and lists the steps it ran, in order", async () => {
    const verdict = await runHealthCheck(new Date(), [ok("user_row"), ok("membership_row")])

    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error("unreachable")
    expect(verdict.ranSteps).toEqual(["user_row", "membership_row"])
    expect(verdict.skipped).toEqual([])
  })

  it("names the probe that threw, and nothing about the ones that passed", async () => {
    const verdict = await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "membership_row", run: async () => { throw new Error("column does not exist") } },
    ])

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.failedStep).toBe("membership_row")
    expect(verdict.detail).toContain("column does not exist")
    expect(verdict.detail).not.toContain("user_row")
  })

  it("stops at the first failure so a later probe never runs", async () => {
    const third = vi.fn(async () => {})

    await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "membership_row", run: async () => { throw new Error("boom") } },
      { name: "group_home_data", run: third },
    ])

    expect(third).not.toHaveBeenCalled()
  })

  it("records a skipped probe without failing the run", async () => {
    const verdict = await runHealthCheck(new Date(), [
      ok("user_row"),
      { name: "group_home_data", run: async () => "skip" as const },
    ])

    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error("unreachable")
    expect(verdict.ranSteps).toEqual(["user_row"])
    expect(verdict.skipped).toEqual(["group_home_data"])
  })

  it("survives a probe that rejects with something that is not an Error", async () => {
    const verdict = await runHealthCheck(new Date(), [
      { name: "user_row", run: async () => { throw "just a string" } },
    ])

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.detail).toContain("just a string")
  })
})

describe("describeError", () => {
  it("names the error class and its message", () => {
    expect(describeError(new TypeError("nope"))).toBe("TypeError: nope")
  })

  it("truncates at 500 characters, because this string is sent off the machine", () => {
    expect(describeError(new Error("x".repeat(600))).length).toBe(500)
  })

  it("handles a thrown non-Error without throwing itself", () => {
    expect(describeError(undefined)).toContain("undefined")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/health/__tests__/check.test.ts`
Expected: FAIL — cannot resolve `../check`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/health/check.ts`:

```ts
// src/lib/health/check.ts
//
// The product's answer to a question it could not answer for four days in
// August 2026: is the app actually working for a signed-in member?
//
// The shape of that outage is what this file is built around. A logged-out
// visitor saw a healthy site the entire time, because getCurrentUser()
// (src/lib/auth/current-user.ts:20) returns early before its database call
// when there is no session. A member reached that call on every page, where
// an unselected `User` read named a column two missing migrations had never
// created. So an uptime ping would have read green for four days.
//
// Nothing here writes. Every probe is a read, deliberately, so this is safe
// to run against a database somebody else is testing against.

export type HealthStep =
  | "user_row"
  | "membership_row"
  | "group_home_data"
  /** Produced by the cron route when the sweeps themselves throw, never by a
   *  probe. One vocabulary for both, so the heartbeat body reads the same way
   *  whatever failed. */
  | "orbit_sweeps"

export type HealthVerdict =
  | { ok: true; ranSteps: HealthStep[]; skipped: HealthStep[] }
  | { ok: false; failedStep: HealthStep; detail: string }

export interface Probe {
  name: HealthStep
  /** Resolves when healthy. Resolves to "skip" when there is nothing to check. */
  run: () => Promise<void | "skip">
}

const DETAIL_MAX = 500

/**
 * Turn a thrown value into the string that gets sent to Better Stack.
 *
 * This is a privacy boundary, not a formatting helper. It carries the error's
 * class and message and nothing else: never a query result, never a row. It
 * is not an absolute guarantee, and the caveat is the same one
 * src/lib/email/send.ts already carries for Resend: a Prisma
 * unique-constraint error can echo an offending value into its own message.
 * Our code never puts a value into this string itself; the residual risk
 * lives entirely in the database driver's own error text.
 */
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err
  const message = err instanceof Error ? err.message : String(err)
  return `${name}: ${message}`.slice(0, DETAIL_MAX)
}

/**
 * Run probes in order, stopping at the first failure.
 *
 * Order is load-bearing: user_row is the cheapest and the most diagnostic, so
 * a schema break names itself instead of surfacing three probes later as a
 * confusing group-data failure.
 *
 * This function never throws. A monitoring tool that can crash is worse than
 * no monitoring tool, because its silence reads as health.
 *
 * @param now  The reference instant, passed explicitly so callers own the
 *             clock, matching runDailyDigest and reconcileScheduledEvents.
 */
export async function runHealthCheck(
  now: Date,
  probes: Probe[]
): Promise<HealthVerdict> {
  const ranSteps: HealthStep[] = []
  const skipped: HealthStep[] = []

  for (const probe of probes) {
    try {
      const outcome = await probe.run()
      if (outcome === "skip") skipped.push(probe.name)
      else ranSteps.push(probe.name)
    } catch (err) {
      return { ok: false, failedStep: probe.name, detail: describeError(err) }
    }
  }

  return { ok: true, ranSteps, skipped }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/health/__tests__/check.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`now` is unused in `runHealthCheck` at this stage; that is fine, it is a parameter, not a local.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/health/check.ts src/lib/health/__tests__/check.test.ts
git commit -m "Add the health verdict and the probe runner

The runner never throws, because a monitor that can crash reports its own
failure as silence, and silence is what the four-day outage already looked
like.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The heartbeat

**Files:**
- Create: `src/lib/health/heartbeat.ts`
- Test: `src/lib/health/__tests__/heartbeat.test.ts`

**Interfaces:**
- Consumes: `HealthVerdict` from `src/lib/health/check.ts` (Task 1).
- Produces:
  - `type HeartbeatOutcome = "reported_ok" | "reported_failure" | "not_configured" | "unreachable"`
  - `async function reportHealth(verdict: HealthVerdict): Promise<HeartbeatOutcome>`

**Better Stack's contract, verified in their docs on 1 Sept 2026:** the heartbeat URL is `https://uptime.betterstack.com/api/v1/heartbeat/<token>`. Appending `/fail` reports an explicit failure and raises the incident immediately rather than waiting for the grace period. A request body is accepted and shown on the incident, which is what turns "your site is down" into "your site is down because `user_row` threw ...".

- [ ] **Step 1: Write the failing tests**

Create `src/lib/health/__tests__/heartbeat.test.ts`:

```ts
// src/lib/health/__tests__/heartbeat.test.ts
//
// fetch is stubbed throughout: nothing here reaches the network. The one
// thing these tests cannot prove is that Better Stack actually raises an
// incident, which is why scripts/qa-health.ts has a --ping mode the owner
// runs by hand against a real monitor.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { reportHealth } from "../heartbeat"
import type { HealthVerdict } from "../check"

const HEALTHY: HealthVerdict = { ok: true, ranSteps: ["user_row"], skipped: [] }
const BROKEN: HealthVerdict = {
  ok: false,
  failedStep: "user_row",
  detail: "PrismaClientKnownRequestError: The column User.digestOptOutAt does not exist",
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("reportHealth", () => {
  it("does nothing at all when no heartbeat URL is configured", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "")

    expect(await reportHealth(HEALTHY)).toBe("not_configured")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("pings the base URL when healthy", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    expect(await reportHealth(HEALTHY)).toBe("reported_ok")
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://uptime.betterstack.com/api/v1/heartbeat/tok"
    )
  })

  it("pings /fail with the reason in the body when broken", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    expect(await reportHealth(BROKEN)).toBe("reported_failure")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://uptime.betterstack.com/api/v1/heartbeat/tok/fail")
    expect(init.body).toContain("user_row")
    expect(init.body).toContain("digestOptOutAt")
  })

  it("does not produce a double slash when the configured URL has a trailing one", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok/")

    await reportHealth(BROKEN)

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://uptime.betterstack.com/api/v1/heartbeat/tok/fail"
    )
  })

  it("passes an abort signal, so a hanging monitor cannot hang the cron", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")

    await reportHealth(HEALTHY)

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it("reports unreachable rather than throwing when the request rejects", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")
    fetchMock.mockRejectedValueOnce(new Error("network down"))

    await expect(reportHealth(HEALTHY)).resolves.toBe("unreachable")
  })

  it("reports unreachable on a non-2xx response", async () => {
    vi.stubEnv("HEALTH_HEARTBEAT_URL", "https://uptime.betterstack.com/api/v1/heartbeat/tok")
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    expect(await reportHealth(HEALTHY)).toBe("unreachable")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/health/__tests__/heartbeat.test.ts`
Expected: FAIL — cannot resolve `../heartbeat`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/health/heartbeat.ts`:

```ts
// src/lib/health/heartbeat.ts
//
// The one place the app talks to Better Stack, and the deliberate sibling of
// src/lib/email/send.ts: one seam per external service, and the product
// decides what the service's reply means exactly once, here.
//
// Why an outside service rather than an email from Orbit. Two reasons, both
// load-bearing. An alarm that runs inside the thing it is watching goes
// quiet exactly when the thing dies, and quiet is indistinguishable from
// healthy: that is the four-day outage repeated one level up. And the noise
// budget the owner asked for (immediate, then every six hours, then an
// automatic all-clear) needs somewhere to remember what it already said,
// which this app has nowhere to keep without a migration. Better Stack owns
// both problems, so neither one lives in this codebase.
//
// The missing ping IS the alarm. Better Stack raises an incident when no
// heartbeat arrives within the configured period plus grace, which is why
// failing to reach it is safe rather than a hole.

import type { HealthVerdict } from "./check"

export type HeartbeatOutcome =
  | "reported_ok"
  | "reported_failure"
  /** No URL configured. A success, never an error: local and preview builds
   *  are meant to be silent. */
  | "not_configured"
  | "unreachable"

/**
 * The sweeps above this call in the cron have already done their work and
 * their results are owed to the response, so a monitor that stops answering
 * must never hold them up.
 */
const TIMEOUT_MS = 5_000

export async function reportHealth(verdict: HealthVerdict): Promise<HeartbeatOutcome> {
  const configured = process.env.HEALTH_HEARTBEAT_URL?.trim()
  if (!configured) {
    console.info("[health] HEALTH_HEARTBEAT_URL is not set, so no heartbeat was sent.")
    return "not_configured"
  }

  const base = configured.replace(/\/+$/, "")
  const url = verdict.ok ? base : `${base}/fail`
  const body = verdict.ok ? undefined : `${verdict.failedStep}: ${verdict.detail}`

  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.error("[health] the heartbeat was refused:", response.status)
      return "unreachable"
    }

    return verdict.ok ? "reported_ok" : "reported_failure"
  } catch (err) {
    // Deliberately not rethrown. Not reaching Better Stack is safe by
    // construction: the absent ping raises the incident on its own.
    console.error("[health] the heartbeat could not be sent:", err)
    return "unreachable"
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/health/__tests__/heartbeat.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/health/heartbeat.ts src/lib/health/__tests__/heartbeat.test.ts
git commit -m "Report the verdict to Better Stack instead of emailing it

The alarm has to live outside the thing it watches, or it goes quiet exactly
when the product dies. Better Stack also owns the repeat cadence and the
all-clear, so no alert state has to live in a database this slice is not
allowed to migrate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The real probes, and the hand-run script that is their only evidence

**Files:**
- Modify: `src/lib/health/check.ts` (add `realProbes`, make it the default `probes` argument)
- Create: `scripts/qa-health.ts`
- Modify: `package.json` (add the `qa:health` script)

**Interfaces:**
- Consumes: `runHealthCheck`, `Probe`, `HealthVerdict` (Task 1); `reportHealth` (Task 2).
- Produces:
  - `function realProbes(now: Date, client?: PrismaClient): Probe[]`
  - `runHealthCheck`'s `probes` parameter becomes optional, defaulting to `realProbes(now)`.

**This task has no unit tests, and that is the slice's central verification decision.** A test for these probes must mock Prisma, and mocking Prisma removes the only thing being checked: whether the real query matches the real database. That is exactly the trap the message-send-latency slice fell into, where a component test passed against mocked server actions while the browser disagreed, and the test was deleted rather than kept. The evidence for this task is the script, run against a real database, with its output pasted into the task's completion note.

- [ ] **Step 1: Confirm the database target before anything else**

Run: `npm run db:which`
Expected: `DEV-TEST (expected). Project ref pxbewardwvoyqqcvogel matches on all three sources.` and exit 0. **If it prints anything else, stop and report it.**

- [ ] **Step 2: Add the real probes to `check.ts`**

Add these imports at the top of `src/lib/health/check.ts`:

```ts
import { PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { findUpcomingEvents } from "@/lib/events/upcoming-list"
import { findLiveGauges } from "@/lib/gauges/read"
import { findLiveProposals } from "@/lib/proposals/read"
import { loadEmailAskInputs } from "@/lib/auth/email-ask"
import { CARD_REGION_CAP } from "@/lib/cards/region"
```

Change the `runHealthCheck` signature so the probes default:

```ts
export async function runHealthCheck(
  now: Date,
  probes: Probe[] = realProbes(now)
): Promise<HealthVerdict> {
```

Then append to the file:

```ts
/**
 * The probes, in the order they run.
 *
 * DELIBERATELY UNTESTED, and this is a decision rather than an omission. A
 * test for these must mock Prisma, and mocking Prisma removes the only thing
 * being checked: whether the real query still matches the real database.
 * The message-send-latency slice already paid for this lesson, where a
 * component test passed against mocked server actions while the browser
 * disagreed, and the test was deleted rather than kept. The evidence for
 * this function is scripts/qa-health.ts, run against a real database.
 *
 * @param client  Injectable so scripts/qa-health.ts --break can point the
 *                probes at an unreachable database and prove the failure
 *                path without damaging a real one.
 */
export function realProbes(now: Date, client: PrismaClient = prisma): Probe[] {
  return [
    {
      name: "user_row",
      run: async () => {
        // NO `select`, NO `include`. THIS IS LOAD-BEARING.
        //
        // Adding a select here silently disables the only check that would
        // have caught the four-day outage of 28-31 August 2026. The whole
        // point is that this query names every column on User, exactly as
        // getCurrentUser() does at src/lib/auth/current-user.ts:20, and as
        // four other call sites do independently (gauge-vote.ts:73,
        // proposal-vote.ts:62, proposal-answer.ts:51, rsvp.ts:43). One probe
        // covers all five, because they are the same query shape.
        //
        // A null result is HEALTHY. The SQL still ran and still named every
        // column, which is what is being proven. An empty table is not
        // evidence of breakage, and a probe must never invent an alarm.
        await client.user.findFirst()
      },
    },
    {
      name: "membership_row",
      run: async () => {
        // Same rules, same reasoning: the other missing migration
        // (lastSeenAt, lastDigestSentAt) landed on this table.
        await client.membership.findFirst()
      },
    },
    {
      name: "group_home_data",
      run: () => probeGroupHomeData(now, client),
    },
  ]
}

/**
 * Exercise the group home's own database reads against the most recently
 * active group.
 *
 * Most recently active means the group holding the newest message. Chosen
 * over a pinned group id because it always exercises something real, needs
 * no configuration, and cannot break when a group is deleted.
 *
 * The library functions are CALLED, not copied. That is the point: if the
 * group home changes and this does not, the build breaks loudly rather than
 * this check going quietly stale.
 *
 * Pure functions the page also uses (deriveRoster, deriveIdeaItems,
 * composeCardRegion) are deliberately absent. They touch no database, so
 * they cannot break from schema drift, and the Vercel log drain watching for
 * real 500s is what covers them.
 */
async function probeGroupHomeData(
  now: Date,
  client: PrismaClient
): Promise<void | "skip"> {
  const newest = await client.message.findFirst({
    orderBy: { createdAt: "desc" },
    select: { groupId: true },
  })
  const groupId =
    newest?.groupId ?? (await client.group.findFirst({ select: { id: true } }))?.id

  // An empty database is not a broken one.
  if (!groupId) return "skip"

  const group = await client.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  })
  if (!group) return "skip"

  const events = await findUpcomingEvents(group.id, now, CARD_REGION_CAP)
  if (events[0]) {
    await client.rsvp.findMany({ where: { eventId: events[0].id } })
  }

  // One deliberate divergence from the page, and it needs saying: the page's
  // message read is unbounded, this one takes 50. That unboundedness is
  // registered debt (message-send-latency slice two) and re-running it every
  // hour would compound a known problem. The column set and the author join
  // are identical, and columns are what this probe proves.
  await client.message.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
    take: 50,
  })

  await findLiveGauges(group.id, now)
  await findLiveProposals(group.id, now)

  const firstMember = group.memberships[0]
  if (firstMember) {
    await loadEmailAskInputs({ userId: firstMember.userId, groupId: group.id })
  }
}
```

- [ ] **Step 3: Confirm the existing tests still pass**

Run: `npx vitest run src/lib/health/`
Expected: PASS, 15 tests. The Task 1 tests all inject their own probes, so the new default must not change any of them.

- [ ] **Step 4: Write the hand-run script**

Create `scripts/qa-health.ts`:

```ts
// scripts/qa-health.ts
//
// Hand-run proof for the health check. Deliberately outside the test runner,
// like scripts/eval-detect.ts and scripts/measure-group-home.ts, and for the
// same reason: it needs a real database, and the suite must never depend on
// rows that happen to exist.
//
// This script IS the evidence for realProbes(), which has no unit tests on
// purpose. See the comment above realProbes in src/lib/health/check.ts.
//
//   npm run qa:health            healthy path, against the real dev-test database
//   npm run qa:health -- --break failure path, against an unreachable database
//   npm run qa:health -- --ping  sends a real heartbeat to HEALTH_HEARTBEAT_URL
//
// --break points the probes at a valid-shaped URL on a closed port. Two
// alternatives were rejected and should not be swapped back in:
//
//   Raw SQL asking for a column that does not exist would reproduce the
//   outage's exact P2022 error, and would redden the repo-wide raw-SQL
//   assertion in src/app/__tests__/no-email-address-on-screen.test.tsx,
//   whose allowlist names exactly one file. That guard reddening is by its
//   own rule a decision for the owner, not a test to adjust.
//
//   Altering the shared dev-test database is out, because a concurrent
//   worktree runs phone QA against it.
//
// The accepted limit, stated rather than glossed: an unreachable database
// produces a connection error, not P2022. This proves the check catches a
// broken database and reports it correctly. It does not reproduce the
// missing-column error specifically.

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { runHealthCheck, realProbes, type HealthVerdict } from "../src/lib/health/check"
import { reportHealth } from "../src/lib/health/heartbeat"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

/** Valid-shaped, resolvable, and nothing is listening. Fails fast. */
const UNREACHABLE = "postgresql://nobody:nobody@127.0.0.1:1/none"

/**
 * Every QA script in this repo guards its own database target rather than
 * trusting the runner to have checked (CLAUDE.md, "Two databases, never
 * crossed"). Copied from scripts/qa-stage-latency.ts so all of them fail the
 * same way.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error("STOP: this checkout is NOT confirmed to be dev-test.")
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error("Run npm run db:which and resolve it before running this script.")
  process.exit(1)
}

function print(label: string, verdict: HealthVerdict) {
  console.log(`\n─── ${label} ─────────────────────────────`)
  if (verdict.ok) {
    console.log("  verdict : HEALTHY")
    console.log(`  ran     : ${verdict.ranSteps.join(", ") || "(none)"}`)
    console.log(`  skipped : ${verdict.skipped.join(", ") || "(none)"}`)
  } else {
    console.log("  verdict : BROKEN")
    console.log(`  step    : ${verdict.failedStep}`)
    console.log(`  detail  : ${verdict.detail}`)
  }
}

async function main() {
  requireDevTest()

  const args = process.argv.slice(2)
  const now = new Date()

  if (args.includes("--break")) {
    const adapter = new PrismaPg({ connectionString: UNREACHABLE, max: 1 })
    const broken = new PrismaClient({ adapter })
    // Only user_row has to fail: the runner stops at the first failure, which
    // is the behaviour being demonstrated.
    const verdict = await runHealthCheck(now, realProbes(now, broken))
    print("--break (unreachable database)", verdict)
    await broken.$disconnect()

    if (verdict.ok) {
      console.error("\nFAILED: an unreachable database reported healthy.")
      process.exit(1)
    }
    if (args.includes("--ping")) {
      console.log(`  heartbeat: ${await reportHealth(verdict)}`)
    }
    return
  }

  const verdict = await runHealthCheck(now, realProbes(now))
  print("real dev-test database", verdict)

  if (args.includes("--ping")) {
    console.log(`  heartbeat: ${await reportHealth(verdict)}`)
  }

  if (!verdict.ok) process.exit(1)
}

main()
  .catch((err) => {
    console.error("qa-health threw, which runHealthCheck should make impossible:", err)
    process.exit(1)
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma")
    await prisma.$disconnect()
  })
```

- [ ] **Step 5: Register the script**

In `package.json`, add to `"scripts"`, directly after the `"digest:test"` line:

```json
    "qa:health": "tsx --env-file=.env scripts/qa-health.ts",
```

- [ ] **Step 6: Run the healthy path and capture the output**

Run: `npm run qa:health`
Expected: `verdict : HEALTHY`, with `ran` listing `user_row, membership_row` and either `group_home_data` in `ran` or in `skipped` depending on whether dev-test holds a group.

**Paste the real output into the task completion note.** This is the evidence for Task 3, not a formality.

- [ ] **Step 7: Run the failure path and capture the output**

Run: `npm run qa:health -- --break`
Expected: `verdict : BROKEN`, `step : user_row`, and a `detail` naming a connection error. Exit code 0 (the script exits 1 only when a break reports healthy).

**Paste the real output into the task completion note.**

- [ ] **Step 8: Confirm the database target did not move**

Run: `npm run db:which`
Expected: `DEV-TEST`. The `--break` run constructs its own client and must not have disturbed anything.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/health scripts/qa-health.ts`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/health/check.ts scripts/qa-health.ts package.json
git commit -m "Probe the reads a signed-in screen actually depends on

The first probe reads a whole User row with no select, which is the exact
query that died for four days while the front door stayed green. Its comment
says so, because a later tidy-up adding a select would remove the value and
leave the code.

The probes have no unit tests on purpose: mocking Prisma removes the only
thing they check. scripts/qa-health.ts is their evidence, and it proves the
failure path against an unreachable database rather than by damaging a real
one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire it into the hourly cron

**Files:**
- Modify: `src/app/api/cron/orbit/route.ts`
- Test: `src/app/api/cron/orbit/__tests__/route.test.ts` (create)

**Interfaces:**
- Consumes: `runHealthCheck`, `describeError`, `HealthVerdict` (Tasks 1 and 3); `reportHealth` (Task 2).
- Produces: nothing further tasks depend on.

**Three properties to preserve, each a decision rather than an accident:**
1. **The 401 paths return before any of this.** An unauthorized caller must never reach the heartbeat, or anyone holding the URL could forge a green light.
2. **The digest keeps its own nested try/catch.** A digest failure still must not cost the three sweeps their results, and it deliberately does not raise a health alarm: the digest is a fail-soft nicety, not the site being down.
3. **The 500 response stays.** It is what Vercel's own logs and the coming log drain key on.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cron/orbit/__tests__/route.test.ts`:

```ts
// src/app/api/cron/orbit/__tests__/route.test.ts
//
// Composition only. The four sweeps, the health check and the heartbeat are
// all mocked, because what is being proven here is which verdict the route
// reports in each combination, not what any of them does. The probes' own
// evidence is scripts/qa-health.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/orbit/reconcile", () => ({ reconcileScheduledEvents: vi.fn(async () => []) }))
vi.mock("@/lib/orbit/endgame", () => ({ runGaugeEndgame: vi.fn(async () => []) }))
vi.mock("@/lib/proposals/endgame", () => ({ runProposalEndgame: vi.fn(async () => []) }))
vi.mock("@/lib/digest/run", () => ({ runDailyDigest: vi.fn(async () => []) }))
vi.mock("@/lib/health/heartbeat", () => ({ reportHealth: vi.fn(async () => "reported_ok") }))
vi.mock("@/lib/health/check", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/health/check")>()),
  runHealthCheck: vi.fn(),
}))

import { GET } from "../route"
import { runHealthCheck } from "@/lib/health/check"
import { reportHealth } from "@/lib/health/heartbeat"
import { reconcileScheduledEvents } from "@/lib/orbit/reconcile"
import { runDailyDigest } from "@/lib/digest/run"

const HEALTHY = { ok: true as const, ranSteps: [], skipped: [] }
const BROKEN = { ok: false as const, failedStep: "user_row" as const, detail: "P2022" }

function call() {
  return GET(new NextRequest("http://localhost:3000/api/cron/orbit"))
}

beforeEach(() => {
  vi.mocked(runHealthCheck).mockResolvedValue(HEALTHY)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("the orbit cron's health report", () => {
  it("reports a healthy verdict when everything works", async () => {
    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(HEALTHY)
  })

  it("reports orbit_sweeps when a sweep throws, and still answers 500", async () => {
    vi.mocked(reconcileScheduledEvents).mockRejectedValueOnce(new Error("sweep exploded"))

    const response = await call()

    expect(response.status).toBe(500)
    const reported = vi.mocked(reportHealth).mock.calls[0][0]
    expect(reported.ok).toBe(false)
    if (reported.ok) throw new Error("unreachable")
    expect(reported.failedStep).toBe("orbit_sweeps")
    expect(reported.detail).toContain("sweep exploded")
  })

  it("reports the root cause, not the symptom, when both the data path and the sweeps are broken", async () => {
    // When the data path is broken the sweeps fail too. Naming orbit_sweeps
    // here would bury the actual cause, which is the easiest rule to regress.
    vi.mocked(reconcileScheduledEvents).mockRejectedValueOnce(new Error("sweep exploded"))
    vi.mocked(runHealthCheck).mockResolvedValue(BROKEN)

    await call()

    const reported = vi.mocked(reportHealth).mock.calls[0][0]
    expect(reported).toEqual(BROKEN)
  })

  it("reports a broken data path but still answers 200, because the cron did its job", async () => {
    vi.mocked(runHealthCheck).mockResolvedValue(BROKEN)

    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(BROKEN)
  })

  it("treats a digest failure as fail-soft and still reports healthy", async () => {
    vi.mocked(runDailyDigest).mockRejectedValueOnce(new Error("digest exploded"))

    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(reportHealth).mock.calls[0][0]).toEqual(HEALTHY)
  })

  it("never lets an unauthorized caller touch the heartbeat", async () => {
    // Otherwise anyone holding the URL could forge a green light.
    vi.stubEnv("CRON_SECRET", "a-secret")

    const response = await call()

    expect(response.status).toBe(401)
    expect(reportHealth).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/cron/orbit/__tests__/route.test.ts`
Expected: FAIL — cannot resolve `@/lib/health/heartbeat` in the route, and `reportHealth` is never called.

- [ ] **Step 3: Rewrite the handler body**

In `src/app/api/cron/orbit/route.ts`, add to the imports:

```ts
import { runHealthCheck, describeError, type HealthVerdict } from "@/lib/health/check"
import { reportHealth } from "@/lib/health/heartbeat"
```

Replace the whole `try { ... } catch { ... }` block at the end of `GET` (everything after the auth gate) with:

```ts
  // Declared out here so the heartbeat below can report on them whether or
  // not the sweeps threw. The Awaited<ReturnType<>> forms mean this file
  // never has to restate the sweeps' own result shapes.
  let results: Awaited<ReturnType<typeof reconcileScheduledEvents>> | undefined
  let endgame: Awaited<ReturnType<typeof runGaugeEndgame>> | undefined
  let proposalEndgame: Awaited<ReturnType<typeof runProposalEndgame>> | undefined
  let digest: DigestRunResult[] = []
  let sweepFailure: string | null = null

  try {
    results = await reconcileScheduledEvents(new Date())
    endgame = await runGaugeEndgame(new Date())
    proposalEndgame = await runProposalEndgame(new Date())

    // Own try/catch: a digest bug must never take down the response carrying
    // the three sweeps above, which already succeeded this hour. It also
    // deliberately raises no health alarm. The digest is a fail-soft nicety;
    // its absence is not the site being down.
    try {
      digest = await runDailyDigest(new Date())
    } catch (err) {
      console.error("[orbit-cron] digest step failed:", err)
    }
  } catch (err) {
    sweepFailure = describeError(err)
    console.error("[orbit-cron] sweep failed:", err)
  }

  const health = await runHealthCheck(new Date())

  // Root cause wins. When the data path is broken the sweeps fail too, so
  // reporting orbit_sweeps here would name the symptom and bury the cause.
  const verdict: HealthVerdict = !health.ok
    ? health
    : sweepFailure
      ? { ok: false, failedStep: "orbit_sweeps", detail: sweepFailure }
      : health

  await reportHealth(verdict)

  if (sweepFailure) return new Response("Internal Server Error", { status: 500 })

  return Response.json({ ok: true, results, endgame, proposalEndgame, digest, health: verdict })
```

Then update the file's header comment: the existing block describes four steps, and there are now five. Add a paragraph in the same voice explaining that the health check runs last and reports to Better Stack, and that a broken data path answers 200 because the cron itself did its job while the alarm is Better Stack's to raise.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/cron/orbit/__tests__/route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove test 3 could have failed**

The root-cause rule is the one a future edit is most likely to reverse, so confirm the test can see it. Temporarily flip the ternary in the route so `sweepFailure` is checked first:

```ts
  const verdict: HealthVerdict = sweepFailure
    ? { ok: false, failedStep: "orbit_sweeps", detail: sweepFailure }
    : health
```

Run: `npx vitest run src/app/api/cron/orbit/__tests__/route.test.ts`
Expected: FAIL on "reports the root cause, not the symptom". **Then revert the flip** and re-run to confirm PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: **131 files / 1409 tests** passing, zero skipped. (Baseline 128/1388, plus this slice's 3 new test files carrying 8 + 7 + 6 = 21 tests.) Any other failure is a regression — stop and report it, do not fix it.

If the real numbers differ, **report the real ones**; do not adjust a test to reach the predicted figure. The prediction is arithmetic done before the code existed, and this project has been burned by records claiming a proof that never happened.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/cron/orbit src/lib/health`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/orbit/route.ts src/app/api/cron/orbit/__tests__/route.test.ts
git commit -m "Report the hourly job's own health as a fifth step

A broken data path still answers 200, because the cron did its job and the
alarm belongs to Better Stack rather than to an HTTP status. When both the
data path and the sweeps are broken the data path is reported, because the
sweeps failing is the symptom and it would bury the cause.

An unauthorized caller returns before any of this, so nobody holding the
heartbeat URL can forge a green light.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The records and the deploy obligations

**Files:**
- Modify: `docs/build-notes.md` (a §11 entry, and two after-launch items)
- Modify: `CLAUDE.md` (a current-state paragraph, and strike the queue note)

**Interfaces:** none.

Records are **append-only**. Corrections are dated annotations or strikethroughs; nothing existing gets rewritten.

**Why this task specifies required content rather than finished prose, unlike every other task in this plan.** Two of the facts the entry must carry cannot be known when a plan is written: the finishing test count, and the real output of `npm run qa:health`. Pre-writing the paragraphs would guarantee at least one false sentence in the permanent record, which is the specific failure this project has been burned by more than once. The bullets below are binding on content; the wording is the implementer's.

- [ ] **Step 1: Write the §11 entry**

Append to `docs/build-notes.md` §11, following the house shape of the entries around it (400 to 600 words for a normal slice). It must cover:

- What it is: the hourly cron now runs a read-only self-check and reports the verdict to Better Stack as a heartbeat.
- **Why the obvious cheap answer was wrong**, since this is the reasoning most likely to be re-derived: a logged-out visitor saw a healthy site for all four days, so an uptime ping would have read green throughout. The fault line is narrower than signed-in versus signed-out; it is *reading a whole `User` row*, which is why the check needs no session and no browser.
- **The checklist / witness division**, so neither half later grows into the other: the checklist covers everything that talks to the database; the Vercel log drain into Better Stack covers everything else (render bugs, one-bad-group crashes). Pure functions are deliberately outside the checklist for that reason.
- **Why no email from Orbit.** Two reasons: an alarm inside the thing it watches goes quiet exactly when that thing dies, and the owner's noise budget (immediate, then six-hourly, then an all-clear) needs state this slice cannot store without a migration. Better Stack owns both.
- **Why `realProbes` has no tests**, naming the message-send-latency precedent.
- **The accepted limit of the `--break` proof**: an unreachable database is a connection error, not `P2022`. It proves the check catches a broken database; it does not reproduce the missing-column error specifically.
- **The free-tier pause**, raised and half-answered: this detects it (the heartbeat stops) and does not prevent it (a hosting decision, deliberately not bundled in).
- Test baseline 128/1388 at start, and the finishing number.

- [ ] **Step 2: Add after-launch items 12 and 13**

Append to the "After launch, running deploy-time obligations" list in `docs/build-notes.md` (item 11 is taken; these are 12 and 13). Neither gates the merge, and both must say so.

**12. Set `HEALTH_HEARTBEAT_URL` in Vercel's production environment.** Until it is set, `reportHealth` returns `not_configured`, logs one line, and sends nothing: the product is exactly as blind as it is today. Nothing breaks, and nothing is gained. No migration, so this does not gate the merge. The value comes from item 13.

**13. Create the heartbeat monitor in Better Stack** (free tier, the owner's existing account). Settings:
- Expected period: **1 hour**, matching `vercel.json`'s `0 * * * *`.
- Grace period: **20 minutes**. One missed run plus slack for cron drift, so a single late invocation is not an incident.
- Email notification: **on**.
- Repeat: **every 6 hours** while the incident is open. This is the owner's stated noise budget, and it lives here rather than in code.
- Auto-resolve when the heartbeat returns: **on**. This is the all-clear.

Also record, because it is the thing a future reader will want and cannot get from the code: **the alarm fires in three distinct ways.** A failing probe pings `/fail` and raises the incident immediately with the reason attached. A broken sweep does the same, named `orbit_sweeps`. And nothing arriving at all raises it after the grace period, which is what covers a dead deploy, a stopped cron, and the free-tier database pause.

- [ ] **Step 3: Update `CLAUDE.md`**

Two edits, both terse (this file loads every session):

1. A new current-state paragraph, in the voice of the ones around it, covering: what now happens hourly, that the alarm is Better Stack rather than Orbit's email, that nothing arriving is itself the alarm, that it detects the free-tier pause without preventing it, and the two things that are deliberately not covered (render bugs, which the log drain will take; and the fact that until item 12 is set in Vercel the product is still blind).
2. Strike the queue entry beginning **"Site health monitoring is queued, not built"** with a dated note pointing at the new §11 entry, and remove it from the "queue holds" list in the next-slice paragraph, leaving message-send latency slice two and the second-group entry point.

- [ ] **Step 4: Confirm the docs change broke nothing**

Run: `npx vitest run`
Expected: the same 131 files / 1409 tests. Several tests in this repo scan the repository itself, so a docs edit is not automatically inert.

- [ ] **Step 5: Commit**

```bash
git add docs/build-notes.md CLAUDE.md
git commit -m "Record why an uptime ping would not have caught the outage

The reasoning most worth keeping is the negative one: a logged-out visitor
saw a healthy site for four days, so checking that the site responds buys
nothing here. The fault line is reading a whole User row, which is why the
check needs no session.

Two deploy obligations, neither gating the merge: the env var and the
Better Stack monitor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification summary for the PR

| Claim | Evidence |
|---|---|
| The runner never throws and names the right step | 8 unit tests, `src/lib/health/__tests__/check.test.ts` |
| Every heartbeat outcome behaves | 7 unit tests, `src/lib/health/__tests__/heartbeat.test.ts` |
| The cron reports the root cause, not the symptom | 6 unit tests, `src/app/api/cron/orbit/__tests__/route.test.ts`, one of them proven able to fail (Task 4 Step 5) |
| The probes work against a real database | `npm run qa:health`, output pasted in the PR |
| A broken database is caught and reported correctly | `npm run qa:health -- --break`, output pasted in the PR |
| An incident actually reaches the owner's inbox | **Owner's, in QA.** `npm run qa:health -- --ping` against a throwaway Better Stack monitor. No code change substitutes for this. |
| Nothing regressed | Full suite, 128/1388 before → 131/1409 predicted after (report the real figure, never the predicted one) |

**Named honestly as unproven:** that a *missing column* specifically produces the alarm. The `--break` proof produces a connection error instead. Closing that gap fully would mean damaging a database another worktree is testing against.
