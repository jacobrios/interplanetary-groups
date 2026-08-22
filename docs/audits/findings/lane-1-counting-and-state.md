# Lane 1: Can the product be wrong about who is in?

*Coverage and the honest gaps are at the end of this file.*

## Findings

### F-1-1: Opening a time-change vote in one group silently kills the same person's open vote in a different group
- **file:line** — src/lib/proposals/create.ts:118-125
- **consequence** — Someone who belongs to two groups (the product supports this from day one) and asks to move a plan in each will have the first group's vote silently cancelled the moment the second one opens. Nobody in the first group is told. Orbit's question stays sitting in that group's chat with its chips gone, the votes people already cast stop counting, and the plan never moves. The people who voted have no way to know their answer was thrown away.
- **evidence** — `createGroupProposal` retires prior open proposals with an `updateMany` that carries no `groupId` filter:
  ```
  await tx.changeProposal.updateMany({
    where: {
      answer: null,
      id: { not: resolveVerifyProposalId ?? "" },
      OR: [{ kind: ProposalKind.GROUP, eventId }, { askerUserId }],
    },
    data: { answer: ProposalAnswer.SUPERSEDED, answeredAt: now },
  })
  ```
  The first `OR` branch is naturally group-scoped (an `eventId` belongs to one group). The second, `{ askerUserId }`, matches **every** open proposal that user has authored anywhere in the database, including VERIFY questions in other groups. `ChangeProposal.groupId` exists and is indexed (prisma/schema.prisma:355) but is not used here. SUPERSEDED is deliberately the silent ending (src/lib/proposals/endgame.ts:8-10), so the cancellation produces no message.
- **severity** — fix-now
- **confidence** — certain (read directly from the query; not reproduced against a live database)

### F-1-2: One failing group in the hourly sweep stops every gauge closure and every time-change closure, for every group
- **file:line** — src/app/api/cron/orbit/route.ts:49-56, with src/lib/orbit/reconcile.ts:129-130
- **consequence** — The hourly job does three things in order: create the next recurring event, close out stalled ideas, and close out stalled time-change votes. If the first step hits an unexpected error on any single group, the whole run aborts and the other two never execute — for every group in the product, not just the broken one. The visible result is Orbit going quiet everywhere: last calls stop, "didn't come together this time" stops, and a time-change vote that stalled never gets its closing line. Nothing surfaces this; it just looks like Orbit stopped caring. Both sweeps were carefully written to survive a single bad row (each catches per item and continues), and this outer wrapper undoes that protection for the pair of them.
- **evidence** — The cron handler runs all three sequentially inside one try/catch:
  ```
  const results = await reconcileScheduledEvents(new Date())
  const endgame = await runGaugeEndgame(new Date())
  const proposalEndgame = await runProposalEndgame(new Date())
  ```
  `reconcileScheduledEvents` deliberately re-throws anything that is not a P2002: `// Any other error is unexpected — re-throw so the cron handler can log it` / `throw err` (reconcile.ts:129-130). It loops over **all** groups with no per-group try/catch, so the throw escapes the loop as well. Contrast `runGaugeEndgame` (src/lib/orbit/endgame.ts:145-151) and `runProposalEndgame` (src/lib/proposals/endgame.ts:82-88), which both wrap each item: `catch (err) { console.error(...) }` and continue. A concrete reachable throw: `computeNextOccurrence` throws `"no occurrence found in 14 days"` (src/lib/orbit/occurrence.ts:176) — `parseRhythm` guarantees a non-empty valid `daysOfWeek`, so this is defensive rather than routine, but any database or driver hiccup on one group produces the same outcome.
- **severity** — queue
- **confidence** — certain (control flow read directly; I did not force a failure)

### F-1-3: A gauge that reaches three yeses but fails to become an event is never retried, and Orbit later announces it "didn't come together"
- **file:line** — src/app/actions/gauge-vote.ts:119-125, src/lib/orbit/endgame.ts:264-267 and 545-553
- **consequence** — Three people say yes to an idea. If the one attempt to turn it into a real plan hits a hiccup, nothing ever tries again: no sweep, no later vote, nothing. The idea sits at three yeses with no plan on the board, and then Orbit posts "Beers didn't come together this time. Maybe next week." to a group where three people just said they were coming. Orbit contradicting its own promise in front of the people who answered it is the worst possible version of this failure, and there is no path back except somebody floating the idea again from scratch.
- **evidence** — The promotion is deliberately best-effort and swallowed:
  ```
  if (answer === GaugeAnswer.IN) {
    try { await promoteGaugeToEvent(gaugeId, new Date()) }
    catch (err) { console.error("[gauge-vote] promotion failed", err) }
  }
  ```
  `promoteGaugeToEvent` is called from exactly one place (verified by grep across `src/`); no cron path calls it. The endgame sweep knows this state exists and explicitly declines to fix it — its `already_at_bar` skip comment reads "a promotion attempt that committed the votes but rolled back the event creation" — and it only uses that reason to avoid rendering broken bump copy (endgame.ts:264-267). When the gauge later closes, `isRetryEligible` is false (it requires `inCount < SPARK_THRESHOLD`, threshold.ts:45), so `handleOne` falls through to `handleClose`, which posts `buildClosureMessage` because `countIn >= 1`. The vote rows survive; only the event and the announcement roll back.
- **severity** — queue
- **confidence** — certain about the code path (grep-verified single call site, traced the close branch); I did not induce a promotion failure to observe it

### F-1-4: A time-change vote that reaches its bar because someone dropped out, or left the group, is never re-checked and lapses instead of passing
- **file:line** — src/app/actions/proposal-vote.ts:114-120, src/app/actions/rsvp.ts:55-62
- **consequence** — The bar for moving a plan depends on two moving numbers: how many said yes, and how many are still in on the old time. Only a new yes ever re-checks it. So if the vote is one short and a member who was coming at the old time then RSVPs out (or leaves the group), the arithmetic now says the change should pass, and nothing notices. The vote sits there, and hours later Orbit closes it with "the plan is staying at 7pm" — an outcome the rows do not support. The people who voted are told the group decided something the group did not decide.
- **evidence** — `hasConsensus` reads both sides (src/lib/proposals/consensus.ts:44-47): `yes >= consensusFloor(i.memberCount) && yes > incumbentCount(i)`, and `incumbentCount` is `(currentInUserIds ∪ keepVoterIds) minus yes`. `currentInUserIds` comes from live RSVP rows re-read inside the promote transaction (src/lib/proposals/promote.ts:54-57). But `promoteProposalMove` is only ever invoked from `proposalVoteAction`, and only on a YES:
  ```
  if (answer === ProposalVoteAnswer.YES) {
    try { await promoteProposalMove(proposal.id, new Date()) } ...
  }
  ```
  `rsvpAction` calls `setRsvp` and nothing else; `leaveGroup` and `removeMember` delete a membership row and nothing else. Worked example: 8 members, 6 IN on the current time, 3 of them vote YES. floor = 3, incumbent = 3, `3 > 3` is false, no move. One of the other three IN members then taps "Can't make it": incumbent becomes 2 and the bar is met, but no code path re-evaluates. `runProposalEndgame` only ever writes LAPSED or SUPERSEDED; it never checks consensus (src/lib/proposals/endgame.ts:92-118).
- **severity** — queue
- **confidence** — certain about the mechanism (all three call sites read; arithmetic traced by hand). Not reproduced against a database.

### F-1-5: Orbit's one retry guess has a four-hour window to fire, and is lost silently if the hourly job misses it
- **file:line** — src/lib/orbit/endgame.ts:132-142 (the ±2-day candidate window) with endgame.ts:398-402 (the guess moment)
- **consequence** — When an idea fails because of the day, Orbit is meant to make exactly one guess the next evening. In practice that guess can only be made during four specific hourly runs. Miss them — a deploy, a brief outage, a slow run — and the guess never happens at all, silently, with no record. The group's stalled idea simply ends where the code was written to give it one more chance. Nobody would ever notice this happened.
- **evidence** — The sweep's candidate query only loads gauges whose `proposedDate` is within two days of `now`:
  ```
  proposedDate: { gte: new Date(now.getTime() - WINDOW_MS), lte: new Date(now.getTime() + WINDOW_MS) }
  ```
  (`WINDOW_MS = 2 * 24 * 60 * 60 * 1000`, endgame.ts:104). `handleGuess` then refuses to fire until the evening after the failed day: `if (dayDiff < 1 || (dayDiff === 1 && nowParts.hour < BUMP_LOCAL_HOUR)) return ... "awaiting_answer"` with `BUMP_LOCAL_HOUR = 20`. For a failed day D at group-local midnight, the earliest eligible instant is D+1 20:00 local and the window closes when `now - 48h` passes `proposedDate`, i.e. D+2 00:00 local. That is exactly the 20:00, 21:00, 22:00 and 23:00 runs. The file acknowledges the class of risk ("Under a long outage the ask-to-guess gap compresses; accepted, and the window ages the gauge out regardless", endgame.ts:396-397) but the actual tolerance is four hourly ticks, not a long outage.
- **severity** — queue
- **confidence** — likely (arithmetic worked by hand for America/New_York and for UTC; I did not run the sweep against a clock to confirm the boundary empirically)

### F-1-6: Two people answering in the same moment can leave one of them saying yes and the plan showing them as not having replied
- **file:line** — src/lib/gauges/promote.ts:56-57 and 134-146; same shape at src/lib/proposals/promote.ts:31-38 with src/lib/events/move.ts:106-111
- **consequence** — Two members tap "I'm in" at almost the same instant and the third yes creates the plan. One of those two can end up with their yes recorded on the idea but no answer on the plan it became, so the event card shows them as "haven't replied", the counts are short by one, and they get asked a question they already answered. On the time-change side the same collision is worse in one way: Orbit announces "I marked everyone who said yes as in", and for that person it is not true. This is the exact class of wrongness the product exists to avoid, and it happens without any error being logged.
- **evidence** — `promoteGaugeToEvent` re-reads votes inside its transaction specifically to close this race, and the comment says so: "the loser's vote row can land after the winner's read, and seeding the stale snapshot would leave that person with a yes on the gauge and no RSVP on the event." The re-read narrows the window but does not close it. If the second voter's row commits *after* the winner's in-transaction read, their own promote call exits before any transaction runs:
  ```
  if (gauge.event) return { status: "skipped", reason: "already_created" }
  ```
  and the P2002 branch does the same:
  ```
  if ((err as { code?: string }).code === "P2002") {
    return { status: "skipped", reason: "already_created" }
  }
  ```
  Neither exit writes an RSVP. `gaugeVoteAction` will not let them re-answer either, because an existing event short-circuits it: `if (existingEvent) return { errors: { general: "That one's already set. It's up top." } }` (gauge-vote.ts:98-100). The proposal path has the identical shape: `moveEventCoreInTx` seeds `seedInUserIds` from the votes read inside the transaction (move.ts:106-111), and a later YES voter's `promoteProposalMove` returns `not_live` on `proposal.answer !== null` without seeding (promote.ts:31-38).
- **severity** — queue
- **confidence** — likely — the code path is certain (both early-exit branches read, neither seeds), but I could not exercise a real concurrent write to confirm how wide the window is in practice

### F-1-7: One person asking about two different plans in a row silently cancels their first vote
- **file:line** — src/lib/proposals/create.ts:118-125
- **consequence** — A member says "can we move climbing to 8?" and then, a minute later, "and can we push beers to 9?". Opening the second vote silently ends the first: its chips vanish, the yeses already cast stop counting, and nobody is told. From the group's side an active question just disappears. The code intends this rule for the case where someone corrects themselves, which is reasonable, but the rule as written cannot tell a correction apart from a second, unrelated ask about a different plan.
- **evidence** — The same `updateMany` as F-1-1, second `OR` branch:
  ```
  OR: [{ kind: ProposalKind.GROUP, eventId }, { askerUserId }],
  ```
  The first branch handles "a newer vote on the same plan wins", which is the case the design rationale describes. The second retires every open proposal by that asker regardless of which event it is about. The stated reasoning in the comment is "a correction retracts the mistake it corrects", and SUPERSEDED is the deliberately silent ending, so there is no message either way.
- **severity** — queue (the owner may reasonably decline this: the code declares the behavior intentional, and a member asking about two plans back to back is less common than a correction)
- **confidence** — certain

### F-1-8: Two people asking to move the same plan at the same moment can open two competing votes, and the plan's own screen shows only one of them
- **file:line** — src/lib/proposals/create.ts:118-141, prisma/schema.prisma:332-357, src/lib/pending/derive.ts:85-102
- **consequence** — If two members ask to move the same plan within the same instant, the group can end up with two separate time-change questions about one plan sitting in the chat, each with its own chips, and the group's answers split between them so neither reaches its bar. On the plan's own screen only one of the two is shown at all, so a member who voted on the other one sees no trace of their vote there. Nothing anywhere says two questions exist.
- **evidence** — "One live group vote per plan" is enforced only in application code, by the supersede sweep inside `createGroupProposal`, which reads then writes: `updateMany({ where: { answer: null, ..., OR: [{ kind: GROUP, eventId }, ...] } })` followed by `changeProposal.create(...)`. Under READ COMMITTED two overlapping transactions can each run their sweep before the other's row is committed, so each finds nothing to supersede and both rows land. There is no database constraint behind the rule: `ChangeProposal` carries `@@unique([sourceMessageId, kind])` and `orbitMessageId @unique`, neither of which involves `eventId`. This is the one idempotency rule in the counting layer that is not backed by a unique constraint; every sibling is (`Gauge.sourceMessageId`, `Gauge.retryGuessOfGaugeId`, `Event.gaugeId`, `Event.scheduledKey`, `Rsvp @@unique([eventId, userId])`, `GaugeVote @@unique([gaugeId, userId])`). The event screen then silently keeps one: `deriveProposalBands` builds a `Map` keyed by event id (`bands.set(p.event.id, ...)`), so the second write overwrites the first. The chat feed renders both, since it maps proposals rather than keying them.
- **severity** — queue
- **confidence** — likely — the missing constraint and the map overwrite are certain; that two asks land inside the same transaction window is plausible but I could not reproduce it


---

*Addendum to F-1-4:* the same non-re-evaluation also swallows a failed promote. `proposalVoteAction` runs the promote best-effort and logs any error (`catch (err) { console.error("[proposal-vote] promote failed", err) }`, proposal-vote.ts:117-119). If the bar-clearing yes fails to move the plan, nothing retries; the sweep later lapses it and Orbit says the plan is staying.

## Appendix (real, but no product consequence I can name)

**A-1: Two resolution writes are unconditional where their siblings are conditional.**
`src/app/actions/proposal-answer.ts:80-83` (the DECLINE path) and `src/lib/proposals/create.ts:147-152` (`resolveVerifyProposalId`) both use a plain `prisma.changeProposal.update` with no `answer: null` guard, so a concurrent resolution can be overwritten. Every other resolution write in the codebase uses the conditional `updateMany({ where: { id, answer: null } })` shape and treats a zero-row result as a lost race (`move.ts:131-135`, `endgame.ts:132-138` and `177-181`). Both of these are VERIFY-kind rows whose endings are silent and asker-only, so an overwritten SUPERSEDED-to-DECLINED changes nothing anyone sees. Worth aligning the next time the file is open, not worth its own change.

**A-2: The calendar file's version number has one-minute resolution.**
`src/lib/events/ics.ts:85` sets `SEQUENCE:${Math.floor(event.updatedAt.getTime() / 60000)}`. Two time changes to the same plan inside the same minute produce the same sequence number, so a calendar app could treat the second file as not-newer. Registered item 19 already carries the honest limitation that a saved entry does not update itself; this is a narrower and much rarer corner of the same area, and no realistic group moves a plan twice within sixty seconds.

**A-3: Each server render calls `new Date()` several times.**
`src/app/groups/[id]/page.tsx` passes a fresh `new Date()` to `findUpcomingEvents` (line 79), `findLiveGauges` (112) and `findLiveProposals` (160). The instants differ by milliseconds, so an item sitting exactly on a boundary could in principle be included by one read and excluded by another within one render. The gaps are sub-millisecond in practice and every boundary in the product is on the hour or later, so I could not construct a case where this changes what a person sees.

## What I could not check
- I could not exercise concurrency. Every race in F-1-6 and the transaction guards throughout were read and reasoned about, not reproduced. My confidence on those is about the code path, not about how often the window is actually hit.
- I could not run the eval benches (out of scope by the brief), so nothing here says anything about how reliably Orbit *recognizes* a request. This lane covers what happens to the counts once a request is recognized.
- I did not verify the DST behaviour of `zonedWallTimeToUtc` empirically. I traced spring-forward and fall-back by hand for `America/New_York` and found the ambiguous-hour case resolves to the first (pre-transition) instant, which is the conventional answer, and the nonexistent-hour case resolves backwards to the hour before. Neither is reachable from this lane's paths in a way I could make matter: gauges anchor to local midnight and the hours in play are 8pm and 9am. Registered item 20 covers the one quirk that was already fixed there.
- I did not read `EventCarousel.tsx` / `CarouselRail.tsx` in full (swipe geometry, no counting), nor the visual-only components. `src/lib/events/ics.ts` I read only for its version and identity fields.
- Baseline evidence for this run: `npm test` → 92 files, 935 tests, all passing, 89s. `npx tsc --noEmit` → clean, exit 0. Both run on `main` at 76b93ec, with the only working-tree changes being the untracked audit findings files.

## Coverage

Read in full:
- src/lib/events/rsvp.ts
- src/lib/events/roster.ts
- src/lib/events/create.ts
- src/lib/events/move.ts
- src/lib/events/upcoming.ts
- src/lib/events/upcoming-list.ts
- src/lib/events/format.ts
- src/lib/gauges/create.ts
- src/lib/gauges/vote.ts
- src/lib/gauges/threshold.ts
- src/lib/gauges/promote.ts
- src/lib/gauges/read.ts
- src/lib/gauges/day-comment.ts
- src/lib/gauges/open-ask.ts
- src/lib/proposals/consensus.ts
- src/lib/proposals/create.ts
- src/lib/proposals/read.ts
- src/lib/proposals/tally.ts
- src/lib/proposals/promote.ts
- src/lib/proposals/endgame.ts
- src/lib/cards/region.ts
- src/lib/pending/derive.ts
- src/lib/orbit/endgame.ts
- src/lib/orbit/reconcile.ts
- src/lib/orbit/occurrence.ts
- src/lib/orbit/change-plan.ts
- src/lib/orbit/day-comment-plan.ts
- src/lib/orbit/rhythm.ts (parseRhythm / parseStoredRhythms)
- src/lib/messages/create.ts
- src/lib/groups/join.ts
- src/lib/groups/leave.ts
- src/lib/groups/remove-member.ts
- src/lib/auth/membership.ts
- src/lib/auth/current-user.ts
- src/app/actions/rsvp.ts
- src/app/actions/gauge-vote.ts
- src/app/actions/proposal-vote.ts
- src/app/actions/proposal-answer.ts
- src/app/actions/send-message.ts
- src/app/actions/detect-intent.ts
- src/app/actions/create-group.ts
- src/app/actions/join-group.ts
- src/app/actions/leave-group.ts
- src/app/actions/remove-member.ts
- src/app/api/cron/orbit/route.ts
- src/app/groups/[id]/page.tsx
- src/app/groups/[id]/GroupHome.tsx
- src/app/groups/[id]/GaugeChips.tsx
- src/app/groups/[id]/GroupProposalChips.tsx
- src/app/events/[id]/page.tsx
- src/app/events/[id]/ProposalSection.tsx
- src/app/events/[id]/calendar.ics/route.ts
- src/components/RsvpControls.tsx
- prisma/schema.prisma

Read in part (the sections this lane needed):
- src/lib/orbit/spark-copy.ts (time resolution, `gaugeClosesAt` / `isGaugeLive`, date choosers, both tally builders, bump/closure/announcement copy)
- src/lib/orbit/change-copy.ts (time resolution, chip labels, move and consensus announcements, lapse copy)
- src/lib/orbit/spark.ts (`normalizeIntent` only)
- src/lib/events/ics.ts (UID / DTSTAMP / SEQUENCE only)
- src/app/groups/[id]/EventCard.tsx, IdeaCard.tsx (count and label rendering only)
- src/app/groups/[id]/info/page.tsx (member list and count only)

Assigned but not read, and why:
- `src/lib/events/same-instant.ts` and `src/lib/orbit/promote-adjacent.ts` do not exist. `same-instant` is a test file only (`src/lib/events/__tests__/same-instant.test.ts`); the tie-break it covers lives in `upcoming-list.ts:61` and `cards/region.ts:49-53`, both of which I read.
- `src/lib/orbit/announce.ts` — read only its call site in `reconcile.ts`. It composes the scheduled announcement string and touches no count.
- Test files throughout. I read production code and used the suite as a pass/fail signal rather than auditing the tests themselves.
