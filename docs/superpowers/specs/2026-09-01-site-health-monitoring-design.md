# Site health monitoring, slice one: the checklist

*Design document, 1 September 2026. Branch `claude/site-health-monitoring-cf4b08`.*

---

## For the owner

**Settled, do not relitigate.** Alerts go through Better Stack (free tier, his existing
account), not through Orbit's email. The hourly cron runs a read-only self-check and reports
the verdict as a heartbeat: healthy pings the URL, broken pings `/fail` with the reason
attached, and nothing arriving at all raises an incident on its own after a grace period.
That last case is what covers a dead deploy, a stopped cron, and the free-tier Supabase pause.
Better Stack owns the noise budget (immediate, then every six hours, then an automatic
all-clear), so no state lives in our code. The check reads the most recently active group.

**Non-goals.** Watching for 500s on member page loads is real and wanted, and arrives as a
Vercel log drain into Better Stack: dashboard configuration, no code, sequenced after this
slice. Preventing the free-tier pause is a hosting decision and belongs to its own call, not
here. Alerting on the model or the mail service is declined outright: both already fail soft,
so an alarm there would report degraded, not broken.

**How it is verified.** Tested: the verdict a failing probe produces, every heartbeat outcome,
and how the cron composes the two. Deliberately untested, because a mock removes the very
thing at issue: that the real probes touch the real columns. That is proven by a hand-run
script, against a real database, and by the owner seeing a real incident in his dashboard.

**Debt this opens.** The check names its probes by hand, so a future signed-in read is not
covered until somebody adds it. The heartbeat token sits in an env var with no rotation path.

---

## Why this exists

From 28 to 31 August 2026 the live site was down for four days for every signed-in person, and
a logged-out visitor saw a perfectly healthy site the whole time. Nothing in the product
reported it. It was found because the owner opened the app.

The fault line is narrower than "signed-in versus signed-out", and naming it precisely is what
makes this slice small. `getCurrentUser()` (`src/lib/auth/current-user.ts:20`) reads a whole
`User` row with no `select`, so the query names every column on that table. Its `if (!user)
return null` guard sits **before** the database call. A visitor with no session never reaches
it; a member reaches it on every page. When two migrations went missing, that query started
throwing `P2022` and every signed-in page died while the front door stayed green.

Four other call sites issue the identical unselected `User` query on their own
(`gauge-vote.ts:73`, `proposal-vote.ts:62`, `proposal-answer.ts:51`, `rsvp.ts:43`), recorded at
after-launch item 1. **One probe covers all five**, because they are the same query shape.

> **Corrected 1 September 2026, whole-branch review. Both counted claims in the paragraph above
> are wrong, and they were copied verbatim into `check.ts` and into the §11 entry, so all three
> said the same wrong thing.**
>
> **The path.** `rsvp.ts:43` sits in a list of `src/app/actions/*` files, which reads as
> `src/app/actions/rsvp.ts`. That file contains no `user.find*` call at all. The real site is
> **`src/lib/events/rsvp.ts:43`**, inside a transaction. Build-notes line 535 had it right on
> 26 August; this document got it wrong five days later.
>
> **The count.** "Four other call sites" is a large undercount. Re-derived on 1 September 2026
> with `grep -rn 'user\.find' src --include='*.ts' --include='*.tsx'`, then dropping every read
> that takes a `select`: there are **twelve** besides `current-user.ts:20`, not four.
> `src/app/actions/gauge-vote.ts:73`, `proposal-vote.ts:62`, `proposal-answer.ts:51`;
> `src/lib/auth/email.ts:258` and `:393`; `src/lib/groups/join.ts:45`, `provision.ts:49`,
> `leave.ts:25`, `remove-member.ts:26`, `reset-invite.ts:27`; `src/lib/gauges/vote.ts:40`;
> `src/lib/events/rsvp.ts:43`. So the probe covers thirteen call sites, not five, and the case
> for it is stronger than the document argued, not weaker.
>
> One correction to the review's own list, which is why verifying beats trusting: it named
> `src/lib/email/unsubscribe.ts:36` and `:48` as well. Both take a `select`, so neither is an
> unselected whole-`User` read and neither is covered by this probe. They belong to the
> select-only blind spot recorded in CLAUDE.md instead.
>
> `check.ts` now states the rule ("every unselected whole-`User` read in the codebase") rather
> than a number, with the list and the grep kept only as a dated aside, because a number in a
> comment goes stale the day somebody adds a fourteenth and nothing anywhere says so.

**The consequence that makes this buildable:** detecting this needs no session and no browser.
It needs the same *reads*.

---

## Shape

Two moving parts and one setting.

1. **`runHealthCheck(now)`** — an ordered list of read-only probes over the data a signed-in
   screen depends on. Returns a verdict. Never throws.
2. **`reportHealth(verdict)`** — POSTs the verdict to the Better Stack heartbeat URL. Never
   throws.
3. **The hourly cron** calls both as a fifth step, after the existing four sweeps.

Nothing writes. Every probe is a read, which is what makes this safe to run alongside another
worktree's QA against the shared dev-test database with no coordination.

### The division of labour, stated once so neither half grows into the other

**The checklist covers everything that talks to the database.** The witness (the log drain,
next) covers everything else: render bugs, one-bad-group crashes, anything nobody thought of.
Pure functions like `deriveRoster` and `composeCardRegion` are therefore deliberately out of
the checklist. They touch no database, they cannot break from schema drift, and the witness
sees them when a real member walks into one.

---

## Task 1 — the verdict and the runner

**File:** `src/lib/health/check.ts` (new)
**Tests:** `src/lib/health/__tests__/check.test.ts` (new)

```ts
export type HealthStep =
  | "user_row"
  | "membership_row"
  | "group_home_data"
  | "orbit_sweeps"

export type HealthVerdict =
  | { ok: true; ranSteps: HealthStep[]; skipped: HealthStep[] }
  | { ok: false; failedStep: HealthStep; detail: string }

export interface Probe {
  name: HealthStep
  /** Resolves if healthy. Resolves to "skip" when there is nothing to check. */
  run: () => Promise<void | "skip">
}

export async function runHealthCheck(
  now: Date,
  probes: Probe[] = realProbes(now),
): Promise<HealthVerdict>

/** Error → the `detail` string, applying the truncation and privacy rule below.
 *  Exported because Task 4's route needs the identical treatment for a sweep
 *  failure, and two copies of a privacy rule is how one of them drifts. */
export function describeError(err: unknown): string
```

**`orbit_sweeps` is a step name but never a probe.** It exists in the union because the cron
route produces it in Task 4 when the sweeps themselves throw. `realProbes` must never return
it. Keeping it in one union rather than two is deliberate: the heartbeat body then has one
vocabulary, so the owner reads the same kind of sentence whatever failed.

**Behaviour.**

- Runs probes **in order**, stopping at the first failure. Order matters: `user_row` is the
  cheapest and the most diagnostic, so a schema break names itself rather than surfacing as a
  confusing group-data failure three probes later.
- A probe that throws produces `{ ok: false, failedStep, detail }`. `runHealthCheck` itself
  never throws, ever. A monitoring tool that can crash is worse than none.
- A probe resolving `"skip"` is recorded in `skipped` and does not fail the run.
- `now` is passed explicitly and never read from `Date.now()` internally, matching
  `runDailyDigest` and `reconcileScheduledEvents`.

**`detail` is a privacy boundary, and the spec is explicit because a Prisma error is not
always safe.** `detail` carries **only** the step name, the error's constructor name, and its
message, truncated to 500 characters. It never carries a query result. This is not absolute:
a Prisma unique-constraint error can echo an offending value into its own message, the same
residual risk `src/lib/email/send.ts` already documents for Resend. Carry that caveat in a
comment on the truncation, in the same words, so the two read as one policy.

**Tests (all pure, no database):**

1. All probes resolve → `ok: true`, `ranSteps` in order.
2. Second probe throws → `ok: false`, `failedStep` is the second, first probe's name absent
   from any failure field.
3. A throwing probe stops the run — a spy on the third probe is never called.
4. A probe resolving `"skip"` lands in `skipped` and the run stays `ok: true`.
5. `detail` truncates at 500 characters.
6. A probe rejecting with a non-Error value (a string, `undefined`) still produces a verdict
   rather than throwing.

**TDD note:** write these against an empty `realProbes` stub and an injected probe array
first. Every one of them must fail before `check.ts` exists.

---

## Task 2 — the real probes

**File:** `src/lib/health/check.ts` (same file, `realProbes(now)`)

Three probes, in this order.

### `user_row`

```ts
prisma.user.findFirst()
```

**No `select`. No `include`. This is load-bearing and needs a comment saying so** — something
close to: *adding a `select` here silently disables the only check that would have caught the
four-day outage of 28-31 August 2026.* That comment is the whole defence against a future
tidy-up removing the value while leaving the code.

`null` is **healthy**, not a failure. The SQL still executed and still named every column, which
is exactly what is being proven; an empty table is not evidence of breakage and a probe must
never invent an alarm. Resolve normally rather than `"skip"`.

### `membership_row`

```ts
prisma.membership.findFirst()
```

Same rules, same reasoning. The other missing migration (`lastSeenAt`, `lastDigestSentAt`)
landed on this table.

### `group_home_data`

Picks the target group, then exercises the group home's own database reads against it.

**Choosing the group.** Newest message wins:
`prisma.message.findFirst({ orderBy: { createdAt: "desc" }, select: { groupId: true } })`.
No messages anywhere → fall back to `prisma.group.findFirst()`. No groups at all → `"skip"`.

**Then, against that group id:**

| Read | Source |
|---|---|
| `prisma.group.findUnique` with `memberships: { include: { user: true } }` | the page's own opening query |
| `findUpcomingEvents(groupId, now, CARD_REGION_CAP)` | `@/lib/events/upcoming-list` |
| `prisma.rsvp.findMany({ where: { eventId } })` for the first event, if any | the page's per-card read |
| `prisma.message.findMany({ where: { groupId }, include: { author: true }, take: 50 })` | the feed read |
| `findLiveGauges(groupId, now)` | `@/lib/gauges/read` |
| `findLiveProposals(groupId, now)` | `@/lib/proposals/read` |
| `loadEmailAskInputs({ userId, groupId })` for the group's first member | `@/lib/auth/email-ask` |

**Call the library functions, do not copy their queries.** That is the point: if the group home
changes and this does not, the build breaks loudly instead of the check going quietly stale.

**One deliberate divergence, and it needs its own comment.** The page's message read is
unbounded; this one takes 50. The unboundedness is registered debt (message-send-latency slice
two) and re-running it hourly would compound a known problem. The column set and the `author`
join are identical, and columns are what this probe proves.

**No tests.** Deliberate, and this is the slice's central verification decision. A test for
these probes must mock Prisma, and mocking Prisma removes the only thing being checked —
whether the real query matches the real database. That is precisely the trap the
message-send-latency slice fell into and deleted a test over. Evidence for this task is Task 5's
hand-run script. Say so in a comment above `realProbes`, naming the latency slice.

---

## Task 3 — the heartbeat

**File:** `src/lib/health/heartbeat.ts` (new)
**Tests:** `src/lib/health/__tests__/heartbeat.test.ts` (new)

```ts
export type HeartbeatOutcome =
  | "reported_ok"
  | "reported_failure"
  | "not_configured"
  | "unreachable"

export async function reportHealth(verdict: HealthVerdict): Promise<HeartbeatOutcome>
```

**Behaviour.**

- Reads `HEALTH_HEARTBEAT_URL`. **Unset → log at info and return `not_configured`.** Local
  development and any preview build stay silent; only production is configured. Fails quiet on
  purpose, and it is the one place in this file where quiet is right, because an unconfigured
  monitor is not a broken product.
- `ok: true` → `POST <url>`, empty body.
- `ok: false` → `POST <url>/fail`, body = `"<failedStep>: <detail>"`. Better Stack raises the
  incident immediately and shows the body on it, which is what turns "your site is down" into
  "your site is down because `user_row` threw `PrismaClientKnownRequestError: ...`".
- `AbortSignal.timeout(5000)`. Built in, no package. A hanging monitor must never hang the
  cron; the sweeps have already done their work by this point and their results are owed to
  the response.
- Any throw or non-2xx → log and return `unreachable`. Never throws. Not reaching Better Stack
  is safe by construction: the missing ping is itself the alarm.

**Tests, with `fetch` stubbed:**

1. Unset URL → `not_configured`, `fetch` never called.
2. Healthy verdict → POST to the exact base URL, no `/fail`.
3. Broken verdict → POST to `<url>/fail`, body contains the step name and the detail.
4. `fetch` rejects → `unreachable`, no throw escapes.
5. `fetch` resolves 500 → `unreachable`.
6. The abort signal is passed (assert the option is present).
7. A trailing slash on the configured URL does not produce `//fail`.

---

## Task 4 — wiring the cron

**File:** `src/app/api/cron/orbit/route.ts` (edit)
**Tests:** `src/app/api/cron/orbit/__tests__/route.test.ts` (new or extended)

Restructure the handler body so the heartbeat always fires after the auth gate:

```ts
let sweepFailure: string | null = null
let results, endgame, proposalEndgame
let digest: DigestRunResult[] = []

try {
  results = await reconcileScheduledEvents(new Date())
  endgame = await runGaugeEndgame(new Date())
  proposalEndgame = await runProposalEndgame(new Date())
  try { digest = await runDailyDigest(new Date()) }
  catch (err) { console.error("[orbit-cron] digest step failed:", err) }
} catch (err) {
  sweepFailure = describeError(err)
  console.error("[orbit-cron] sweep failed:", err)
}

const health = await runHealthCheck(new Date())

// Root cause wins. When the data path is broken the sweeps fail too, so
// reporting the sweep failure would name the symptom and bury the cause.
const verdict: HealthVerdict = !health.ok
  ? health
  : sweepFailure
    ? { ok: false, failedStep: "orbit_sweeps", detail: sweepFailure }
    : health

await reportHealth(verdict)

if (sweepFailure) return new Response("Internal Server Error", { status: 500 })
return Response.json({ ok: true, results, endgame, proposalEndgame, digest, health: verdict })
```

**Three properties to preserve, each of them a decision:**

- The **401 paths return before any of this**. An unauthorized caller must never be able to
  ping the heartbeat, or anyone holding the URL could forge a green light.
- The digest keeps its own nested try/catch, unchanged. A digest failure still must not cost
  the three sweeps their results, and it deliberately does **not** raise a health alarm: the
  digest is a fail-soft nicety, not the site being down.
- The 500 response is preserved. It is what Vercel's own logs and the coming log drain key on.

**Tests, with the four sweeps and `reportHealth` mocked:**

1. Everything healthy → `reportHealth` called with `ok: true`; response 200.
2. A sweep throws → `reportHealth` called with `failedStep: "orbit_sweeps"`; response 500.
3. Health check unhealthy **and** a sweep threw → the health verdict is reported, not
   `orbit_sweeps`. This is the root-cause rule and it is the easiest one to regress.
4. Health check unhealthy, sweeps fine → reported, response still 200. Deliberate: the cron
   did its job. The alarm is Better Stack's to raise, not HTTP's.
5. Unauthorized request → `reportHealth` never called.
6. A digest failure alone → `ok: true` reported.

---

## Task 5 — the hand-run proof

**Files:** `scripts/qa-health.ts` (new), `package.json` (add `"qa:health"`)

Deliberately outside the test runner, like `eval:detect` and `measure-group-home.ts`, and for
the same reason: it needs a real database and the suite must not depend on ambient rows.

Three modes.

**`npm run qa:health`** — runs the real check against dev-test and prints the verdict, the
steps that ran, the steps skipped, and which group was chosen. Proves the healthy path against
a real database and real columns. **This is the evidence Task 2 has no tests for.** Run
`npm run db:which` first and abort unless it prints the dev-test ref.

**`npm run qa:health -- --break`** — proves the unhealthy path. Constructs a Prisma client
pointed at an **unreachable database URL** (a valid-shaped URL on a closed port), runs the same
probes through it, and prints the resulting verdict.

Why this method and not the two obvious alternatives, recorded so nobody swaps it back:

- *Not raw SQL asking for a non-existent column.* It would reproduce the outage's exact error,
  and it would redden the repo-wide raw-SQL assertion in
  `src/app/__tests__/no-email-address-on-screen.test.tsx`, whose allowlist names exactly one
  file. That guard reddening is by its own rule a decision for the owner, not a test to adjust.
- *Not altering the shared database.* Another worktree is running phone QA against dev-test.

The accepted limit, stated rather than glossed: an unreachable database produces a connection
error, not `P2022`. It proves the check catches a broken database and reports it correctly. It
does **not** reproduce the missing-column error specifically. That gap is closed by reasoning
plus Task 2's comment, and it is worth naming in the PR rather than implying otherwise.

**`npm run qa:health -- --ping`** — sends a real heartbeat to whatever `HEALTH_HEARTBEAT_URL`
holds, both healthy and failing, and prints the HTTP status. The owner's to run against a
throwaway Better Stack monitor. **This is the only end-to-end proof that an incident reaches
his inbox**, and no code change can substitute for it.

---

## Task 6 — records

- **`docs/build-notes.md` §11**: a new entry. What it is, why the obvious cheap answer (an
  uptime ping) was wrong, the checklist/witness division, why no email, why Task 2 has no
  tests, and the accepted limit of the `--break` proof.
- **`docs/build-notes.md` after-launch list**: two new items, numbered **12** and **13**
  (item 11 is taken).
  - **12. Set `HEALTH_HEARTBEAT_URL` in Vercel's production environment.** Until it is set,
    `reportHealth` returns `not_configured` and the product is exactly as blind as it is today.
    Nothing breaks; nothing is gained either. No migration, so this does not gate the merge.
  - **13. Create the heartbeat monitor in Better Stack** — expected period 1 hour, grace
    period 20 minutes (one missed run plus slack for cron drift, so a single late invocation is
    not an incident), email notification on, repeat every 6 hours, auto-resolve on.
- **`CLAUDE.md`**: a current-state paragraph, and one line in the queue notes striking the
  "site health monitoring is queued, not built" entry.
- **`docs/runbooks/`**: nothing. The two Better Stack steps are one-time setup and live on the
  after-launch list, which is where deploy obligations belong.

**Out of lane and deliberately not done here**, both already recorded: the production-migration
runbook's two missing notes (the 1Password failure and the `read -rs` fallback) are their own
micro-PR against `main`, and the Vercel log drain is dashboard configuration after this ships.

---

## Test baseline

**128 files / 1388 tests, all passing, zero skipped**, taken on this branch before any code, at
11:43 on 1 September 2026. Cross-checks against the README-rewrite slice's finishing 126/1374
plus the message-send-latency slice's additions. No pre-existing failures to carry.

Worth recording: the run collected **128 files, not 2749**, confirming that PR #95's
`.claude/worktrees/**` exclusion is in effect on this branch and the concurrent-worktree
collection bug is genuinely fixed rather than merely rebased over.

---

## Confirmations the owner asked for before any code

1. **No new npm package.** Resend is already a dependency and is not touched anyway; `fetch`
   and `AbortSignal.timeout` are runtime built-ins; Prisma is already present.
2. **No migration.** One new environment variable, which is a deploy obligation, not a schema
   change.
3. **Nothing breaks the shared dev-test database.** Every probe is a read. The failure proof
   uses an unreachable database rather than damaging a real one. The other slice's phone QA
   needs no coordination.
