# The time change gets an ending

Slice document, 18 Aug 2026. Branch: `time-change-ending`. Baseline at slice start: 89 files / 899
tests green, matching PR #70's finishing number, no pre-existing failures.

## Front section (for the owner)

**Settled, do-not-relitigate.** The MVP shape is a close with no bump (owner, 14 Aug). A stalled
group time-change vote currently never ends: the chips already stop rendering at the boundary
(liveness is derived), but the row stays unanswered forever and nobody hears an ending, which
matters more since the tally and card notice were deleted. This slice closes the vote and says so,
once, in chat: around the moment the vote stops being answerable, Orbit posts one soft line ("The
time change didn't come together. Trivia Night is staying at 7pm."), and the row records LAPSED. A
vote made moot by the plan moving some other way closes silently, keeping the existing no-residue
rule. The sweep rides the existing hourly cron.

**Not in this slice:** any bump or reminder (deferred post-MVP, recorded 14 Aug); adapting the
three-vote bar to small groups (deferred, recorded 14 Aug); closing part-one VERIFY rows (invisible
either way; recorded below as debt); checkbox availability voting (deferred 14 Aug).

**Verification:** TDD against the dev-test database like the gauge endgame; a staged browser
walkthrough showing the closing message; recognition bench re-run only if the question copy
changes. **Expected debt:** the close lands on cron resolution, up to an hour late.

**Two open questions before build, recommendations below:** whether the chat question's "Works for
you?" copy rides this slice, and whether the post-vote acknowledgement does.

## Open questions for the owner

**Q1: does the question-copy fix ride this slice?** Orbit's chat ask still ends "Works for you?"
(availability framing) above chips that answer "Move to 8pm" / "Keep 7pm" (preference framing); the
event screen's own question already matches the chips. Recommendation: yes, include it. It is one
line in `buildGroupProposalQuestion`, this slice already owns this surface, and the mismatch sits on
the surface where most votes are cast. Proposed copy: "Casey wants trivia this Sat at 8pm instead of
7pm. Move it?" (the chips carry the specifics; the question stays short). The recognition bench
holds no fixture with the old string (verified by grep), but the bench runs once after the change
anyway, since Orbit reads its own messages as context.

**Q2: does the post-vote acknowledgement ride this slice, or stay post-MVP as queued?** The owner
queued it post-MVP on 17 Aug; the build note recommended it land here because this slice opens the
same surface and the deleted tally was the only thing that ever said where a vote stood.
Recommendation: include it, in the anti-clutter-safe form only: never a chat message (chip
responses never post a message per response, a standing guardrail), but a quiet line under the
event-screen chips, rendered only for a viewer who has voted: "Vote counted. If enough of the group
agrees, I'll move it and let everyone know." One sentence, per-viewer, no feed traffic. If the
answer is no, nothing else in the slice changes.

## Task detail (for the implementing agents)

### Task 1: terminal states in the schema

`ChangeProposal.answer` (`ProposalAnswer` enum: CONFIRMED / DECLINED / SUPERSEDED) gains one value:
**LAPSED**, the vote that timed out unanswered. The moot case (plan moved by some other path, so
`priorStartsAt` no longer matches the event) reuses **SUPERSEDED**, which already means "overtaken
before the group answered"; record this reuse in the migration's comment and build-notes. Additive
enum migration via the Prisma CLI (`npm run db:which` first, every time; the sanctioned path, since
direct migration edits are hook-blocked). `DECLINED` stays VERIFY-only.

### Task 2: the sweep, TDD

New module `src/lib/proposals/endgame.ts`, exporting `runProposalEndgame(now: Date)`. Pattern-match
`src/lib/orbit/endgame.ts` and its tests (`endgame.test.ts`: real dev-test DB, fixtures built per
test, cleaned after).

Scope: `kind: GROUP`, `answer: null`, past the liveness boundary the read layer already defines,
which is the single source of truth to mirror, not re-derive: a proposal is dead once
`min(proposedStartsAt, event.startsAt) <= now`, and moot once `priorStartsAt !==
event.startsAt`. Classification:

- **Moot** (prior no longer matches the event): write SUPERSEDED + `answeredAt`, post nothing. The
  no-residue rule for silently-retired questions is old and deliberate; the sweep only adds the
  bookkeeping row so the row count of forever-open proposals goes to zero.
- **Lapsed** (boundary passed, plan unmoved): write LAPSED + `answeredAt`, and post the closing
  message (Task 3) in the same transaction as the answer write, so a close can never half-exist,
  same shape as the join-line rule.

Idempotence: the answer write is the guard; a swept row can never sweep twice. Tests to write red
first: lapsed writes LAPSED and posts exactly one message; moot writes SUPERSEDED and posts
nothing; a live proposal is untouched; a CONFIRMED one is untouched; a second sweep run posts
nothing; VERIFY rows are untouched; the lapsed boundary uses min(proposed, start) on both orderings.

### Task 3: the closing copy

In `src/lib/orbit/change-copy.ts`: `buildProposalClosureMessage(label, priorStartsAt, timeZone)`,
returning "The time change didn't come together. ${Label} is staying at ${time}." Soft, no tally,
no names, no blame, no em dashes (product-voice rule). Unit tests beside the other copy builders.
Add the new speak-decision line to build-notes' "Where Orbit decides to speak or stay quiet" list
(standing rule: any slice adding one adds its line): lapsed close speaks once; moot close is
silent; a close after the event already started still posts (the cron is hourly, so it lands at
most ~an hour stale, and the asker was owed an answer; never-leave-a-direct-ask-hanging outranks
anti-clutter here, recorded as a decision).

### Task 4: cron wiring

`src/app/api/cron/orbit/route.ts` adds `runProposalEndgame(new Date())` beside `runGaugeEndgame`,
reporting its counts in the same response shape. No schedule change.

### Task 5 (only if Q1 = yes): the question copy

`buildGroupProposalQuestion` ends "Move it?" instead of "Works for you?". Update its unit test
first, red. Grep confirmed no bench fixture and no QA script carries the old string; re-run
`npm run eval:detect` once after, expecting the standing baseline (80/80, 65/65, 10/20 with the
same two known ambiguous failures); record numbers in build-notes.

### Task 6 (only if Q2 = yes): the acknowledgement line

Event-screen only (`ProposalSection`), rendered under the chips only when `viewerAnswer` is not
null: "Vote counted. If enough of the group agrees, I'll move it and let everyone know." Quiet
styling (meta size, `--text-secondary`), never teal, never a chat message. Component test: absent
before voting, present after, exact copy pinned.

### Task 7: records and handoff

Build-notes §11 entry (decisions, numbers, debt); CLAUDE.md current-state rewrite for the slice
boundary ("the next slice is..." line retires); pre-deploy checklist gains the migration
obligation (standing rule: a slice creating a deploy-time obligation appends it in the same PR);
staged walkthrough + QA script per the handoff checklist. Debt to record: hourly close jitter;
VERIFY rows still linger unanswered (invisible: their chips already die at the boundary and no
sweep touches them); no bump, standing deferral.
