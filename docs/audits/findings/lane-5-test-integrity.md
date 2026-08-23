# Lane 5: Would the tests catch a regression?

*Written as the pass goes. Baseline confirmed on this checkout: `npm test` → 92 files, 935 tests, all green, 71.41s.*

## Findings

### F-5-1: The only guard stopping a non-member from voting on a group's time change sits in code no test ever runs

- **file:line** — `src/app/actions/proposal-vote.ts:82`
- **consequence** — Anyone with a working account and a proposal id (a removed member's stale tab is the realistic case, and the product's own comments say so) can cast a vote in a group they do not belong to, which can be the vote that moves a real plan for real people. If that guard were ever deleted or reordered, all 935 tests would still pass and nothing would tell anyone.
- **evidence** — The check is written into the server action only:
  ```
  if (!(await isGroupMember(user.id, proposal.groupId))) {
    return { errors: { general: "Only members can vote on this." } }
  }
  ```
  The write it protects is a bare upsert with no guard of its own (`src/app/actions/proposal-vote.ts:100`): `await prisma.proposalVote.upsert({ where: { proposalId_userId: ... } ... })`. Grepping every test file for the module shows the action is only ever *mocked*, never executed: `src/app/events/[id]/__tests__/ProposalSection.test.tsx:7` and `src/app/groups/[id]/__tests__/GroupProposalChips.test.tsx:14` both do `vi.mock("@/app/actions/proposal-vote", ...)`. `src/lib/auth/__tests__/membership.test.ts` proves `isGroupMember` answers correctly, but nothing proves anybody calls it here. Contrast the two sibling paths that ARE covered: `castVote` throws `NOT_A_MEMBER` inside its own transaction (`src/lib/gauges/vote.ts:55`, covered by `src/lib/gauges/__tests__/vote-membership.test.ts`) and `setRsvp` does the same (covered by `src/lib/events/__tests__/rsvp-membership.test.ts`). Group time-change voting is the one chip-vote path where the guard lives above the data layer and is untested.
- **severity** — fix-now
- **confidence** — certain

### F-5-2: "The completeness gate is the only door to group creation" is a stated invariant with no test behind it

- **file:line** — `src/app/actions/create-group.ts:52`
- **consequence** — A group can only be created with a real, schedulable schedule because four lines in one file say so. If those lines are changed or removed, the suite stays fully green, and the failure shows up as a founder who finishes onboarding and lands on a group that will never schedule anything: no first event, and the hourly job has nothing to work from. That is the worst possible first impression, and it is the exact scenario CLAUDE.md calls out as a "no bypass" rule.
- **evidence** — The gate:
  ```
  const rhythms = parseStoredRhythms(input.rhythms)
  if (!rhythms || parseRhythm(rhythms) === null) {
    return { error: "I lost track of your schedule. Go back a step and try again." }
  }
  ```
  Both helpers are well covered on their own in `src/lib/orbit/__tests__/rhythm.test.ts`, and `provisionFounderGroup` is covered in `src/lib/groups/__tests__/provision.test.ts` — but `provisionFounderGroup` performs no completeness check of its own, so the composition is the gate and the composition is untested. No test file imports `../create-group` or `@/app/actions/create-group` (verified by grepping every `*.test.ts`/`*.test.tsx` for `app/actions`; the only hits are the two failure-path tests for `extract-group` and `merge-gap`, plus nine `vi.mock` lines).
- **severity** — queue
- **confidence** — certain

### F-5-3: Eleven of the thirteen server actions are mocked in every test and executed by none

- **file:line** — `src/app/actions/` (whole directory); the mocking is visible at `src/app/groups/[id]/__tests__/GaugeChips.test.tsx:12`, `src/app/groups/[id]/__tests__/IdeaCard.test.tsx:7`, `src/app/groups/[id]/__tests__/ProposalChips.test.tsx:12`, `src/app/groups/[id]/info/__tests__/LeaveGroupButton.test.tsx:13`, `src/app/groups/[id]/info/__tests__/ManageMembers.test.tsx:13`, `src/app/groups/[id]/info/__tests__/ResetInviteLink.test.tsx:11`, `src/components/__tests__/RsvpControls.test.tsx:14`, `src/app/groups/[id]/__tests__/EventCard.test.tsx:6`, `src/app/events/[id]/__tests__/ProposalSection.test.tsx:7`
- **consequence** — Every rule that only exists at the moment a button is pressed — who is allowed to do this, is this plan still the plan, has this already been answered, does the page refresh afterwards — is unprotected. The library functions underneath are tested thoroughly and the buttons above are tested thoroughly; the layer that joins them, which is where all of the permission and staleness rules live, is tested nowhere. This is why F-5-1 and F-5-2 are possible at all, and it is the single largest shape in the suite's coverage.
- **evidence** — The thirteen actions are `create-group`, `detect-intent`, `extract-group`, `gauge-vote`, `join-group`, `leave-group`, `merge-gap`, `proposal-answer`, `proposal-vote`, `remove-member`, `reset-invite-link`, `rsvp`, `send-message`. Only two are ever invoked by a test: `extractGroupAction` (`src/app/actions/__tests__/extract-group.test.ts`) and `mergeGapAction` (`src/app/actions/__tests__/merge-gap.test.ts`), and both only along their model-failure branches, with the model call itself mocked. Guards that exist only in an action and nowhere below it, all uncovered: the membership check in `proposal-vote.ts:82`, the membership and asker checks in `proposal-answer.ts:68` and `:63`, the early membership refusal in `gauge-vote.ts:82`, the stale-plan guards in `proposal-vote.ts:91-96` and `proposal-answer.ts:96`, the consensus-floor branch in `proposal-answer.ts:104`, the completeness gate in `create-group.ts:51-54`, and the membership gate in `detect-intent.ts:79`.
- **severity** — queue
- **confidence** — certain


### F-5-4: The hourly job, as production actually runs it, is exercised by no test at all

- **file:line** — `src/app/api/cron/orbit/route.ts:26`
- **consequence** — The recurring plan appearing every week, an idea getting its one last-call, and a stalled time-change vote finally closing are all carried by one hourly job. Nothing in the suite ever runs that job. Two things follow. First, the three sweeps run in a single sequence: if the first one fails, the second and third are skipped for that hour and the whole call reports a server error, so a fault in scheduling silently takes out the idea bumps and the vote closures with it, and no test would notice. Second, the job's own front door (the check that only Vercel may call it) is unprotected, so a mistake there would either lock the job out of its own product or open it to anyone who guesses the URL.
- **evidence** — No test file references the route or `CRON_SECRET` (grep across all 92 test files returns nothing). The handler runs the three sweeps inside one `try`:
  ```
  const results = await reconcileScheduledEvents(new Date())
  const endgame = await runGaugeEndgame(new Date())
  const proposalEndgame = await runProposalEndgame(new Date())
  ```
  Separately, every sweep test passes a `{ groupId }` scope that production never passes — `src/lib/orbit/__tests__/reconcile.test.ts:6` ("EVERY call here is scoped with { groupId }. Do not remove that"), `src/lib/proposals/__tests__/endgame.test.ts:5`, `src/lib/orbit/__tests__/endgame.test.ts:6`. The unscoped branch (`src/lib/orbit/reconcile.ts:59`, `await prisma.group.findMany()`; `src/lib/proposals/endgame.ts:73` and `src/lib/orbit/endgame.ts:134`, the `...(opts?.groupId ? { groupId: opts.groupId } : {})` spread) is the branch production takes every hour and the one branch no test enters. The scoping rule is well-reasoned and I am not proposing it change; the point is that it leaves the production path uncovered and nothing else covers it.
- **severity** — queue
- **confidence** — certain

### F-5-5: Any file change made through the shell instead of the editor bypasses both safety-net hooks silently

- **file:line** — `.claude/settings.json:8` and `:19` (both matchers read `"matcher": "Edit|Write|MultiEdit"`)
- **consequence** — The two guards the project relies on (nothing edits an applied migration or the secrets file; the full suite runs before a task is called finished) only fire when a file is changed through the editing tools. A change made by a shell command — `git checkout`, a `sed`, a small script, a dependency install — fires neither. The suite then does not run at the end of that task, and the finish looks exactly like a clean one. This is not hypothetical: `Bash(git checkout *)`, `Bash(npm install *)`, `Bash(node -e ' *)` and `Bash(python3 -c ' *)` are all standing allowed permissions in this repo, and switching branches mid-session is normal here.
- **evidence** — `.claude/settings.json` registers `protect-paths.mjs` on `PreToolUse` and `run-tests-unless-docs.mjs` on `PostToolUse`, both with `"matcher": "Edit|Write|MultiEdit"`. The stop-hook gate is driven entirely by the stamp that the PostToolUse hook writes: `needsFullRun` in `.claude/hooks/suite-stamp.mjs:98` returns `false` when the edited stamp is absent (`if (editedAt === null) return false // nothing was ever edited: nothing to verify`), and `runStop` in `.claude/hooks/full-suite-on-subagent-stop.mjs:55` returns 0 immediately on that answer. So a session that changed code only through the shell reaches its Stop hook with no stamp, skips the suite, and reports success. The permission allowlist is at `.claude/settings.local.json:17` (`"Bash(git checkout *)"`), `:8` (`"Bash(npm install *)"`), `:27` (`"Bash(node -e ' *)"`).
- **severity** — queue
- **confidence** — certain

### F-5-6: The members-only wall is written out three times by hand, and no test protects any of the three

- **file:line** — `src/app/groups/[id]/page.tsx:70`, `src/app/events/[id]/page.tsx:53`, `src/app/groups/[id]/info/page.tsx:52`
- **consequence** — "A group is invite-only" is one of the promises the product makes loudest, and it is what stops a stranger holding a shared URL from reading a group's chat, member list, and plans. On three of the four surfaces that promise is kept by a line of hand-copied code with nothing checking it. A refactor that touched any one of those pages could open a group's chat to the public and leave the suite fully green.
- **evidence** — The same expression is repeated verbatim in three files, e.g. `src/app/groups/[id]/page.tsx:70`: `viewer !== null && group.memberships.some((m) => m.userId === viewer.id)`, followed by `if (!viewerIsMember) return <MembersOnlyWall />`. `src/components/__tests__/MembersOnlyWall.test.tsx` tests only what the wall *says* once it is rendered, never that any page renders it. The fourth surface, the calendar file, IS covered end to end (`src/app/events/[id]/calendar.ics/__tests__/route.test.ts` builds a member and an outsider fixture and drives the real `GET`), which shows the pattern is testable in this codebase — the route test mocks only `getCurrentUser`.
- **how this differs from suppression #23** — #23 registers that server-rendered screens are not component-tested, as a coverage *shape*. This is narrower and different in kind: a named always-true rule from CLAUDE.md ("Membership is a real boundary... every write path refuses a non-member server-side") is enforced by three hand-duplicated copies with no shared helper, while the one surface that was made testable (the calendar route) proves that testing it needs only a single mocked function. The finding is the duplication plus the absent guard, not the general fact that pages are unrendered in tests.
- **severity** — queue
- **confidence** — certain

### F-5-7: The onboarding wizard's whole flow is orchestrated by one untested client component

- **file:line** — `src/app/create/OnboardingWizard.tsx:39`
- **consequence** — Creating a group is the first thing anyone does with the product, and the investor's first click. Every piece it is made of is tested well; the thing that joins them is tested nowhere. The failure modes this leaves unguarded are exactly the ones a founder would meet and nobody would see coming: the clarifying-question loop not ending after two answers, the founder's typed description or meeting spot being lost between steps, an error leaving the founder stuck on a step with no way forward, or the confirm step firing twice.
- **evidence** — The component is `"use client"` (`src/app/create/OnboardingWizard.tsx:14`) and holds fifteen pieces of state plus the whole step machine: `const [step, setStep] = useState<"describe" | "gap" | "playback" | "share">("describe")` (line 40), the gap-round counter and its exhaustion path (`setGapExhausted(true); setStep("describe")`, lines 147-148), the venue edit path (line 161) and the confirm path (line 167). No test file imports it. This is not the server-rendered-screen limitation: three of its own children are already tested with the repo's existing jsdom + `vi.mock` harness (`src/app/create/__tests__/Step1DescribeUnavailable.test.tsx`, `src/app/create/__tests__/Step3Share.test.tsx`, and the shared pieces in `src/components/__tests__/`), so the wizard is testable with what is already in the repo and simply is not tested.
- **severity** — queue
- **confidence** — certain

### F-5-8: "No em-dashes in anything Orbit says" holds today by hand, with essentially nothing checking it

- **file:line** — `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx:18` (the only guard of its kind in the suite)
- **consequence** — One of Orbit's stated voice rules is enforced by a single assertion on a single static empty-state message. Every line Orbit actually speaks — the spark proposal, the tally, the last call, the goodbye, the change announcement, the day question, the honest declines — is unchecked. An em-dash slipping into any of them would ship, and would only be found by the owner reading it in the product.
- **evidence** — A scan of every string literal outside `__tests__` across `src/` finds exactly one em-dash, in a server log line (`src/app/api/cron/orbit/route.ts:45`), so the rule genuinely holds right now. The only assertion enforcing it is `expect(container.textContent).not.toMatch(/[—–]/)` at `src/app/groups/[id]/__tests__/CardRegionEmpty.test.tsx:18`. The copy modules that hold Orbit's voice — `src/lib/orbit/spark-copy.ts`, `change-copy.ts`, `announce.ts`, `day-comment-plan.ts`, `endgame.ts`, `gap.ts` — have thorough tests of *what* they say and none of this rule. The related group-name path is different and IS covered: `normalizeExtraction` strips em/en dashes from the model's suggestion, tested at `src/lib/orbit/__tests__/normalize.test.ts` ("caps, strips em/en dashes, collapses whitespace").
- **severity** — queue
- **confidence** — certain

### F-5-9: Every test teardown hides its own failures, so a broken cleanup leaks rows into the shared database in silence

- **file:line** — `src/lib/groups/__tests__/join.test.ts:14`, and the same pattern in 24 other database-backed test files
- **consequence** — When a test finishes it deletes the groups, people and messages it invented. If any of those deletions fails, the failure is swallowed and the run still reports green, so the leftovers stay in the shared test database forever. The project has already been bitten by exactly this class of residue once: a leftover row put a phantom card on a QA group's home screen during a walkthrough, and it took a database query to establish it was junk rather than a product bug. That is the cost, and it lands on the owner's own manual QA rather than on a user.
- **evidence** — Every teardown is written as a swallowed delete, e.g. `src/lib/groups/__tests__/join.test.ts:14`: `await prisma.group.delete({ where: { id } }).catch(() => {})`. The same `.catch(() => {})` appears on every cleanup delete in `src/lib/auth/__tests__/membership.test.ts`, `src/lib/events/__tests__/rsvp.test.ts:16-18`, `src/lib/gauges/__tests__/promote.test.ts:69-75`, `src/lib/proposals/__tests__/proposals.test.ts:33-40`, and the rest. The residue risk is not hypothetical: `src/lib/orbit/__tests__/reconcile.test.ts:15-19` documents the walkthrough incident in its own header. Two things I did check and found clean, so this is narrower than it might sound: every fixture id carries a timestamp plus a random suffix, so runs cannot collide; and no test reads a row it did not create (I checked every `findMany`/`findFirst`/`count` in every test file and all of them are scoped), so the suite genuinely does run green from an empty database.
- **how this differs from suppression #18** — #18 registers near-duplicate groups left behind by repeated *onboarding* runs, a data-hygiene chore. This is a different mechanism: the automated suite's own teardown cannot report a failure, so nobody would ever learn that cleanup stopped working. Fixing #18 by clearing the database would not fix this.
- **severity** — queue
- **confidence** — unsure — the mechanism is certain, but I could not confirm that rows are actually leaking today. Counting `[TEST]`-prefixed rows in the dev-test database was blocked (see "What I could not check").

## Appendix (real, but no product consequence)

### A-1: Four React test files render without `afterEach(cleanup)` and pass by luck of unique queries

`src/components/__tests__/WizardHeader.test.tsx:7`, `src/app/groups/[id]/__tests__/MessageFeed.test.tsx:7`, `src/components/__tests__/MembersOnlyWall.test.tsx:6`, `src/components/__tests__/OrbitNoteScreen.test.tsx:6` (each anchored at its `describe(` line, since the missing call is an absence). Every other React test file in the repo calls `afterEach(cleanup)` and `src/components/__tests__/BackLink.test.tsx:29` explains exactly why ("Testing Library only auto-cleans between tests when Vitest globals are on, and this project's config does not enable them"). These four work today only because each of their queries happens to be unique across the accumulated DOM. A third test added to `WizardHeader.test.tsx` asserting `screen.getByText("Orbit")` would fail on a multiple-match error that has nothing to do with the change being made.

### A-2: A dead variable in the RSVP test reads as a leftover

`src/lib/events/__tests__/rsvp.test.ts:60`: `const authId = \`test-rsvp-auth-${userId ? "" : Date.now()}\`` is assigned and never used; the next two lines fetch the real auth id from the database instead. The expression is also nonsense on its face (it produces a fixed string whenever `userId` is set). Harmless, and confusing to the next reader.

### A-3: One assertion in the roster tests is weaker than the one three lines above it

`src/lib/events/__tests__/roster.test.ts:107`: `expect(parts.length).toBeGreaterThan(1)` for the separator-dot rule, when the test at line 100 already pins the exact string `"4 In · 1 Out · 4 TBD"`. It can still fail, so it is not a test that cannot fail; it is just redundant and looser than its neighbour.

### A-4: `src/lib/__tests__/prisma.smoke.test.ts` is order-dependent between its own tests

Tests two and three reuse ids set by test one, and the file says so in a comment at line 15 ("Do NOT reorder or mark them concurrent"). It works, it is documented, and nothing in the config would reorder it. Noted only because it is the one file in the suite where reordering would break things.

## What I could not check

- **Whether test rows are actually leaking into the dev-test database today.** I wrote a read-only row-count probe (`prisma.user.count({ where: { name: { startsWith: "[TEST]" } } })` and the same for groups and events) and running it was refused. **Layer: Anthropic built-in** (the auto mode classifier). This changed the outcome: F-5-9's mechanism is confirmed from the code, its actual effect is not, which is why that finding is filed `unsure`. A count of `[TEST]`-prefixed users, groups and events on the dev-test database would settle it in one query.
- **Whether removing a guard actually leaves the suite green.** The audit is read-only, so I could not delete the membership check in `proposal-vote.ts` and re-run. F-5-1 and F-5-2 are argued from the absence of any test that executes those functions, which I verified by grepping every one of the 92 test files, not from an experiment.
- **Whether the hooks behave correctly when Claude Code actually drives them.** I did not run `scripts/qa-test-hooks.sh`: it drives the real hooks and would take about two minutes of full-suite time, and one of its steps writes a deliberately failing test file into `.claude/hooks/`, which is a write this audit is not allowed to make. My reading of the hooks is from the source and their own test files, both of which are unusually thorough.
- **Whether `vitest related` still resolves what the per-edit hook assumes.** The suite already proves this for one file (`.claude/hooks/run-tests-unless-docs.test.ts`, "really does select the tests that reach an edited source file", which spawns a real nested run against `src/lib/events/ics.ts`). I did not check whether it resolves correctly for `.tsx` components or for files reached only through a barrel.
- **Anything about the two eval benches.** Not run, per the brief. I confirmed only that neither is collected by the test runner: `find` reports 92 test files and `vitest list` reports 92, and nothing under `evals/` is named `*.test.*`, so the benches provably cannot masquerade as the suite.
- **Visual correctness.** Several component tests assert flex styles and note in their own comments that jsdom lays out nothing, so the wrap behaviour they describe is proven by the real-phone pass, not by them. That is honestly stated in the tests and I did not attempt to verify it.

## Coverage

### Files read in full

vitest.config.ts
package.json
.claude/settings.json
.claude/settings.local.json
.claude/hooks/run-tests-unless-docs.mjs
.claude/hooks/run-tests-unless-docs.test.ts
.claude/hooks/full-suite-on-subagent-stop.mjs
.claude/hooks/full-suite-on-subagent-stop.test.ts
.claude/hooks/suite-stamp.mjs
.claude/hooks/suite-stamp.test.ts
.claude/hooks/project-root.mjs
scripts/qa-test-hooks.sh
scripts/qa-protect-paths.sh
scripts/db-which.test.ts
src/components/__tests__/BackLink.test.tsx
src/components/__tests__/MembersOnlyWall.test.tsx
src/components/__tests__/NeedLabel.test.tsx
src/components/__tests__/OrbitBubble.test.tsx
src/components/__tests__/OrbitMark.test.tsx
src/components/__tests__/OrbitNoteScreen.test.tsx
src/components/__tests__/RsvpControls.test.tsx
src/components/__tests__/SendCircleButton.test.tsx
src/components/__tests__/ShareInviteLink.test.tsx
src/components/__tests__/TailedOrbitBubble.test.tsx
src/components/__tests__/WizardHeader.test.tsx
src/components/__tests__/choice.test.tsx
src/app/actions/__tests__/extract-group.test.ts
src/app/actions/__tests__/merge-gap.test.ts
src/app/groups/[id]/__tests__/IdeaCard.test.tsx
src/app/groups/[id]/__tests__/EventCard.test.tsx
src/app/groups/[id]/__tests__/MessageFeed.test.tsx
src/app/groups/[id]/__tests__/GroupHomeHeader.test.tsx (opening section)
src/app/groups/[id]/__tests__/CarouselRail.test.tsx (opening section)
src/app/events/[id]/calendar.ics/__tests__/route.test.ts (opening section)
src/lib/__tests__/prisma.smoke.test.ts
src/lib/auth/__tests__/membership.test.ts
src/lib/auth/membership.ts
src/lib/cards/__tests__/region.test.ts
src/lib/nav/__tests__/front-door.test.ts
src/lib/messages/__tests__/day-groups.test.ts
src/lib/groups/__tests__/initials.test.ts
src/lib/groups/__tests__/join.test.ts (opening section + announcement tests)
src/lib/groups/__tests__/provision.test.ts (opening section)
src/lib/events/__tests__/roster.test.ts
src/lib/events/__tests__/same-instant.test.ts
src/lib/events/__tests__/rsvp.test.ts
src/lib/events/__tests__/upcoming-list.test.ts
src/lib/events/__tests__/format.test.ts (assertions surveyed)
src/lib/gauges/__tests__/promote.test.ts (opening section)
src/lib/proposals/__tests__/consensus.test.ts
src/lib/proposals/__tests__/tally.test.ts
src/lib/orbit/__tests__/normalize.test.ts
src/lib/orbit/__tests__/spark.test.ts (first 400 lines)
src/lib/orbit/__tests__/extract.test.ts
src/app/actions/create-group.ts
src/app/actions/proposal-vote.ts
src/app/actions/proposal-answer.ts
src/app/api/cron/orbit/route.ts
src/lib/orbit/reconcile.ts (scope handling)
src/lib/proposals/endgame.ts (scope handling)
src/lib/orbit/endgame.ts (scope handling)
src/app/create/OnboardingWizard.tsx
src/app/groups/[id]/page.tsx, src/app/events/[id]/page.tsx, src/app/groups/[id]/info/page.tsx (membership-wall sections)

### Files analysed by targeted machine survey rather than read line by line

All 92 test files were run through scripted checks for: tests with no assertion at all (none found); tests whose only assertion is a weak `toBeDefined`/`toBeTruthy` (20 found, all of them on `getBy*` queries that throw when they miss, so all can still fail); expected values computed by the function under test (none found); expected values that are imported constants of the module under test (7 found, all asserting branch selection rather than the constant's content); `findMany`/`findFirst`/`count` without a fixture-scoped `where` (none found); cleanup deletes inside a `try` without a `finally` (none found); `it.skip`/`it.only`/`it.todo`/`xit` (none found); `.concurrent` (none found); `console` spies that could hide errors (none found); real-clock `new Date()` in a test body (2 found, neither load-bearing); fixture ids without randomness (none found); and early-return guards not preceded by an assertion or a throw (none found).

### Files assigned to me that I did NOT read

I did not read every one of the 92 test files line by line. The ones I did not open in full are the remaining `src/lib/**/__tests__` bodies: `events/create`, `events/ics`, `events/move`, `events/rsvp-membership`, `events/upcoming`, `gauges/day-comment`, `gauges/gauges`, `gauges/open-ask`, `gauges/threshold`, `gauges/vote-membership`, `groups/leave`, `groups/remove-member`, `groups/reset-invite`, `groups/timezone`, `messages/create`, `messages/create-membership`, `orbit/announce`, `orbit/change-copy`, `orbit/change-plan`, `orbit/day-comment-plan`, `orbit/endgame`, `orbit/fetch-window`, `orbit/gap`, `orbit/merge`, `orbit/model-errors`, `orbit/occurrence`, `orbit/playback`, `orbit/reconcile`, `orbit/rhythm`, `orbit/spark-copy`, `orbit/window`, `pending/derive`, `proposals/endgame`, `proposals/promote`, `proposals/proposals`, plus the remaining component tests (`CardRegionEmpty`, `FeedSeam`, `GaugeChips`, `GroupProposalChips`, `OrbitDownNote`, `ProposalChips`, `ProposalSection`, `AddToCalendarButton`, `Step1DescribeUnavailable`, `Step3Share`, the three `info/` ones) and `.claude/hooks/protect-paths.test.ts`. Every one of them went through the scripted survey above, and I sampled sections of most of them by grep for the specific behaviours I was checking. The honest limit: a subtle logical hole inside one of those bodies — a case that looks covered and is not — would not have been caught by the survey, and my confidence that the suite is well built rests on the ~35 files I did read in full being uniformly strong.

### Baseline

`npm test` on this checkout: **92 files, 935 tests, all passing, 71.41s.** `find` reports 92 test files and `vitest list --run` reports the same 92, so nothing in the repo is silently excluded from collection and nothing outside it is silently included.

### Overall read

This is a strong suite, and most of what this lane hunts for is genuinely absent. There are no tests that cannot fail, no ambient-data dependence, no order dependence between files, no timezone or clock flakiness, no over-mocking of the thing under test, and no skipped tests. Several test files argue against their own weak spots in comments and pick fixtures specifically so a regression cannot pass by coincidence (`day-groups.test.ts` and `MessageFeed.test.tsx` both choose zones the developer's own machine is not in, for exactly this reason). The safety-net hooks are the best-tested code in the repository.

The gap is one shape, and it is the same shape every time: **the suite tests the pieces and not the joins.** Library functions and presentational components are covered thoroughly; the layer where they are wired together — server actions, page-level guards, the wizard's state machine, the cron handler — is covered nowhere. That is where every permission rule, every staleness check and every "is this still allowed" question in the product lives, which is why F-5-1 through F-5-7 all sit in that layer.
