# Founder fixes group details

## Parked

**Parked 2 Sept 2026. Design is complete; execution never started.** No code was
written, no plan document exists, the branch `fix-group-details-after-creation`
carries this document alone, and there is no pull request.

Why it was parked, so nobody reads this as abandoned or half-finished: the slice
was racing the tennis group's arrival, and that group turned out to have one
fixed rhythm, Saturday morning, which either happens or is cancelled for
weather. Changing a group's day is a nice-to-have for them. The day-one risk
this slice also covered, a founder correcting what Orbit misread at creation, is
being handled without code instead: Jacob will be present when the founder
creates the group and they will verify the playback screen together before any
invite goes out. **Cancelling one occurrence of a recurring event took this
slice's place in the queue.**

What resuming costs: the five product decisions below were settled with Jacob on
2 Sept 2026 and do not need relitigating. Everything marked OPEN was decided by
the build agent, not by Jacob, and should be put to him before building.

Test-suite baseline recorded at slice start, by running the suite: **1581 passed
of 1581, across 140 files, zero pre-existing failures.** Cut from `main` at
`eed7772`.

---

## Front section

**Settled with Jacob, 2 Sept 2026, do not relitigate.**

1. **Screens only, both moments.** The founder fixes details by tapping, on the
   onboarding playback screen and on a screen after the group exists. Orbit does
   not learn to act on day or venue change requests in chat; that is its own
   later slice. This cut was chosen over a before/after split because both sides
   rewrite the same stored shape, so splitting there builds the same editor
   twice, whereas the chat half shares almost nothing and carries all the model
   cost and risk.
2. **Founder only.** Framed as a correction tool, not a decision tool: the
   founder is correcting the description they themselves wrote. Genuinely
   deciding to change nights stays a group matter, through Orbit and a vote.
3. **The plan already on the screen: ask him, one tap.** Changing the standing
   schedule does not silently move the plan already scheduled. On save, if there
   is an upcoming scheduled plan, he is asked whether to bring it in line too.
   Software cannot distinguish "Orbit misread us" from "we are switching nights",
   and he obviously can.
4. **Orbit announces a standing-schedule change once anyone else has joined.**
   A founder still alone in their group gets silence, so fixing a typo during
   setup costs nobody a message. No undo control: the edit screen is the revert.
5. **Five editable details: day, time, meeting spot, activity, group name.**
   Deliberately excluded: **cadence** (only weekly ever schedules, so a monthly
   setting silently switches the group off) and **timezone** (re-interprets every
   plan that already exists; its own slice).

**Non-goals, each with where it belongs instead.**

- Orbit acting on day or venue change requests in chat. Its own slice; it needs
  intent-prompt work and both eval benches.
- Cancelling one occurrence of a recurring event. The slice that replaced this
  one in the queue. Do not absorb it.
- Editing the timezone. Its own slice, because it re-times existing events.
- Editing cadence, or adding and removing whole activities. Restructuring a
  group, not correcting it.
- Any member editing. Contradicts decision 2.
- Verbal RSVP. Unrelated, separately queued.

**How this slice is verified, written before any code.**

Behaviours that get automated tests: the validator refuses a save that would
leave the group unschedulable and accepts a valid one; the founder gate refuses
a non-founder server-side; the announcement composes correctly and is silent in
a solo group; the bring-in-line branch in each of its four states (moved, left
alone, no upcoming plan, plan already started); RSVPs are wiped by a day or time
move and untouched by a spot-only change; the new decline copy.

Behaviours deliberately not tested, with the reason: the native time input's
platform picker is the browser's, not ours; the visual result of the day chips
beyond a component test that they toggle and report the right days; the real
phone's rendering, which gets a hand pass instead.

**No eval bench run is required and that is a deliberate finding, not an
oversight.** The brief anticipated bench cost. This slice changes no prompt, no
`spark.ts` classification, and nothing in `normalize.ts`. The only model-adjacent
change is the wording of a deterministic decline string. `evals/detect/cases.ts:232`
asserts that decline via `replyContains: "spot"`, and the replacement copy keeps
the word "spot", so even that assertion holds. Run neither `eval:detect` nor
`eval:onboarding`. If the resumed slice does end up touching a prompt, this
paragraph is void and both benches need baselines before and numbers after.

**Debt this slice is expected to open.** Listed in full in "Debt" below; the
short form is that Orbit's decline will point a non-founder member at a door
only the founder can open, the timezone and cadence stay unfixable anywhere,
only the first stored rhythm ever schedules, and there is no history of who
changed what.

---

## What the code actually looks like today

Established by reading, 2 Sept 2026. Anything here is a fact about the codebase
at `eed7772` and should be re-checked on resume.

- **Rhythms are not a table.** They live in `Group.recurringActivities`, a
  `Json?` column (`prisma/schema.prisma:64`). The typed views are `StoredRhythm`
  and `GroupRhythm` in `src/lib/orbit/rhythm.ts:16-35`. The only write of that
  column in the whole codebase is `src/lib/groups/provision.ts:57-71`. Editing a
  rhythm is therefore one column write, with no migration.
- **Only `recurringActivities[0]` is ever scheduled.** `parseRhythm`
  (`rhythm.ts:82`) reads element zero and nothing else. Later entries are
  displayed on the info page and never produce a plan. Pre-existing debt,
  `docs/build-notes.md:901`.
- **There is at most one upcoming scheduled event per group at a time.**
  `reconcile.ts` skips a group whose `hasUpcomingScheduledEvent` guard fires
  (`src/lib/events/upcoming-list.ts:38-42`). So a rhythm change is invisible for
  up to a full cycle unless the existing plan is brought in line. This is the
  fact behind decision 3.
- **Nothing ever rewrites an existing Event from a rhythm.** `reconcile.ts:126-129`
  says so in a comment. The only Event mutation anywhere is
  `moveEventCoreInTx` (`src/lib/events/move.ts:73-139`), driven by change
  proposals.
- **A venue is a per-event row** (`schema.prisma:148-161`, `eventId` required).
  The rhythm's `venueName` is only a string that gets snapshotted into a Venue
  row at event creation (`reconcile.ts:116-130`). So fixing the standing spot
  does not fix the spot on the plan already scheduled.
- **An event's title is the title-cased activity** and is likewise a snapshot.
  Fixing the activity does not retitle the plan already scheduled.
- **Orbit's ladder declines every non-time field at rung one**
  (`src/lib/orbit/change-plan.ts:50-55`) via `buildCantDoReply`
  (`src/lib/orbit/change-copy.ts:139-153`), whose DEBT comment at `:131-137` is
  the definition-of-done item the brief flagged.
- **The playback step edits exactly two things today**
  (`src/app/create/Step2Playback.tsx`): the group name input at `:175-197`, and
  a per-rhythm venue input at `:213-270`. Days, time and activity are read-only
  text from `formatRhythmRow` (`src/lib/orbit/playback.ts:41-60`). The only
  escape is "Edit my description" back to step 1.
- **The info page renders every stored rhythm read-only**
  (`src/app/groups/[id]/info/page.tsx:86-93`, rendered at `:328-332`) and ends
  with the line `Want to change something? Just tell Orbit in the chat.` at
  `:344`. That line becomes wrong the day this ships.
- **The founder's existing powers are a good precedent to copy**: `ResetInviteLink`
  and `ManageMembers`, whose server actions both re-check `founderId` inside the
  lib function rather than trusting the action
  (`src/lib/groups/reset-invite.ts:32`, `src/lib/groups/remove-member.ts:32`).
- **`moveEventCoreInTx` writes its own announcement message** and takes
  `seedInUserIds`. Both matter for task 6.

---

## Decisions the build agent made, all OPEN, all Jacob's to confirm on resume

**O-1. The post-creation screen is its own route, `/groups/[id]/edit`, reached
from the group info page.** The info page already carries the group's schedule
and both of the founder's existing self-service actions, so it is where a
founder already goes to look at these details. A separate route rather than
inline editing, because the info page is a server component and the editor is
stateful. The founder-only entry point replaces the "Just tell Orbit in the
chat" line for the founder; a non-founder still sees that line.

**O-2. Every stored rhythm is editable, not just the first.** Safe only because
cadence is not editable: a loose or monthly rhythm cannot be edited into looking
schedulable, since `formatRhythmRow` keys its "every week" phrasing off cadence.
Editing a later rhythm's day or time therefore changes what the info page
displays and nothing else, which is honest. The bring-in-line question in
decision 3 applies to rhythm zero only, since only rhythm zero ever produced a
plan.

**O-3. Bringing the plan in line covers all three kinds of staleness in one
tap, not three.** Day and time, the meeting spot, and the title all went into
the scheduled event as snapshots. One confirmation names everything that would
change on that plan. Splitting them into separate questions would be three taps
for one intention.

**O-4. A spot-only or title-only change does not reset anyone's RSVP; a day or
time change does.** A yes for 7pm is not a yes for 8pm, which is the settled
reasoning behind the existing time-change reset. A yes for the courts is still a
yes when the court number is corrected. So a spot or title fix updates the Venue
row and the title directly, outside `moveEventCoreInTx`.

**O-5. The founder is seeded into nothing.** `moveEventCoreInTx` takes
`seedInUserIds: []`. Correcting a detail is not saying you are coming, which
matches the settled rule that a "keep" voter gets no RSVP row because choosing
between two times is not an attendance answer.

**O-6. One announcement, never two.** `moveEventCoreInTx` writes its own
message, so a naive implementation posts a schedule announcement plus a move
announcement for one action. The combined body is passed into
`moveEventCoreInTx` and no second message is written. When the plan is left
alone, the announcement covers the standing schedule only.

**O-7. A group name change does not announce.** The name sits at the top of
every member's screen already. Jacob's decision 4 covered night, time and spot;
the name was not in its scope, so this is the agent's reading and should be
confirmed.

**O-8. The plan is not offered for bringing in line if it has already started.**
Reuses the product's existing "no plans about the past" principle
(`PAST_TIME_REPLY`, and promote's `start_passed` skip).

**O-9. Time is entered through a native `<input type="time">`.** It produces
`"HH:mm"` directly, which is exactly the `timeLocal` shape, and it removes the
am/pm ambiguity that the onboarding gap-ask exists to resolve. The accepted
cost, named because it will be visible: native time inputs barely accept
styling, so this control will look less designed than everything around it. If
that is unacceptable, the fallback is an hour/minute plus am/pm control, which
is more build and reintroduces the ambiguity by hand.

**O-10. Days are seven toggle chips**, Sun through Sat, three-letter
abbreviations per the copy rules, 44px tap targets. At least one must stay on.

**O-11. `buildCantDoReply`'s DEBT comment is rewritten, not deleted.** Orbit
still cannot act on day or venue asks, so the debt is not retired; what changes
is that the copy now names where the change can be made. The comment must say
that the founder-edit slice landed, that these lines now point at a screen, and
that the slice which teaches Orbit day or venue changes still owes the real
retirement.

---

## Copy

All strings are deterministic. No model writes any of them. No em dashes, plain
warm register, three-letter weekday abbreviations.

**Orbit's declines in chat**, replacing `change-copy.ts:146-152`:

- day, with a target event: `I can't move it to another day yet. If your group meets on a different day now, the founder can change that on the group info page. I can change the time on Sat if that helps.`
- day, no target event: `I can't move it to another day yet. If your group meets on a different day now, the founder can change that on the group info page.`
- venue: `I can't change the spot yet. The founder can update where you meet on the group info page.`
- other: unchanged, `I can't change that part of the plan yet. Moving the time is what I can do.`

The venue line keeps the word "spot", which is what holds `evals/detect/cases.ts:232`.

**Orbit's announcement in the feed**, new. Composed from the stored fields, one
message:

- schedule changed, plan left alone: `We're on Wed at 7pm now. This week's plan on Tue stays put.`
- schedule changed, plan brought in line: `We're on Wed at 7pm now, and I've moved this week's plan to Wed 9 Sep.`
- spot changed only: `We're meeting at Court 5 now.`
- spot changed, plan brought in line: `We're meeting at Court 5 now, and this week's plan says so too.`
- activity changed only: `We're calling it Tennis now.`

The composer joins clauses when more than one thing changed, in the fixed order
schedule, spot, activity, and appends the plan clause once at the end rather than
per change. Two changes read `We're on Wed at 7pm now, and we're meeting at
Court 5.` A save that changed only the group name produces nothing (O-7).

**On the edit screen:**

- the bring-in-line question, when the day or time changed: `Your next plan is Tue 2 Sep. Move that one too, or leave it?` with controls `Move it too` and `Leave it`, matching the existing soft-decline chip voice.
- the same question when only the spot or the activity changed, since "move" would be the wrong word for a plan that is not moving: `Your next plan is Tue 2 Sep. Update that one too, or leave it?` with controls `Update it too` and `Leave it`.
- validation refusal, unschedulable: `I need at least one day and a time to keep your schedule going.`

**On the info page**, replacing `:344` for the founder only: a founder-visible
control reading `Change group details`. A non-founder keeps the existing
`Want to change something? Just tell Orbit in the chat.`

---

## Tasks

Written for the agents that will execute them. Each task is TDD: the failing
test first, shown failing, then the code. No task is thinned.

### Task 1: the validator and the diff, pure functions

New `src/lib/groups/edit-details.ts`.

- `validateDetailsEdit(input: { name: string; rhythms: unknown }): { ok: true; name: string; rhythms: StoredRhythm[] } | { ok: false; error: string }`.
  Reuses `parseStoredRhythms` for shape and `parseRhythm` for the schedulability
  of position zero. Refuses with the validation copy above when position zero
  would stop being schedulable. Trims the name and refuses an empty one. Venue
  passes through `cleanVenueName`, never blocks, and may be null, because venue
  never gates anything.
- `diffDetails(before: StoredRhythm[], after: StoredRhythm[], beforeName, afterName)` returning a typed summary of what changed: `scheduleChanged` (days or time on rhythm zero), `spotChanged`, `activityChanged`, `nameChanged`. The announcement composer and the bring-in-line branch both key off this rather than re-deriving.

Tests: an unschedulable edit is refused; zero days is refused; a bad time string
is refused; a null venue is accepted; a monthly rhythm edited on day and time
stays monthly; the diff reports each field independently and reports nothing
when nothing changed.

### Task 2: the shared editor component

New `src/components/RhythmEditor.tsx` (client), used by both surfaces so the
editor exists once. Props: the `StoredRhythm[]`, the group name, change
handlers, a disabled flag. Renders per rhythm: activity text field, seven day
chips, native time input, venue text field. Renders the group name field above.
Cadence is not rendered as a control anywhere.

Mobile-first: 44px tap targets on the chips, fields stack, layout grows with
content and never clips at enlarged device text. Colors from the design tokens;
teal only on the save action, never on the chips, per the settled rule that teal
never leans an open question.

Tests: chips toggle and report the right day numbers; the last remaining day
cannot be turned off; the time input round-trips `"HH:mm"`; the venue field caps
at `VENUE_NAME_MAX`. Add both new components to `token-contrast.test.ts` after
confirming which surface each renders on, and declare that as a Jacob-built
guard change in the PR.

### Task 3: wire the editor into the onboarding playback step

`src/app/create/Step2Playback.tsx` and `OnboardingWizard.tsx`. The name input
and the existing venue input are replaced by the shared editor; the wizard's
existing `rhythms` state and `createGroupAction` payload are unchanged, because
the editor produces the same `StoredRhythm[]`. No server change: the existing
completeness gate at `create-group.ts:51-54` already re-validates.

Keep the "Times in {zone}" reference line, the "Edit my description" escape, and
the teal confirm band. Client `canConfirm` additionally requires the validator
to pass, so Continue cannot be tapped into a refusal.

Tests: the wizard's confirm payload carries edited days and time; Continue is
disabled when the edit would be unschedulable.

### Task 4: the announcement composer

New composer beside the other deterministic copy, all four shapes above.
Silent (returns null) when the group has only the founder in it, which is
decision 4's rule and belongs in the composer rather than at the call site so
one place decides.

Tests: each shape; the solo-group silence; no em dashes; three-letter weekday
abbreviations; group timezone used for every rendered time, never viewer-local.

### Task 5: the save path, without touching any event

New `src/lib/groups/update-details.ts` plus
`src/app/actions/update-group-details.ts`.

The lib function re-checks `group.founderId !== caller.id` and throws
`NOT_FOUNDER`, copying `reset-invite.ts:32` exactly rather than trusting the
action's own check. Membership is checked through `src/lib/auth/membership.ts`.
One transaction: write `recurringActivities` and `name`, then write the
announcement message when the composer returns one. `revalidatePath` for the
group home, the info page and the edit route.

Tests: a non-founder is refused; a member of another group is refused; the
column is written with the validated shape and never the raw client payload; the
announcement lands as an ORBIT message with a null author, which is the rule
that Orbit is never a User row; a solo group gets no message.

### Task 6: bringing the already-scheduled plan in line

The branch decision 3 buys. Reads the group's upcoming scheduled plan the same
way `reconcile` does (`gaugeId: null`, `startsAt >= now`).

**This task rewrites task 5's message write rather than adding to it.** Task 5
writes the announcement itself because it has no event path. Task 6 moves that
write behind a single decision: when the plan is moved, the body is handed to
`moveEventCoreInTx`, which writes it; otherwise task 5's own write stands. After
this task, exactly one place in the transaction writes an ORBIT message, and a
test pins that count at one in every branch.

- No upcoming plan, or it has already started: no question is asked and the save
  proceeds (O-8).
- The founder chooses "Leave it": nothing touches the event; the announcement
  takes its plan-left-alone shape.
- The founder chooses "Move it too", day or time changed: `moveEventCoreInTx`
  inside the same transaction, `seedInUserIds: []` (O-5), the combined
  announcement body passed in so only one message is written (O-6), and
  `expectedStartsAt` read inside the transaction so the existing stale guard
  still protects against a concurrent consensus move landing at the same moment.
- Spot or activity changed: the Venue row and the event title are updated
  directly, outside `moveEventCoreInTx`, and RSVPs are untouched (O-4).
- `scheduledKey` is deliberately not touched, which is already true of every
  consensus move (`move.ts:19-21`).

Tests: each of the four states; RSVPs wiped on a day or time move and present
after a spot-only change; exactly one ORBIT message per save in every branch; a
concurrent move that lands first makes this one report stale rather than
overwrite it.

### Task 7: the edit screen and its entry point

New route `src/app/groups/[id]/edit/page.tsx`, founder-gated server-side, a
non-founder getting the same treatment a non-member gets rather than a hint that
the screen exists. Renders the shared editor seeded from the stored rhythms, the
bring-in-line question when there is a live plan, a teal save, and a way back to
the info page using the fixed-parent-link rule, never browser history.

`src/app/groups/[id]/info/page.tsx:344`: the founder sees the entry control; a
non-founder keeps the existing Orbit line.

Tests: a non-founder is turned away; the editor is seeded from stored rhythms;
the entry control renders for the founder and not for a member.

### Task 8: Orbit's declines stop being wrong

`src/lib/orbit/change-copy.ts:139-153`, the four strings above, and the DEBT
comment rewritten per O-11. Update `change-copy.test.ts` and
`change-plan.test.ts`, whose existing cases at `change-copy.test.ts:139` and
`:230` and `change-plan.test.ts:57, 63, 167` assert this copy. Confirm
`evals/detect/cases.ts:232` still passes on the word "spot" by reading it; do
not run the bench.

### Task 9: verification and the record

- Full suite green from an empty database, with the before and after counts
  against the 1581 baseline.
- Browser pass at 375x812 on both surfaces, with a screenshot.
- Real-phone pass on the LAN address, because this is a mobile-first project,
  these are new layouts, and the editor changes vertical space. Fold what it
  surfaces into the QA checklist. Stop the dev server afterwards.
- `docs/build-notes.md` §11 entry, 400 to 600 words, product language.
- The CLAUDE.md current-state section: what is now true, the debt below, and the
  strike-through of the "Still missing, and known" paragraph this slice closes.
- No migration, so no pre-deploy checklist obligation. Confirm that by reading
  the diff rather than by assuming.
- PR body near 300 words, opened and left unmerged, with the QA script in the
  chat message per `~/.claude/checklists/pr-handoff.md`.

---

## Debt this slice opens, to be recorded when it lands

1. **Orbit's decline points a non-founder at a door they cannot open.** A member
   asking to change the spot is told the founder can do it on the group info
   page, which is true and unhelpful to them. Accepted: the honest alternative
   is naming the founder, and the product does not put one member's name into
   another's decline.
2. **The timezone is still unfixable anywhere.** A group created while the
   founder was travelling has every time wrong, with no route to correct it.
   Deliberately excluded here; its own slice, because it re-times existing plans.
3. **Cadence is still unfixable**, and a monthly rhythm still displays a day and
   a time and never schedules anything. Pre-existing (`build-notes.md:901`),
   unchanged, re-recorded because the edit screen puts a founder closer to it.
4. **Only the first stored rhythm ever schedules.** Editing a later one changes
   the info page and nothing else. Pre-existing, unchanged, and now reachable by
   tapping, which is why it needs restating.
5. **No history of edits.** If a founder changes the group's night and the group
   later disagrees about it, the single chat announcement is the only record, and
   nothing anywhere says who changed what or when.
6. **`buildCantDoReply`'s DEBT is rewritten, not retired.** The slice that
   teaches Orbit to act on day and venue asks still owes the real retirement.
