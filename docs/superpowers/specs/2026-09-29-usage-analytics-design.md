# Usage analytics: a weekly report to the owner, and `npm run usage`

Designed 29 Sept 2026 on branch `usage-analytics`, approved by the owner the
same day with one change (Central time, not Pacific). Reasoning lands in
build-notes §11 at the end of the slice.

---

## Front section

**Settled, do not relitigate.** No Google Analytics and no Vercel Web
Analytics (deferred to the invite-link-opened-but-not-joined question). The
source is our own production database, read-only: nothing new collected, no
new vendor, no privacy-notice change. "Active" is reported two ways, opened a
group and did something, both over the last 7 days. Every group the owner
belongs to is excluded; the owner is whoever signed in with the address in
`USAGE_REPORT_TO`, which is also the recipient. Weekly, Monday 8am
America/Chicago, as a new fail-soft step in the hourly cron through
`sendEmail`. Once a week is guaranteed by the hour alone, no stored marker, no
migration. Counts and group names only, never member names.

**Non-goals.** Exceptions to the owner exclusion (a follow-up setting when he
joins a real group as an observer). Week-over-week history (his inbox is the
history). Visit counting (Vercel Web Analytics, if ever). A production mode
for `npm run usage` (the email is the production path).

**Verification, written before code.** Tests first for: the Monday-8am rule
including both sides of daylight saving; every metric counted against dev-test
fixtures scoped to the test's own groups, including the exclusion; the email
text; the cron step failing without costing the other steps. Deliberately
untested: real delivery to an inbox (QA script), and `npm run usage` itself
(run by hand, output shown).

**Debt opened.** A rare duplicate email if Vercel fires twice in the hour; a
skipped week if that hour fails; RSVPs counts current answers on plans, not
answers given (promotion carries votes over, a passed time change resets them,
a changed old answer counts in the week it changed; added 29 Sept 2026, final
review); an anonymous test group of the owner's that never signed in
is not recognised as his.

---

## Task detail (for the implementing agents)

Worktree: `/Users/rivers-m1-air/code/interplanetary-groups/.claude/worktrees/usage-analytics`.
Baseline: 2404 passing across 194 files, zero failures. TDD throughout: write
each test, run it, see it fail for the right reason, then implement. Tests that
touch the database follow `src/lib/digest/__tests__/run.test.ts`: `[TEST] `
name prefix, a per-file stamp, ids collected and deleted children-before-parents
in `afterAll`, `prisma.$disconnect()`. Every instant in a test is pinned; never
let Postgres stamp a time with the real clock in a way an assertion depends on
(see build-notes, the 2 Sept `run.test.ts` wall-clock failure). The suite must
pass from an empty database. No model calls anywhere in this slice.

New code lives in `src/lib/usage/`. Match the comment density and header-comment
style of `src/lib/digest/`.

### Task 1: the send hour (`src/lib/usage/schedule.ts`)

- `export const USAGE_REPORT_TIME_ZONE = "America/Chicago"` and
  `USAGE_REPORT_LOCAL_HOUR = 8`, with a comment: the owner's own zone, a
  product constant rather than an env var (same reasoning as `FROM` in
  `src/lib/email/send.ts`).
- `export function isUsageReportHour(now: Date): boolean`: true exactly when,
  in America/Chicago, the weekday is Monday and the hour is 8. Read the wall
  clock through `getLocalParts` (`src/lib/orbit/occurrence.ts:19`); derive the
  weekday from the local y/m/d with `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`.
- Header comment must state the once-a-week guarantee plainly: the hourly cron
  enters this hour once a week, so no marker is stored; the accepted costs are
  a duplicate if Vercel delivers the same hour twice and a skipped week if the
  hour fails.
- Tests (`src/lib/usage/__tests__/schedule.test.ts`): Monday 2026-09-28 13:00Z
  (8:00 CDT) true; 13:59Z true; 12:59Z false; Tuesday 13:00Z false; Sunday
  13:00Z false; winter Monday 2026-12-07 14:00Z (8:00 CST) true and 13:00Z
  (7:00 CST) false.

### Task 2: counting (`src/lib/usage/collect.ts`)

`export async function collectUsage(now: Date, opts: { excludeUserIds: string[]; groupIds?: string[] }): Promise<UsageReport>`.
`groupIds`, when given, restricts the universe to those groups (test scoping,
mirroring `runDailyDigest`'s `opts.groupIds`); exclusion still applies inside it.

Window: `windowStart = now - 7 days`; "this week" means `>= windowStart` and
`<= now`. "All time" means every row up to `now`.

A group is **excluded** when any user in `excludeUserIds` is a current member
(Membership row) or is its founder (`Group.founderId`). Return
`excludedGroupCount`.

Types (export them):

```ts
export interface Count { week: number; allTime: number }
export interface UsageMetrics {
  people: Count          // allTime: distinct current members; week: distinct users with Membership.joinedAt in window
  openedActive: number   // distinct users with Membership.lastSeenAt in window (week only; no history exists)
  didSomethingActive: number // distinct users with any of: MEMBER message, Rsvp.respondedAt, GaugeVote.updatedAt, ProposalVote.updatedAt in window
  memberMessages: Count  // Message.authorType MEMBER, by createdAt
  ideasFloated: Count    // Gauge with sourceMessageId not null (a member started it; Orbit's own retry guesses have it null), by createdAt
  ideasBecamePlans: Count // those gauges with an Event (Event.gaugeId); week by the Event's createdAt
  rsvps: Count           // Rsvp rows on the groups' events; week by respondedAt (latest answer time, so a changed old answer counts this week)
  timeChangesProposed: Count // ChangeProposal kind GROUP, by createdAt
  timeChangesPassed: Count   // ChangeProposal kind GROUP, answer CONFIRMED, week by answeredAt
  callsOff: Count        // Event status CANCELLED, week by cancelledAt
}
export interface GroupUsage { id: string; name: string; createdAt: Date; metrics: UsageMetrics }
export interface UsageReport {
  generatedAt: Date; windowStart: Date
  groups: Count          // included groups; week by Group.createdAt
  overall: UsageMetrics  // across all included groups; distinct-user counts are distinct across groups, not summed
  perGroup: GroupUsage[] // ordered by didSomethingActive desc, then memberMessages.allTime desc, then name
  excludedGroupCount: number
}
```

Implementation latitude: data is tiny, so plain `findMany` / `count` with
`select` of ids and timestamps is fine; prefer clarity over query cleverness.
Read only; this function must never write. **Do not read `ContactMethod` here.**

Tests (`src/lib/usage/__tests__/collect.test.ts`), all with `groupIds` scoped
to the file's own groups and `now` pinned: one test per metric proving both
the week and all-time side with a row inside and a row outside the window;
distinct-user counting across two groups (one person in both counts once
overall, once in each group); an Orbit retry gauge not counted as floated; a
group the excluded user founded, and one they merely joined, both excluded and
counted in `excludedGroupCount`; ordering of `perGroup`.

### Task 3: the email text (`src/lib/usage/compose.ts`)

`export function composeUsageReport(report: UsageReport, opts: { ownerRecognised: boolean }): { subject: string; text: string; html: string }`.
Pure; no database.

- Subject: `Orbit usage, week ending Mon Sep 28` (date of `generatedAt` in
  America/Chicago, three-letter weekday and month).
- Text, plain aligned lines, no em or en dashes anywhere. Overall block first:
  groups, people, active (opened), active (did something), member messages,
  ideas floated, ideas that became plans, RSVPs, time changes proposed,
  time changes passed, calls-off; each line shows `this week` and `all time`
  columns (active lines show this week only, with "(7 days)").
- Directly under the people line, the caveat, exact text:
  `Counts identities, not humans: a member who lost their session and rejoined counts twice.`
- An exclusion line: when `ownerRecognised`,
  `Excluded N groups you are a member of.`; otherwise
  `Excluded nothing: USAGE_REPORT_TO is not set or matches no signed-in account.`
- Then one block per group headed by its name and created date, same lines,
  minus the groups line. No member names anywhere.
- An empty report (zero included groups) says `No groups to report yet.`
  rather than a block of zeros.
- HTML: the same text, HTML-escaped (group names are user input), inside one
  `<pre>` with an inline monospace style. No links, no unsubscribe (the only
  recipient is the owner, who controls the setting).
- Tests (`src/lib/usage/__tests__/compose.test.ts`): subject date; caveat
  present under people; both exclusion wordings; per-group block present and
  ordered as given; empty report; a group name with `<script>` escaped in html;
  no `—` or `–` in any output.

### Task 4: the step (`src/lib/usage/run.ts`)

`export async function runWeeklyUsageReport(now: Date, opts?: { groupIds?: string[]; force?: boolean }): Promise<UsageRunResult>` where

```ts
export type UsageRunResult =
  | { status: "not_report_hour" }
  | { status: "no_recipient" }
  | { status: "sent"; result: SendResult } // SendResult from @/lib/email/send, passed through verbatim
```

- `force` skips the hour check (tests only; comment says so).
- Recipient: `process.env.USAGE_REPORT_TO`, trimmed; empty or unset returns
  `no_recipient` and logs one line.
- `export async function findOwnerUserIds(email: string): Promise<string[]>`
  (also used by the CLI in Task 6): `prisma.user.findMany({ where: { contactMethods: { some: { value: <email lowercased and trimmed>, isVerified: true } } }, select: { id: true } })`.
  **This must stay a `User` query filtered by relation, returning ids only.**
  It must not call `prisma.contactMethod.*`: the privacy guard in
  `src/app/__tests__/no-email-address-on-screen.test.tsx` pins exactly three
  ContactMethod read sites, and a fourth reddens it on purpose. Before writing
  the filter, check how `src/lib/auth/email.ts` / `email-ask.ts` store
  `ContactMethod.value` (case, trimming) and match that normalization. Header
  comment: this lookup can never return an address, only the ids of whoever
  signed in with the one address the owner put in his own setting.
- Then `collectUsage(now, { excludeUserIds, groupIds })`,
  `composeUsageReport(report, { ownerRecognised: excludeUserIds.length > 0 })`,
  `sendEmail({ to, subject, text, html })`.
- Tests (`src/lib/usage/__tests__/run.test.ts`, `sendEmail` mocked at module
  level exactly like the digest's run test; `USAGE_REPORT_TO` set and restored
  per test with `vi.stubEnv` / `vi.unstubAllEnvs`): not the hour, no send;
  unset recipient, no send; the hour with a recipient, one send to that
  address whose text names a fixture group; an owner user with a verified
  ContactMethod matching the env (different case) whose group is absent from
  the text and counted as excluded; an unverified match not recognised.

### Task 5: the cron step (`src/app/api/cron/orbit/route.ts`)

- After the digest's nested try, add a sibling nested try/catch calling
  `runWeeklyUsageReport(new Date())`, logging `[orbit-cron] usage report step failed:`
  on throw, raising no health alarm, same reasoning as the digest (quote it
  briefly in a comment). Add `usageReport` to the returned JSON
  (`UsageRunResult | null`, null when it threw).
- Update the header comment's step list (it says "fifth step" for health; health
  becomes the sixth).
- Tests in `src/app/api/cron/orbit/__tests__/route.test.ts`, following that
  file's existing mocking: the usage step throwing still returns 200 with the
  other results and still reports health; its result appears under `usageReport`.

### Task 6: `npm run usage` (`scripts/usage-report.ts`)

- `package.json`: `"usage": "tsx --env-file=.env scripts/usage-report.ts"`.
- First thing: refuse unless dev-test, using `judge` from `scripts/db-which.ts`
  exactly as `scripts/send-test-digest.ts`'s `requireDevTest` does (duplicate
  the ref constant with the same comment it carries). No production mode.
- Reads `USAGE_REPORT_TO` from `.env` if present, finds owner ids with
  `findOwnerUserIds`, calls `collectUsage(new Date(), { excludeUserIds })` and
  `composeUsageReport`, prints `subject` then `text`. Never sends. Exits 0.
- Not part of the test suite. Run it once and paste the output into the task
  report.

### Task 7: records (controller writes these, not an implementer)

- build-notes after-launch item 19: set `USAGE_REPORT_TO` in Vercel Production,
  redeploy; the weekly step is a silent no-op until then; optional same line in
  the laptop `.env` for the CLI.
- build-notes §11 entry; CLAUDE.md "Where the build is" paragraph and the queue
  amendment; README "Working end to end" line if it lists operational tooling.
- Confirm the privacy notice needs no change (it already says the owner can
  read the database) and say so in §11.
