# Lane 1, second pass: can the product be wrong about who is in?

*Round one's findings (F-1-1 … F-1-8) are in `lane-1-counting-and-state.md` and are
deliberately not repeated here. This file carries only what a second, differently-angled
read found. Coverage and honest gaps at the end.*

## Findings

### F-1-9: A group that told Orbit about two standing plans only ever gets one of them on the calendar, forever

- **file:line** — src/lib/orbit/rhythm.ts:82-85 (`parseRhythm` reads `json[0]` only), with
  src/lib/events/upcoming-list.ts:38-42 (`hasUpcomingScheduledEvent`) and
  src/lib/orbit/reconcile.ts:66-80.
- **consequence** — A founder who writes "we climb Mondays at 6 and get beers Fridays at 8"
  gets both rhythms extracted, both shown back to them on the playback card they approve,
  both listed on the group info page, and both shown on the invite screen to everyone they
  invite. Orbit will never once put the Friday beers on the calendar. Not late, not
  occasionally: never, for the life of the group, with no error and nothing anywhere saying
  so. The product states a schedule it does not keep, on the one screen a new member reads
  to decide whether to join. There is also no fix path (a founder cannot edit group details
  after creation, registered item 6), so the only escape is to create a new group.
- **evidence** — Three pieces have to line up, and they do:
  1. Extraction is explicitly multi-rhythm and puts no constraint on a secondary being
     complete: the system prompt says `- Each distinct recurring activity is one rhythm.`
     and the only "stay loose" instruction is scoped to the clarifying question
     (`Only the primary rhythm's gaps matter: never ask about any other rhythm, they are
     allowed to stay loose.`, src/lib/orbit/extract.ts FIELD_RULES). Nothing tells the model
     to leave a secondary's day or time out, and `normalize.ts:277` (`const completeIdx =
     rhythms.findIndex(isSchedulable)`) proves the codebase already expects more than one
     schedulable rhythm to be possible.
  2. Everything is stored. `createGroupAction` validates with `parseStoredRhythms(input.rhythms)`
     and writes the whole array (`recurringActivities: rhythms`, create-group.ts:84).
     The info page reads the whole array back: `const rhythms = parseStoredRhythms(group.recurringActivities) ?? []`
     then `rhythmRows.map(...)` (src/app/groups/[id]/info/page.tsx:65-66, 274).
  3. Only element zero can ever schedule. `parseRhythm` is the scheduler's only contract and
     its own docstring says so: `This slice only uses the first element of the array` /
     `const raw = json[0]`. `reconcileScheduledEvents` calls `parseRhythm(recurringActivities)`
     once per group and computes one occurrence from it. And even if it did loop, the guard
     above it would stop a second write: `hasUpcomingScheduledEvent` returns true when *any*
     future non-sparked event exists (`where: { groupId, startsAt: { gte: now }, gaugeId: null }`),
     so the group can hold at most one scheduled event at a time regardless of how many
     rhythms it has.
- **severity** — queue
- **confidence** — certain about the code path (three files read end to end, the docstring
  states the limitation outright). Unsure how often extraction actually returns two complete
  rhythms, because I could not run the onboarding bench; the prompt permits it and nothing
  discourages it.

### F-1-10: Orbit is shown the three soonest plans while the group sees five, so a request about a later plan can move the wrong one

- **file:line** — src/app/actions/detect-intent.ts:90 (`findUpcomingEvents(group.id, now, 3)`)
  against src/lib/cards/region.ts:8 (`CARD_REGION_CAP = 5`) and
  src/app/groups/[id]/page.tsx:79.
- **consequence** — The card region shows a member up to five upcoming plans. When that
  member asks to move one of the later ones, Orbit is only ever told about the first three.
  The best case is Orbit asking "which plan?" and listing three, leaving out the one the
  member was looking at, which reads as Orbit not being able to see the group's own
  calendar. The worse case is Orbit matching the request to one of the three it can see and
  opening a group vote to move a plan nobody asked about, complete with chips, a real vote,
  and a real move if three people say yes. Every RSVP on that plan then resets.
- **evidence** — The two numbers are set independently and never reconciled. The group home
  fetches `CARD_REGION_CAP` events (`findUpcomingEvents(group.id, new Date(), CARD_REGION_CAP)`,
  page.tsx:79) and mingles them with ideas up to five. Detection fetches three:
  ```
  const events = await findUpcomingEvents(group.id, now, 3)
  const upcomingLines = events.map((e, i) => `${i + 1}. ${e.title}, ...`)
  ```
  with the comment `The model sees every plan the group sees (the carousel's three)`, which
  was true when the carousel showed three and is no longer true. `normalizeIntent` bounds
  the model's answer to that same short list (`n >= 1 && n <= upcomingCount ? n - 1 : null`,
  spark.ts:350-351) and `planChange` resolves against `candidates`, which is built from the
  same three (detect-intent.ts:295-299). So a plan in slots 4 or 5 is not merely unresolvable,
  it is invisible: the model is choosing among three plans while the member is looking at five.
  The `move` / `propose` branches then act on `resolvedTarget` from that same list.
- **severity** — queue
- **confidence** — certain that Orbit sees three while the screen shows five, and certain
  that a mis-numbered index is acted on without a second check. Unsure how the model behaves
  when the plan a member describes is not in its list (it may return null and get the
  which-plan question rather than guessing); I could not run the detection bench to measure it.

### F-1-11: A member's answer to Orbit's "what day works?" can open a gauge for the wrong activity, with that member counted in

- **file:line** — src/lib/gauges/open-ask.ts:42-63 (only the newest open ask is ever
  returned) with src/lib/orbit/spark.ts:207-211 (`NormalizedAnswer` carries no activity) and
  src/app/actions/detect-intent.ts:185-195.
- **consequence** — If two ideas have both stalled on their day, Orbit asks the group two
  separate questions in chat ("Beers didn't happen for Monday... what day works better?" and
  the same for climbing). Both questions are sitting in the feed. A member answering the
  older one gets a brand-new plan opened for the *other* activity, on the day they named,
  with them recorded as saying yes to it. They said "Saturday works" about beers and the
  group now has a Saturday climbing card with their name counted in it. Two people more and
  it becomes a real event with them RSVP'd IN. The older question, meanwhile, can no longer
  be answered by anyone for as long as the newer one is open.
- **evidence** — `findOpenRetryAsk` loads every gauge with an unanswered ask, ordered
  `retryAskMessage: { createdAt: "desc" }`, and returns the **first** one whose activity has
  no newer gauge:
  ```
  for (const gauge of candidates) { ... if (!answered) { return { gaugeId, activity, ... } } }
  ```
  Its `answered` probe is activity-scoped (`activity: { equals: gauge.activity, mode: "insensitive" }`),
  so two asks for two different activities are both genuinely open and the function silently
  keeps only the newest. The answer reading carries nothing that could correct this:
  `NormalizedAnswer` is `{ dayOfWeek, time, timeAmbiguous }` with no activity field, and
  `normalizeIntent`'s answer arm reads only `answerDayOfWeek` / `answerTime`. The action then
  builds the gauge entirely from the ask it happens to hold:
  ```
  activity: openAsk.activity,
  proposedDate: planned.proposedDate,
  initiatorUserId: planned.seedNamer ? user.id : null,
  ```
  and `seedNamer` is true whenever the member named a day (`spark-copy.ts` `planAnswerGauge`),
  so the seeded IN vote is written for an activity the member never mentioned. The
  guards immediately above it (`liveGauges.some(...)`, `alreadyOnCalendar`) both key off
  `openAsk.activity` too, so they cannot catch the mismatch either.
- **severity** — queue
- **confidence** — likely. The code path is certain: I read every step and the activity is
  never carried on the answer. What I could not check is whether the model actually returns
  `isAskAnswer: true` when the member's words name the activity of the *other*, unmentioned
  ask; the prompt is only given the newest ask's line, but the full 20-message conversation
  window contains both of Orbit's questions. Running the detection bench would settle it and
  is out of scope here.

### F-1-12: One known clock hazard is defended against in the display layer and left open in the three places that decide time

- **file:line** — src/lib/events/format.ts:79 (the guard) against
  src/lib/orbit/occurrence.ts:103-108, src/lib/orbit/endgame.ts:232 and 400, and
  src/lib/orbit/change-copy.ts:55 (no guard).
- **consequence** — If the product is ever deployed on a platform whose date library reports
  midnight as "hour 24" rather than "hour 0", every group-local date the product stores
  lands a day early, Orbit's evening nudges fire at the wrong hour, and a midnight plan is
  read as an evening one when working out whether "move it to 8" means morning or evening.
  The team already knew this hazard exists (it is written into the code) and guarded the one
  place where the cost is a mislabelled time on screen, while leaving it open in the places
  where the cost is a plan on the wrong day. I could not make it happen on this machine, so
  this is about the product having one guard where it needs four, not about a fault visible today.
- **evidence** — `formatTime` carries the guard and the reason:
  ```
  const h = hour % 24 // some ICU builds report midnight as 24; normalize to 0
  ```
  Every other reader of the same helper takes the raw value. The one that matters most is
  the conversion that stores group-local midnight, which feeds it straight into date
  arithmetic:
  ```
  const localMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  return (localMs - targetMs) / 60_000
  ```
  (occurrence.ts:103-108). A reading of 24 there makes the computed offset a full day out, and
  `zonedWallTimeToUtc(y, m, d, 0, 0, tz)` is exactly what writes every gauge's `proposedDate`
  (`chooseProposedDate`, `chooseRetryGuessDate`, `chooseSuggestedRetryDate`, `startOfLocalDay`).
  The endgame's two hour gates take it raw as well (`nowParts.hour >= BUMP_LOCAL_HOUR`,
  endgame.ts:232; `nowParts.hour < BUMP_LOCAL_HOUR`, endgame.ts:400), as does the am/pm
  inheritance rule (`const morning = getLocalParts(eventStartsAt, timeZone).hour < 12`,
  change-copy.ts:55). I checked this Node build directly and it reports `"00"`, so nothing is
  wrong on this machine today:
  `node -e "...formatToParts(midnight in America/New_York)"` → `{"type":"hour","value":"00"}`
  on Node v24.15.0.
- **severity** — queue
- **confidence** — unsure. The inconsistency is certain and anchored; whether any platform
  the product will actually run on still reports 24 is what I could not check. If the answer
  is "no current Node build does", this is a `decline` and the honest recommendation is to
  delete the guard in `format.ts` rather than add three more.

### F-1-13: A group in New Zealand (or anywhere at UTC+12 or further east) never gets today's meeting scheduled, so its very first plan can land a week late

- **file:line** — src/lib/orbit/occurrence.ts:135-148 (the UTC-noon anchor)
- **consequence** — Orbit works out a group's next meeting by walking forward through the
  calendar one day at a time. For any group whose timezone is twelve or more hours ahead of
  UTC (New Zealand, Fiji, Kamchatka, Kiribati) that walk starts on the wrong day: it begins
  tomorrow instead of today. Today's meeting is therefore invisible to it. The visible cost
  lands hardest at the worst moment: a founder in Auckland who sets their group up on a
  Saturday morning, for a group that climbs Saturdays at 10am, is shown "Next up" pointing at
  a Saturday eight days away, and the meeting happening in two hours never appears on the
  calendar at all. Nobody can RSVP to it, Orbit never announces it, and there is no way to
  add it by hand. Every zone from UTC+11 westward is unaffected.
- **evidence** — The scan builds each candidate day by anchoring at UTC noon and reading its
  local parts back:
  ```
  const candidateUtcNoon = new Date(Date.UTC(localAfter.year, localAfter.month - 1, localAfter.day + offsetDays, 12, 0))
  const localCandidate = getLocalParts(candidateUtcNoon, timeZone)
  ```
  with the comment `We use a UTC-noon anchor so that small timezone shifts don't bleed into
  the wrong calendar date`. Noon UTC is only midday-ish for offsets between -12 and +11; at
  +12 and beyond it has already rolled over into the next local day. Measured directly:
  ```
  Pacific/Auckland   {"y":2026,"m":8,"d":24,"h":0}
  Pacific/Fiji       {"y":2026,"m":8,"d":24,"h":0}
  Asia/Kamchatka     {"y":2026,"m":8,"d":24,"h":0}
  Pacific/Kiritimati {"y":2026,"m":8,"d":24,"h":2}
  Asia/Tokyo         {"y":2026,"m":8,"d":23,"h":21}
  America/New_York   {"y":2026,"m":8,"d":23,"h":8}
  ```
  (anchor instant: 23 Aug 2026 12:00 UTC). So `offsetDays = 0` resolves to tomorrow, and the
  fourteen-day scan covers base+1 through base+14, never base. I ran the real function
  through `npx tsx` against a Saturday-10am weekly rhythm, with `now` set to Saturday 8am
  local in each zone:
  ```
  Pacific/Auckland     now = Sat 22 Aug 8am local -> Sat, Aug 29, 10 AM
  America/New_York     now = Sat 22 Aug 8am local -> Sat, Aug 22, 10 AM
  Asia/Tokyo           now = Sat 22 Aug 8am local -> Sat, Aug 22, 10 AM
  UTC                  now = Sat 22 Aug 8am local -> Sat, Aug 22, 10 AM
  ```
  The scan still spans fourteen days, so it never throws and never returns a past instant;
  the only occurrence it can miss is one later on the same local day. The two places that
  reach it are group creation (`createGroupAction` calls `reconcileScheduledEvents` scoped to
  the new group) and any hourly sweep that finds the group with no upcoming scheduled event
  while today's occurrence is still ahead.
- **severity** — queue
- **confidence** — certain. Reproduced by running the shipped function, not by reading it.
  What I did not check is whether the owner considers those zones in scope at launch; if they
  are not, this is a `decline` with a one-line comment on the anchor.

## Appendix (real, but no product consequence I can name)

**A-4: A day-blocked gauge that is skipped because another idea for the same activity is
live never gets any ending at all.** `handleRevive` returns `same_activity_live` without
writing a closure marker (endgame.ts, the `sameActivity.some(isGaugeLive)` branch), so the
gauge simply ages out of the two-day candidate window in silence. That is arguably the right
outcome (a live card for the same activity is already on screen), and the alternative
would be a goodbye message next to a live idea for the same thing, which is worse. Recording
it only because it is the one gauge ending that leaves no trace in either the row or the feed.

**A-5: The bump has the same four-tick firing window round one recorded for the guess.**
`handleBump` fires only when `dayDiff === 1 && nowParts.hour >= BUMP_LOCAL_HOUR` (endgame.ts:232),
and at `dayDiff === 0` it reports `not_the_eve` and never bumps. That is the 20:00, 21:00,
22:00 and 23:00 hourly runs, the same shape as F-1-5 but a different function and a different
consequence (the last call is what is lost, not the retry guess). Listed separately from
F-1-5 rather than merged because they are different code paths, and in the appendix rather
than the findings because a missed last call costs the group one nudge, where a missed guess
costs the idea its final chance.

**A-6: The RSVP action trusts a client-supplied `groupId` for cache revalidation only.**
`rsvpAction` reads `formData.get("groupId")` after the write and passes it to
`revalidatePath` (rsvp.ts:73-76). It is never used to authorize or locate anything: the
membership check inside `setRsvp` resolves the group from the event itself. A wrong value
refreshes a page the caller could have refreshed anyway. Noting it because "client-passed id"
appears in this file's own guard comments as something the codebase refuses to do.

**A-7: `Event.previousStartsAt` is written on every move and read by nothing, and its schema
comment states a premise the product has since disproved.** `move.ts:101` writes it
(`data: { startsAt: newStartsAt, previousStartsAt: event.startsAt }`) and a grep across
`src/` finds no reader: the `previousStartsAt` parameter in `change-copy.ts:106` is the
announcement's "was 7pm", and every caller passes the proposal's `priorStartsAt` or the
resolved target's own `startsAt`, never the column. The schema comment justifies the field as
`The data home for "put it back": the model never sees feed history, so a textual revert is
unresolvable without it` (schema.prisma:84-88), but the model does see feed history now: the
twenty-message conversation window includes Orbit's own announcements, which is how "put it
back" actually resolves today. No user-visible consequence, and the field costs nothing where
it sits. Recording it because the comment reads as load-bearing and would send a future
reader down a path the product no longer needs.

## What I could not check

- I could not run either eval bench (out of scope by the brief), which is what F-1-10 and
  F-1-11 both hang on: in each case the code path is certain and the model's behaviour inside
  it is not. Both would be settled by a handful of bench cases, and neither is settled here.
- I did not exercise concurrency. Where round one's findings already cover a race I read the
  guard and moved on rather than re-deriving it.
- I did not re-run `npm test`. Round one recorded 92 files / 935 tests passing at 89s on this
  same commit and nothing in this pass changed a file, so re-running it against the shared
  dev-test database while other lanes are reading would add risk and no information.
  `npx tsc --noEmit` I did re-run: clean, exit 0.
- I could not verify F-1-12 empirically beyond this machine's Node build, which is the whole
  reason its confidence is `unsure`.
- Two things the ledger assigns to this lane do not exist as files and were confirmed absent
  rather than skipped: `src/lib/events/same-instant.ts` (a test file only; the tie-break lives
  in `upcoming-list.ts:61` and `cards/region.ts:49-53`) and `src/lib/orbit/promote-adjacent.ts`.

## Coverage

Read in full this pass (independently of round one, not taking its reading on trust):

- prisma/schema.prisma
- src/lib/events/rsvp.ts, roster.ts, create.ts, move.ts, upcoming.ts, upcoming-list.ts, format.ts
- src/lib/gauges/create.ts, vote.ts, threshold.ts, promote.ts, read.ts, day-comment.ts, open-ask.ts
- src/lib/proposals/consensus.ts, create.ts, read.ts, tally.ts, promote.ts, endgame.ts
- src/lib/cards/region.ts
- src/lib/pending/derive.ts
- src/lib/orbit/endgame.ts, reconcile.ts, announce.ts, change-plan.ts, day-comment-plan.ts,
  rhythm.ts, extract.ts, occurrence.ts (helpers and `computeNextOccurrence`)
- src/lib/groups/timezone.ts, join.ts, leave.ts, remove-member.ts, provision.ts
- src/app/actions/rsvp.ts, gauge-vote.ts, proposal-vote.ts, proposal-answer.ts,
  send-message.ts, detect-intent.ts, create-group.ts
- src/app/api/cron/orbit/route.ts
- src/app/groups/[id]/page.tsx
- src/app/events/[id]/page.tsx (the data half)

Read in part (the sections this pass needed):

- src/lib/orbit/spark-copy.ts — the time family (`resolveSparkTime`, `sparkStartInstant`,
  `chooseProposedDate`, `chooseRetryGuessDate`, `chooseSuggestedRetryDate`, `resolveAnswerTime`,
  `planAnswerGauge`, `gaugeClosesAt`, `isGaugeLive`) and both tally builders
- src/lib/orbit/spark.ts — `normalizeIntent`, the normalized types, `detectIntentClaim`'s
  context assembly
- src/lib/orbit/normalize.ts — the primary-promotion and position-zero section only
- src/app/groups/[id]/info/page.tsx — the rhythm rows only

Assigned but not read this pass, and why:

- Visual components (`EventCard`, `IdeaCard`, `GaugeChips`, `ProposalSection`, the carousel)
  beyond confirming which derived values they receive. They render counts, they do not
  compute them, and lanes 3 and 7 cover the rendering.
- `src/lib/events/ics.ts` — read only for how it reads the event's stored time. Round one
  covered its identity and version fields.
- Test files. This lane audits production code; lane 5 owns the tests.
