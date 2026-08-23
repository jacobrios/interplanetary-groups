# Lane 1, third pass: can the product be wrong about who is in?

*Rounds one and two are in `lane-1-counting-and-state.md` and
`lane-1-counting-and-state.round2.md` (F-1-1 … F-1-13). Nothing from either is repeated
here. This file carries only what a third, differently-angled read found, plus the things
I checked and deliberately did NOT report because a settled decision already covers them.*

## Findings

### F-1-14: A group whose standing plan is on two days a week only ever has one of them on the calendar, and the second appears while the first is already happening

- **file:line** — src/lib/events/upcoming-list.ts:38-42 (`hasUpcomingScheduledEvent`) with
  src/lib/orbit/reconcile.ts:76-80.
- **consequence** — A founder who says "we climb Mondays and Wednesdays at 8" gets a rhythm
  the product stores correctly, displays correctly on the group info page, and shows
  correctly on the invite screen. But the calendar only ever holds ONE of the two meetings
  at a time. Wednesday's plan does not exist while Monday's is still ahead: nobody can say
  they are coming, nobody can add it to their phone's calendar, and it does not appear on
  the group home at all. Wednesday's plan is created (and announced in chat) within the hour
  AFTER Monday's meeting has already started, which is both the least useful moment to be
  told and a notification landing while people are mid-activity. For a group meeting Saturday
  and Sunday this means under a day's notice for the Sunday, every week, forever. The card
  region was built to hold five cards; this is not a display limit, the second meeting
  genuinely does not exist yet.
- **evidence** — `parseRhythm` explicitly supports several days in one rhythm
  (`daysOfWeek: number[] // 0=Sun … 6=Sat`, rhythm.ts:19, validated as a non-empty array at
  rhythm.ts:98-101), and `computeNextOccurrence` returns only the **earliest** matching day
  (`if (occurrence.getTime() > after.getTime()) return occurrence`, occurrence.ts:171-173).
  The reconciler then refuses to create a second one while any future scheduled event exists:
  ```
  const alreadyScheduled = await hasUpcomingScheduledEvent(groupId, now)
  if (alreadyScheduled) { results.push({ groupId, status: "skipped", reason: "upcoming_exists" }); continue }
  ```
  and `hasUpcomingScheduledEvent` is satisfied by any single row
  (`where: { groupId, startsAt: { gte: now }, gaugeId: null }`). So the group holds at most
  one scheduled occurrence, and the guard only releases once `startsAt` is behind `now`,
  i.e. once the meeting has begun. The next hourly cron tick after that creates the second
  day's event and posts `buildAnnouncement` for it.
  **How this differs from the registered F-1-9** (round two): F-1-9 is about a SECOND
  RHYTHM (`json[0]` only) never being scheduled at all, for the life of the group. This is
  one single rhythm, correctly parsed, whose extra days ARE eventually scheduled — just
  never more than one at a time and never with more than a few hours' lead over the previous
  meeting's start. Different mechanism (the upcoming-exists guard, not the array index),
  different outcome (late rather than never), and a group with only one rhythm is affected.
- **severity** — queue
- **confidence** — certain about the code path (all three files read end to end; the guard
  and the single-occurrence return are both unambiguous). I did not run the reconciler
  against a clock to watch the second event appear.

### F-1-15: In three timezones, one day a year, a plan is booked for the day before the one the member asked for

- **file:line** — src/lib/orbit/spark-copy.ts:203 (`chooseProposedDate`'s local-midnight
  write), 218-222 (`chooseRetryGuessDate`), 245-256 (`chooseSuggestedRetryDate`), all via
  src/lib/orbit/occurrence.ts:65-90 (`zonedWallTimeToUtc`).
- **consequence** — The product remembers "which day an idea is for" by storing midnight in
  the group's own timezone. In a handful of places on earth the clocks jump forward AT
  midnight, so that midnight does not exist on that date, and the stored instant silently
  lands on the previous day instead. In those groups, on that one date, a member who says
  "climbing Sunday?" gets Orbit proposing Saturday, the chips saying Saturday, and, if three
  people say yes, a real event created for Saturday. The product is internally consistent
  about it (it says Saturday and books Saturday), so the failure is visible rather than
  silent, and a member can correct it. Affected zones, measured across all 418 IANA zones
  for 2026: America/Havana (8 Mar), America/Santiago (6 Sep), Atlantic/Azores (29 Mar).
  Chile is the one of the three with a plausible user base. Two more zones (Africa/Cairo 24
  Apr, Asia/Beirut 29 Mar) shift the stored instant to 1am on the correct day, which is
  harmless because every reader only reads the date back off it.
- **evidence** — Every "which day" value in the gauge family is written as group-local
  midnight, e.g.
  `return zonedWallTimeToUtc(today.year, today.month, today.day + offsetDays, 0, 0, timeZone)`
  (spark-copy.ts:203), and every reader gets the day back with
  `const day = getLocalParts(proposedDate, timeZone)` (`sparkStartInstant`, spark-copy.ts:125).
  `zonedWallTimeToUtc` does two refinement passes and then returns whatever it landed on; it
  has no concept of a wall time that does not exist. I ran the shipped function over every
  IANA zone for every day of 2026 and read the value back through the shipped `getLocalParts`:
  ```
  zones scanned: 418   zones with a bad local-midnight day in 2026: 5
  Africa/Cairo     ["4/24 -> 4/24 01:00"]
  America/Havana   ["3/8  -> 3/7 23:00"]
  America/Santiago ["9/6  -> 9/5 23:00"]
  Asia/Beirut      ["3/29 -> 3/29 01:00"]
  Atlantic/Azores  ["3/29 -> 3/28 23:00"]
  ```
  (Node v24, `npx tsx`, importing `zonedWallTimeToUtc` and `getLocalParts` from
  `src/lib/orbit/occurrence.ts` directly; read-only, nothing written.) The three "23:00"
  rows are the day-shifting ones. The recurring-rhythm path is NOT affected, because
  `computeNextOccurrence` converts the rhythm's own wall time (e.g. `08:00`), not midnight
  — unless a group's standing meeting is itself at midnight.
  **How this differs from registered item 20**: that item is `zonedWallTimeToUtc`'s
  pre-dawn large-negative-offset quirk, fixed in the occurrence slice, and it is about the
  refinement arithmetic. This is a different thing: the arithmetic is correct, the wall time
  being asked for simply does not exist on that date in that zone, and the function has no
  policy for that case. It is also a different call site family (the gauge date choosers,
  not `computeNextOccurrence`).
- **severity** — queue
- **confidence** — certain that the conversion shifts the day in those three zones on those
  three dates (reproduced by running the shipped functions). Certain that `sparkStartInstant`
  and the weekday copy both read the date back off the shifted instant. I did not exercise a
  full gauge lifecycle in one of those zones against a database.

### F-1-16: The gauge promote re-reads the votes inside its transaction but keeps a stale snapshot of who the members are

- **file:line** — src/lib/gauges/promote.ts:62 (`memberIds` built outside the transaction)
  and 93 (that stale set filtering the freshly re-read votes), against
  src/lib/proposals/promote.ts:45-59 (which re-reads memberships inside the transaction).
- **consequence** — Someone removed from a group in the same moment as the third yes lands
  can still be counted toward the bar that creates the event, and can still be written onto
  the new plan as coming. Conversely someone who joins in that same moment has their yes
  thrown away. The window is milliseconds, so this is a hardening gap rather than a fault
  anyone will hit, and it matters mainly because its sibling function does the same job
  correctly, which means the next person to read either one will draw the wrong conclusion
  about which pattern the codebase follows.
- **evidence** — `promoteGaugeToEvent` takes memberships from the pre-transaction read:
  ```
  const memberIds = new Set(gauge.group.memberships.map((m) => m.userId))
  ```
  and then, inside the transaction, re-reads only the votes and filters them with that same
  outside set:
  ```
  const votes = (await tx.gaugeVote.findMany({ where: { gaugeId: gauge.id }, ... }))
    .filter((v) => memberIds.has(v.userId))
  if (!hasReachedThreshold(votes)) throw new BelowThresholdInTx()
  ```
  The comment above it explains at length why the votes are re-read ("the loser's vote row
  can land after the winner's read") and does not mention memberships. The consensus promote
  reads all three inside its transaction in one `Promise.all` — votes, memberships and
  RSVPs — with the comment "Everything the bar reads is re-read here".
- **severity** — queue
- **confidence** — certain about the asymmetry; I did not exercise a concurrent
  membership delete.

### F-1-17: Someone removed from a group and let back in brings their old answers with them, and can push an idea to three yeses that never becomes a plan

- **file:line** — prisma/schema.prisma:65-75 (a `Membership` delete cascades nothing),
  src/lib/groups/remove-member.ts:40 and src/lib/groups/leave.ts:38 (the delete), against
  src/lib/groups/join.ts:52-55 (the rejoin) and src/lib/events/roster.ts:59-70.
- **consequence** — Two things, both about the group being told something nobody said.
  First: a member the founder removes and later lets back in through the same invite link
  (the product's own documented flow, since only a link RESET actually keeps someone out) is
  shown to the whole group as coming to every future plan they had answered before, the
  instant they rejoin, without answering anything. Second, and worse: their old yes on an
  idea that is still being voted on starts counting again too, and nothing anywhere
  re-checks the bar when somebody joins. So the idea can be sitting at three yeses on the
  card, with three names in the tally, and no plan ever created from it, and then Orbit
  closes it with "Beers didn't come together this time" in front of the three people it is
  showing as in. Nobody in the group can tell why.
- **evidence** — Leaving and removal are a single row delete and nothing else
  (`await tx.membership.delete({ where: { id: membership.id } })`, both files), and the
  schema gives `Membership` no cascade onto `Rsvp`, `GaugeVote` or `ProposalVote` — each of
  those cascades from `User` and from its own parent only:
  ```
  model Rsvp { ... @@unique([eventId, userId]) }        // user relation onDelete: Cascade
  model GaugeVote { ... @@unique([gaugeId, userId]) }   // user relation onDelete: Cascade
  ```
  so the rows survive, keyed by the same user id. Rejoining is
  `tx.membership.createMany({ data: [{ userId, groupId }], skipDuplicates: true })`, which
  restores exactly the key every count filters on. `deriveRoster` then finds the old row
  again (`const status = rsvpByUserId.get(member.id)`), and the gauge tally's member filter
  (`g.votes.filter((v) => memberIds.has(v.userId))`, page.tsx:135) stops excluding their
  vote. Nothing re-runs a bar on a membership change: `promoteGaugeToEvent` and
  `promoteProposalMove` each have exactly one call site, both inside a vote action
  (grep-verified across `src/`), and neither `joinGroupByInvite` nor `joinGroupAction`
  touches either.
  **How this differs from the registered F-1-3**: F-1-3 reaches the same terminal state (a
  gauge at three yeses with no event, then a "didn't come together" message) through a
  promotion attempt that errored and was swallowed. Here no promotion is ever attempted at
  all — the third yes was already in the database before the membership came back, so there
  is no failed call to log and nothing to retry. Different trigger, and one that leaves no
  trace even in the server logs.
- **severity** — queue
- **confidence** — certain about the mechanism (schema, both delete paths, the rejoin write
  and all three count sites read directly; call sites grep-verified). Unsure how often a
  founder removes someone and then lets them back in, which is the only route into it, since
  a member who leaves voluntarily loses their way back to the link.

## Appendix (real, but no product consequence I can name)

**A-8: `handleRevive` seeds an IN vote for the day-namer without re-checking membership.**
`endgame.ts:537` passes `initiatorUserId: gauge.suggestedByUserId` into `createGauge`, and
`createGauge` writes that vote row unconditionally (`create.ts:88-92`). Every other seeding
path checks membership first (`castVote`'s in-transaction gate, `moveEventCoreInTx`'s
member-filtered `seedInUserIds`, `proposalAnswerAction`'s `isGroupMember`). A member who
names a day and then leaves the group before the sweep runs gets a vote row written for
them on the revival gauge. No consequence I can name, because every tally, the threshold
check and the promote all filter to current members, so the row is invisible everywhere —
which is exactly why it is here and not above.

**A-9: `recordDayComment` writes a vote onto a gauge without re-checking that the gauge is
still live.** `detect-intent.ts:136` fetches `liveGauges` before the model call and
`day-comment.ts:37-58` writes without re-reading liveness, so a gauge that closed during the
model round trip can still take a vote and a remembered day. The effect is at worst one
extra Orbit message (a `NOT_THAT_DAY` landing late can flip `isRetryEligible` from false to
true), which is the retry behaviour the product wants anyway. Recording it because the two
sibling paths that write after a model call (`moveEventCoreInTx`'s `expectedStartsAt`,
`promoteProposalMove`'s in-transaction re-read) both do re-check.

**A-10: `whenPhrase` and `buildSparkAnnouncement` round a wall-clock day gap, so an evening
plan six days out is described with its date rather than "this Sat".**
`(startsAt.getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000` at
change-copy.ts:83-85 and spark-copy.ts:647-649 is `6.79` for a 7pm plan six days out, and
`Math.round` takes it to 7, which trips the `>= THIS_WEEK_DAYS` branch. `buildGaugeMessage`
uses the same arithmetic but is immune, because its input is a stored local midnight and the
gap is a whole number. Copy precision only; the instant and the weekday are both right.

## What I checked and deliberately did NOT report

Listing these so a fourth pass does not spend the time again.

- **The gauge bar does not adapt to a group of two, while the time-change bar does.** Real,
  anchored (`threshold.ts:26` is a flat `>= SPARK_THRESHOLD` with no member count, against
  `consensus.ts:30-31`'s `Math.max(1, Math.min(3, memberCount))`), and already recorded and
  declined by the owner in build-notes at "Added 14 Aug 2026: the three-vote bar does not
  adapt to a small group". I verified the recorded safety condition still holds after the
  17 Aug event-copy pass: the trigger written down was "if that copy ever stops naming the
  number, this moves from deferred to a real gap", and `buildGaugeMessage` still ends
  "If three are in, I'll set it up." (spark-copy.ts:491) while `buildBumpMessage` still says
  "two more make it happen" (spark-copy.ts:602). Nothing to report.
- **A member with no RSVP who votes YES on a time change is written onto the moved plan as
  IN.** This is the recorded decision in CLAUDE.md ("every other yes carry through as an IN
  RSVP on the moved plan"), implemented at `promote.ts:82` / `move.ts:106-111`. It is a real
  way the product can be wrong about who is in, and it is settled, so I am not re-litigating
  it.
- **`incumbentCount` counts a member who RSVP'd OUT but tapped "Keep 7pm" as being on the
  old time's side.** Stated as intended in the module's own docstring (consensus.ts:9-13).
- **Every derived count filters to current members.** I traced all of them rather than
  trusting the claim: `deriveRoster` (from memberships), the two gauge tallies
  (`page.tsx:128,135` and `derive.ts:43`), `promoteGaugeToEvent` (`promote.ts:62-63,93`),
  `hasConsensus` (`promote.ts:59-70`), the endgame's `memberFilteredVotes`/`inVoterNames`
  (`endgame.ts:584-602`), and `moveEventCoreInTx`'s seeding. The self-healing claim holds
  everywhere except the millisecond window in F-1-16.
- **`consensusFloor` at every group size.** Worked 1 through 8 by hand against
  `hasConsensus`; a group of exactly three with all three IN reaches the bar
  (`3 >= 3 && 3 > 0`), a group of two needs both, a group of one is short-circuited before
  a proposal ever opens (`change-plan.ts:102`, `proposal-answer.ts:104`), so the seeded
  asker YES can never sit at the bar with nothing to promote it.
- **`day-groups.ts`'s day dividers.** Pure date-key arithmetic through `Date.UTC`, with the
  DST hazard already handled and commented; no wall-clock subtraction anywhere.
- **`normalizeIntent`'s bounds checks.** `targetEventNumber`, `answerDayOfWeek` and
  `dayCommentDayOfWeek` are all integer-and-range checked before use (spark.ts:284, 311, 351).

## What I could not check

- I did not run either eval bench (out of scope by the brief), so nothing here says anything
  about how reliably Orbit recognises a request.
- I did not exercise concurrency for F-1-16; the asymmetry is read from the code, and the
  window's real width is not measured.
- I could not test F-1-15 end to end. What I did reproduce, by running the shipped
  functions, is the conversion and the read-back. What I did not do is create a group in
  `America/Santiago` and walk a gauge through 6 Sep.
- I did not re-run `npm test`. Round one recorded 92 files / 935 tests passing at 89s on
  this same commit; nothing in this pass changed a file, and re-running it against the
  shared dev-test database while other lanes read would add risk and no information.

Evidence for this run: `npx tsc --noEmit` clean, exit 0. `git status --porcelain` shows only
the untracked audit findings files, so this pass wrote nothing into `src/`, `prisma/`,
`scripts/`, `evals/` or config. The two timezone probes for F-1-15 ran from the session
scratchpad and imported the shipped `src/lib/orbit/occurrence.ts` read-only; no dev server,
no migration, no seed, and neither eval bench was run.

## Coverage

Read in full this pass, independently rather than on round one's or round two's word:

- src/lib/events/rsvp.ts, roster.ts, create.ts, move.ts, upcoming.ts, upcoming-list.ts
- src/lib/gauges/create.ts, vote.ts, threshold.ts, promote.ts, read.ts, day-comment.ts, open-ask.ts
- src/lib/proposals/consensus.ts, create.ts, read.ts, tally.ts, promote.ts, endgame.ts
- src/lib/cards/region.ts
- src/lib/pending/derive.ts
- src/lib/orbit/endgame.ts, reconcile.ts, occurrence.ts, change-plan.ts, day-comment-plan.ts,
  window.ts, fetch-window.ts
- src/lib/orbit/rhythm.ts (`parseRhythm`, `parseStoredRhythms` head)
- src/lib/messages/day-groups.ts
- src/lib/groups/leave.ts, remove-member.ts
- src/app/actions/gauge-vote.ts, proposal-vote.ts, proposal-answer.ts, detect-intent.ts
- src/app/api/cron/orbit/route.ts
- src/app/groups/[id]/page.tsx (the data half)
- src/app/events/[id]/page.tsx (the data half)

Read in part (the sections this pass needed):

- src/lib/orbit/spark-copy.ts — the date choosers, `sparkStartInstant`, `gaugeClosesAt` /
  `isGaugeLive`, `startOfLocalDay`, both tally builders, the bump/closure/announcement copy
- src/lib/orbit/spark.ts — `normalizeIntent` and the normalized types
- src/lib/orbit/change-copy.ts — `changeStartInstant`, `whenPhrase`, the move announcement

Assigned but not read this pass, and why:

- `src/lib/events/ics.ts` and `src/lib/events/format.ts` — both covered in full by rounds one
  and two, including the `hour % 24` guard (their F-1-12); nothing in this pass's angles
  reached them.
- `src/lib/events/same-instant.ts` and `src/lib/orbit/promote-adjacent.ts` do not exist; the
  ledger names test files and a module that was never created. Confirmed absent, as round two did.
- Visual components. They render derived values and do not compute them; lanes 3 and 7 own them.
- Test files. This lane audits production code; lane 5 owns the tests.
