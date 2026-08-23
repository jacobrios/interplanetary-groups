# Lane 3: Does Orbit do what we have written down that it does?

Read-only audit, 22 Aug 2026. Register source: `docs/build-notes.md`
§"Where Orbit decides to speak or stay quiet" (lines 200-300).

## Findings

### F-3-1: A live gauge silently swallows a member's "Sunday works better" whenever the model spells the activity even slightly differently
- **file:line** — `src/lib/orbit/day-comment-plan.ts:53-58`
- **consequence** — A member replies "Sunday works better" while Orbit is gauging
  an idea. Orbit is supposed to always answer, record their vote, and remember the
  day. Instead, if Orbit's own reading of the activity is one letter off from what
  the group's idea is stored as ("beer" for "beers", "board game" for "board
  games"), the member gets total silence, their vote is never recorded, and the
  better day they named is forgotten, so the idea dies on the wrong day. Nobody
  anywhere is told this happened. This is exactly the class of bug the 29 July
  tune-up was about: a direct reply to Orbit met with nothing.
- **evidence** — `planDayComment` resolves which gauge the comment is about by
  exact case-insensitive string equality:
  ```ts
  const key = dayComment.activity.toLowerCase()
  target = liveGauges.find((g) => g.activity.toLowerCase() === key) ?? null
  // A named activity matching no live gauge is a situation the model
  // invented; degrade toward silence rather than guess a target.
  if (!target) return { action: "quiet" }
  ```
  The model is asked for the activity "exactly as the note names it"
  (`src/lib/orbit/spark.ts:177`), but nothing enforces it, and the note it is
  copying from (`buildLiveGaugeLine`, `src/lib/orbit/spark-copy.ts:306`) embeds
  the activity in prose. The single-gauge fallback that would have rescued it
  (`else if (liveGauges.length === 1) target = liveGauges[0]`,
  `day-comment-plan.ts:59`) is only reached when the model returned a **null**
  activity, not a slightly-wrong one. Contrast the change path, which never
  string-matches: it uses a numbered index the model was handed
  (`spark.ts:349-351`). Nothing in the bench can see this — see F-3-2.
- **severity** — queue
- **confidence** — certain (about the code path); unsure how often the model
  actually varies the wording, which is precisely what nothing measures.

### F-3-2: Four bench cases that are supposed to prove Orbit answers a day comment stop one step short of the code that decides whether it answers
- **file:line** — `evals/detect/run.ts:126-128` (and the same-day shim at `run.ts:167-169`)
- **consequence** — The recognition bench is the project's only evidence that
  Orbit behaves. For day comments it grades the wrong thing: it checks that Orbit
  *understood* the message, not that Orbit *replies*. All four "Orbit must
  recognise this" day-comment cases can score a clean 5/5 while a real member in
  the same situation gets silence (the failure in F-3-1). And the one case that
  proves Orbit stays quiet when someone names the day already proposed passes
  through a rule written in the bench itself, so deleting that rule from the
  product would not turn the bench red. A green bench here does not mean what it
  is being read to mean.
- **evidence** — The runner stops at the classifier for this kind:
  ```ts
  if (intent.kind === "dayComment") {
    return { kind: "dayComment", dayOfWeek: intent.dayComment.dayOfWeek }
  }
  ```
  `planDayComment` is never imported or called (`evals/detect/run.ts:8-22` has no
  import of `day-comment-plan`), while the change arm below it *does* call the
  real `planChange` (`run.ts:137`). The same-day discard is then reimplemented in
  the grader:
  ```ts
  const sameDayDiscard =
    o.kind === "dayComment" && o.dayOfWeek === (c.liveGauge?.proposedDayOfWeek ?? null)
  ```
  which duplicates `src/lib/orbit/day-comment-plan.ts:70-72`
  (`if (localWeekday(target.proposedDate, timeZone) === dayComment.dayOfWeek) return { action: "quiet" }`)
  — and duplicates it *differently*: production compares against the gauge it
  matched by activity, the bench against the fixture's declared day with no
  activity check at all. Affected cases: `daycomment-day-better` (cases.ts:531),
  `daycomment-cant-that-day` (:550), `daycomment-with-time` (:569),
  `daycomment-as-change` (:588), `daycomment-same-day` (:637).
  The answer arm has the same shape: `run.ts:125` grades `intent.answer.dayOfWeek`
  and never calls `planAnswerGauge`, so `retry-answer-*` cases likewise stop at
  classification.
- **severity** — queue
- **confidence** — certain

### F-3-3: Orbit's own week-later guess asks the group to vote without ever saying what a vote does
- **file:line** — `src/lib/orbit/spark-copy.ts:322-325`
- **consequence** — When an idea failed on its day and nobody answered Orbit's
  "what day works better?", Orbit posts one guess: "No takers on a new day yet,
  so how about beers next Saturday?" with the three chips under it. Nothing in
  that exchange tells the group that three yeses is what makes it happen — the
  guess message does not say it, and the tally line under it stopped saying it on
  17 Aug. Every other gauge in the product states the bar in Orbit's own message.
  A member reading chat sees a question with buttons and no stated stakes, which
  is the surface most likely to be scrolled past.
- **evidence** — `buildRetryGuessMessage` returns
  `` `No takers on a new day yet, so how about ${activity} next ${weekday}?` `` —
  no bar clause. The tally under it was deliberately stripped of its countdown on
  the stated rule that "Orbit's own message sits directly above this line in the
  feed and already says 'if three are in'"
  (`src/lib/orbit/spark-copy.ts:515-520`, `buildTallyLine`'s doc comment). That
  premise holds for `buildGaugeMessage` (":491", "If three are in, I'll set it
  up.") and for `buildSuggestedRetryMessage` (":300", "If three of you are in,
  I'll set it up.") and is false for this one function. The idea card still
  carries the countdown, so the bar is stated on the card and nowhere in chat.
- **severity** — queue
- **confidence** — certain

### F-3-4: Orbit says the same thing two different ways on two identical surfaces, and the longer one is the shape the 17 Aug pass deleted
- **file:line** — `src/lib/orbit/spark-copy.ts:300`
- **consequence** — A revived idea's gauge message reads "Beers didn't happen for
  Friday, but Sunday came up as a better day. Anyone in for beers this Sunday? If
  three of you are in, I'll set it up." A fresh idea's reads "Love it. Beers this
  Sunday? If three are in, I'll set it up." The second was deliberately shortened
  on 17 Aug because "Anyone in for X?" plus "If three are in" asks the same
  question twice and cost a third rendered row on a phone; the revival message
  still carries exactly that double-ask, and phrases the bar differently ("three
  of you" vs "three"). Same control, same chips, two voices, and the taller one
  runs on the screen whose height budget the team already had to fight for.
- **evidence** — `buildSuggestedRetryMessage` returns
  `` `${cap} didn't happen for ${failed}, but ${revival} came up as a better day. Anyone in for ${activity} this ${revival}? If three of you are in, I'll set it up.` ``
  against `buildGaugeMessage`'s `` `Love it. ${opener} ${when}?${disclosureClause} If three are in, I'll set it up.` ``
  (`spark-copy.ts:491`), whose own comment records the 17 Aug shortening and its
  reason (`spark-copy.ts:483-489`).
- **severity** — queue
- **confidence** — certain

### F-3-5: The register misses a stay-quiet decision that was added in code review, which is the exact rot the register exists to prevent
- **file:line** — `src/lib/orbit/endgame.ts:499-510` (`same_activity_live`)
- **consequence** — The written register of every place Orbit decides to speak or
  stay quiet is the project's answer to the 29 July bug, and its own closing note
  says a list that looks complete and is not is worse than no list. It is missing
  a real one: a day-blocked idea that a member gave a better day for is silently
  *not* revived when a same-activity idea is already live. The next person tuning
  how eager Orbit is will read the register, believe it is complete, and miss this.
- **evidence** — `handleRevive` ends in
  `if (sameActivity.some((g) => isGaugeLive(g, timeZone, now))) return { gaugeId: gauge.id, action: "skipped", reason: "same_activity_live" }`.
  `grep -n "same_activity_live" docs/build-notes.md` returns nothing; the register's
  own row for this path ("`endgame.ts`, suggested revival at a day-blocked close",
  build-notes.md:257) says only "Speaks. One message either way". Two smaller
  omissions in the same function: the start-already-passed fallback
  (`endgame.ts:483-486`, which routes to the ask on an ordinary gauge and to the
  plain close on a guess gauge) is recorded in CLAUDE.md's settled list but has no
  register row, and `already_revived` (`endgame.ts:459`) has none either.
  A fourth omission sits in the other file: the share-readiness slice added a
  membership gate to the recognition path (`src/app/actions/detect-intent.ts:79-81`,
  a non-member's message is never read at all), and the register's precondition
  row still lists only four things ("no user / no message / Orbit's own message /
  a non-sender triggered it", build-notes.md:272). Structural rather than
  interesting, but the register's own closing rule does not have a size threshold.
  For contrast, `already_at_bar` — the other guard born in code review — *did* get
  its row (build-notes.md:249), so the practice exists and these slipped it.
- **severity** — queue
- **confidence** — certain

### F-3-6: The register credits two of the day-comment silences to the wrong file
- **file:line** — `docs/build-notes.md:227` vs `src/lib/orbit/day-comment-plan.ts:58,70`
- **consequence** — Someone loosening Orbit's day-comment behaviour by following
  the register would open the wrong file, find only one of the three silences
  there, and conclude the other two do not exist. Cheap to fix, and the whole
  value of the register is that it points at the right place.
- **evidence** — The register row is titled "`spark.ts` intent prompt +
  `normalizeIntent`, the day-comment class" and says it "Stays quiet three ways:
  the reading names no single day, it names the gauged day itself ..., or it
  names an activity matching no live gauge." Only the first lives in
  `normalizeIntent` (`src/lib/orbit/spark.ts:315`). The other two live in
  `planDayComment` (`day-comment-plan.ts:58` and `:70`), and there is a fourth
  there the register does not mention at all (`day-comment-plan.ts:50`, no live
  gauges).
- **severity** — decline
- **confidence** — certain

### F-3-7: Nothing carries the group's suggested name across a gap-ask round, though its two neighbours are both protected
- **file:line** — `src/app/actions/merge-gap.ts:112-117`
- **consequence** — During onboarding, when Orbit has to ask the founder a follow-up
  question, the group's proposed name is on screen the whole time. It can change
  between one answer and the next without the founder touching it, because the
  answer round asks the model to redo the whole picture and only the activity and
  the venue are protected from being rewritten. The cost is small (the founder can
  still edit the name on the next screen) but it is the founder's first impression
  of whether Orbit listens, and it is the same failure the activity guard was built
  for after CLIMBING drifted to CLIMB.
- **evidence** — Two carry-over guards run on the raw merged claim and neither
  covers the name:
  ```ts
  raw = enforceActivityCarryOver(raw, currentState, answer)
  raw = enforceVenueCarryOver(raw, currentState)
  ```
  `enforceActivityCarryOver` (`src/lib/orbit/gap.ts:118`) and
  `enforceVenueCarryOver` (`gap.ts:161`) both iterate `raw.rhythms` only;
  `suggestedGroupName` sits at the top level and is passed straight to
  `normalizeExtraction`. The merge prompt's own worked example makes it more
  likely rather than less: its `CURRENT UNDERSTANDING` sample
  (`src/lib/orbit/merge.ts:46`) omits `venueName` from the rhythm object entirely,
  so the example the model copies from is not the shape the code actually sends
  (`merge.ts:75-83`, which does include `venueName`).
- **severity** — queue
- **confidence** — likely (certain that no guard exists; I could not run the model
  to measure how often the name actually drifts, and the benches do not assert on it)

### F-3-8: One bad group can stop everything Orbit does on a schedule, for every group, for as long as nobody notices
- **file:line** — `src/app/api/cron/orbit/route.ts:49-56` (with `src/lib/orbit/reconcile.ts:129-130`)
- **consequence** — Orbit's hourly background work is three jobs in a row:
  create the next recurring event, run the idea endgame (bumps, goodbyes,
  retries, revivals), and close stalled time-change votes. The first job stops
  the whole hour on any unexpected database error in any one group, and the
  other two never run — for that group and for every other group in the product.
  Nobody is told. A group's Monday climb stops appearing, ideas stop getting
  their last call and stop dying politely, and a stalled time-change vote never
  gets its ending, all at once and silently, with only a line in a server log.
  The two later jobs were written to be resilient (each catches per item and
  carries on); the first was written before them and was never given that
  treatment, so adding them behind it quietly widened its blast radius.
- **evidence** — The route runs the three sequentially inside one `try`:
  ```ts
  const results = await reconcileScheduledEvents(new Date())
  const endgame = await runGaugeEndgame(new Date())
  const proposalEndgame = await runProposalEndgame(new Date())
  ```
  and `reconcileScheduledEvents` re-throws anything that is not a unique-key
  collision, from inside its per-group loop:
  ```ts
  // Any other error is unexpected — re-throw so the cron handler can log it
  throw err
  ```
  Contrast `runGaugeEndgame` (`src/lib/orbit/endgame.ts:139-143`) and
  `runProposalEndgame` (`src/lib/proposals/endgame.ts:83-88`), which both do
  `try { results.push(await handleOne(...)) } catch (err) { console.error(...) }`
  and keep sweeping. The route's own catch turns the throw into a 500 and
  returns; nothing retries until the next hour, which will fail the same way.
- **severity** — queue
- **confidence** — certain

### F-3-9: Answering Orbit's own question can get you total silence, and that silence is not on the register
- **file:line** — `src/app/actions/detect-intent.ts:179` (via `src/lib/orbit/spark-copy.ts:398`)
- **consequence** — Orbit asks the group "Beers didn't happen for Friday, but
  three of you want it. What day works better?" A member replies "Friday?" late
  on a Friday, or "tonight at 6" after 6, and gets nothing at all: no new idea,
  no "that's already gone", no acknowledgement. This is the worst shape of
  silence the product recognises — silence right after Orbit itself spoke to
  you — and it is the one path where the rule that a direct ask is never left
  hanging is not honoured. The equivalent rule on the fresh-idea path is
  registered and reasoned about; this copy of it is not written down anywhere,
  so nobody tuning Orbit's eagerness would find it.
- **evidence** — The action drops out on a null plan with no message:
  ```ts
  const planned = planAnswerGauge(intent.answer, {...}, group.timeZone, now)
  if (!planned) return { status: "quiet" }
  ```
  `planAnswerGauge` returns null purely on the clock:
  `const start = sparkStartInstant(proposedDate, timeLocal, timeZone); if (start <= now) return null`
  (`spark-copy.ts:397-398`). The identical rule on the spark path
  (`detect-intent.ts:268-270`) has its own register row ("`detect-intent.ts`,
  the proposed start is already past", build-notes.md:243) and its own stated
  justification. `grep -n "planAnswerGauge" docs/build-notes.md` finds it only
  in narrative, never in the register table. The two answer-path suppression
  guards immediately above it (`detect-intent.ts:160-171`, an existing gauge or
  an existing event for that activity) are also unlisted, though those at least
  mean something visible already exists.
- **severity** — queue
- **confidence** — certain

### F-3-10: Nothing stops a member's or a founder's own words from carrying an em-dash straight into Orbit's mouth
- **file:line** — `src/lib/orbit/rhythm.ts:50-54` (`cleanShortText`) and `src/lib/orbit/normalize.ts:71`
- **consequence** — The product has a firm rule that Orbit never uses em-dashes,
  because they are not how Orbit talks. Every string Orbit says about an idea
  or a plan embeds an activity name lifted from what a person typed, and that
  name is only trimmed, never cleaned. A member who writes "beers—friday" can
  end up with Orbit posting "Love it. Beers—friday this Friday? If three are
  in, I'll set it up.", and the same text becomes the event's title and the
  entry saved to people's calendars. The project already decided this needs
  cleaning: the one model-suggested string that reaches the founder, the group
  name, is explicitly stripped of em and en dashes. The activity, which appears
  far more often and in Orbit's own sentences, is not. Separately, the founder's
  activity has no length limit at all, so nothing but the prompt's good manners
  keeps a runaway phrase out of a card title on a screen whose height was
  fought for.
- **evidence** — `cleanShortText` (used for the spark activity via
  `spark.ts:68` and for every venue name) is trim-and-cap only:
  ```ts
  const t = v.trim().slice(0, max).trim()
  return t.length > 0 ? t : null
  ```
  Onboarding's own sanitizer does even less: `normalize.ts:71` is
  `const activity = typeof o.activity === "string" ? o.activity.trim() : ""` —
  no cap, no dash strip — and `parseStoredRhythms` only checks
  `typeof r.activity === "string" && r.activity.length !== 0`
  (`rhythm.ts:145`). Compare `cleanSuggestedName`, four lines away in the same
  normalize module:
  `const cleaned = (suggested ?? "").replace(/[—–]/g, " ").replace(/\s+/g, " ").trim()`
  (`normalize.ts:136`), and `validateQuestion`'s hard gate on generated prose,
  which rejects `/[—–\n\r.!]/` outright (`gap.ts:215`). A grep of `src/` for
  em/en dashes inside string literals returns only a server log line and that
  strip, so nothing Orbit says today carries one; the gap is that nothing stops
  it.
- **severity** — queue
- **confidence** — certain (that no guard exists and the path is open);
  unsure how likely the model is to hand back an activity containing a dash,
  since I could not run it.

### F-3-11: Any group member can make Orbit re-read the same message as many times as they like, and each read costs money
- **file:line** — `src/app/actions/detect-intent.ts:57`
- **consequence** — Reading a message costs roughly four tenths of a cent every
  time. The function that does it is directly callable by anyone with a session
  in the group, takes only a message id, and has no record of having already
  read that message, so the same message can be charged for indefinitely. The
  outcomes stay correct (a second reading cannot create a second idea) but the
  bill does not. On a prototype paying out of a personal account with no
  spending ceiling, one member with a loop can run up whatever they like, and
  the invite link is the only thing standing between that member and a stranger.
- **evidence** — `detectIntentAction(messageId)` is a `"use server"` export with
  no idempotency marker: the guards it applies are the sender's own identity
  (`detect-intent.ts:73-81`) and nothing about whether this message was already
  processed. The model call at `:141` runs before any of the write-race guards.
  Downstream idempotency is real but is on the *writes* only (`createGauge`'s
  unique `sourceMessageId`, `Event.gaugeId`), so a replay is a paid model call
  followed by a skipped write. Nothing rate-limits the action, and
  `src/app/groups/[id]/GroupHome.tsx:125` calls it exactly once per send only
  because that is what the UI happens to do.
- **severity** — queue
- **confidence** — certain (about the code path); unsure whether the owner
  considers this in scope before launch, since the wall is invite-only.

### F-3-12: The test suite reports success while telling you it may be lying
- **file:line** — `src/components/__tests__/OrbitNoteScreen.test.tsx:1`
- **consequence** — Every claim this project makes about its own correctness
  rests on `npm test` being green. It currently prints "Vitest caught 2
  unhandled errors during the test run. This might cause false positive tests"
  and then exits successfully, which means the automatic gates that run the
  suite after an edit treat that run as clean. The immediate errors look
  harmless, but the fact that unhandled errors do not fail the run is the part
  that matters: a future crash that silently skips real assertions would look
  identical to today's green board.
- **evidence** — `npm test` on a clean checkout of `main` (22 Aug 2026):
  `Test Files 92 passed (92) / Tests 935 passed (935) / Errors 2 errors`,
  and `npm test >/dev/null 2>&1; echo $?` prints `0`. Both errors are
  `ReferenceError: window is not defined` originating in
  `src/components/__tests__/OrbitNoteScreen.test.tsx`, thrown from
  `react-dom-client.development.js` on a scheduler callback after the file's
  jsdom environment has been torn down (the file does correctly declare
  `// @vitest-environment jsdom` on line 1, so this is a teardown race, not a
  missing environment). `npx tsc --noEmit` and the suite are otherwise clean.
- **severity** — queue
- **confidence** — certain (reproduced twice); unsure whether it is currently
  masking anything, which is exactly the problem.

## Model cost, as a product fact

Not a defect; the lane was asked to name it.

- **Per member chat message: exactly one model call.** `detectIntentAction` calls
  `detectIntentClaim` once (`src/app/actions/detect-intent.ts:141`) and nothing
  else in that path calls a model. No fan-out, no retry loop, no recursion.
- **Per cron tick: zero model calls.** `reconcile.ts`, `endgame.ts`, and
  `proposals/endgame.ts` compose every string deterministically; there is no
  Anthropic import anywhere in that path.
- **Per onboarding: one call for step 1, plus one per follow-up answer, capped at
  two answers** (`MAX_GAP_ROUNDS = 2`, `src/lib/orbit/gap.ts:22`, and the round
  is clamped server-side at `merge-gap.ts:83-85`, so a tampered payload can only
  shorten the loop). Worst case three calls per group created.
- **Unit cost.** All three behaviours run on `claude-haiku-4-5`
  (`src/lib/orbit/extract.ts:22`), billed at $1.00 per million input tokens and
  $5.00 per million output. The intent system prompt is 8,195 characters
  (~2,050 tokens), the schema roughly 450 more, and the conversation window is
  up to 20 messages plus the calendar and gauge notes; call it ~3,000 input
  tokens and ~150 output. **About $0.004 per member message**, so ~$4 per
  thousand messages. Onboarding is cheaper (shorter prompt, no history).
- **The one uncapped path is F-3-11**, a replayable server action.
- **An unpulled lever, deliberately not recommended:** the intent call sends the
  same ~2,500-token prefix every time and uses no prompt caching, which would cut
  roughly 60% of the per-message cost. At this volume that is single-digit
  dollars, the cache TTL is five minutes and group chat is bursty, so the honest
  recommendation is to leave it. Recorded so the number exists if volume changes.

## Appendix (real, but no product consequence)

### A-3-1: A wrong-*type* venue value rejects a whole rhythm payload, which is not what the registered item says
- **file:line** — `src/lib/orbit/rhythm.ts:175-177`
- Suppression item 22 records "`parseRhythm` rejects a wrong-type
  `durationMinutes` while `venueName` degrades to null". That is accurate about
  `parseRhythm`, whose venue handling is lenient by design and says so
  (`rhythm.ts:120-123`). **This is a different function**: `parseStoredRhythms`,
  the one the group-creation payload and the gap round-trip go through, is
  strict on venue type and returns null for the entire array
  (`if (r.venueName !== undefined && r.venueName !== null && typeof r.venueName !== "string") return null`).
  A non-string venue therefore blocks group creation, which reads against
  "venue never gates anything, not group or event creation". Unreachable from
  the real UI — `normalizeExtraction` only ever produces `string | null` — so
  only a hand-tampered payload gets there, and a tampered payload being rejected
  is fine. Recorded because the registered wording would lead a reader to
  believe this line behaves the other way.
- **severity** — decline · **confidence** — certain

### A-3-2: Orbit's own confirm-or-leave-it question never gets a closing row
- **file:line** — `src/lib/proposals/endgame.ts:74`
- The sweep filters `kind: ProposalKind.GROUP`, so an ASKER-kind proposal (the
  chip Orbit offers the asker when it is fairly sure but not certain) stays
  `answer: null` forever once its boundary passes. Nothing user-visible: the
  chips stop rendering at exactly the same boundary
  (`src/lib/proposals/read.ts:28-32`), and "leave it" is the designed way to
  decline. Worth one line only because the group sweep's own justification was
  that a stalled question needs an ending somewhere, and this one has none —
  correctly, because the asker is the one who declined to answer.
- **severity** — decline · **confidence** — certain

### A-3-3: The bench is outside the test runner by filename convention only
- **file:line** — `vitest.config.ts:14-31`
- The config sets no `include` or `exclude`, so collection is vitest's default
  glob (`**/*.{test,spec}.*`). All four eval files (`evals/detect/cases.ts`,
  `evals/detect/run.ts`, `evals/onboarding/cases.ts`, `evals/onboarding/run.ts`)
  are outside it, and `find` confirms no file under `evals/` is named as a test.
  So the requirement holds today. It holds by nobody having named a file
  `*.test.ts` in `evals/`, not by configuration; an explicit
  `exclude: ["evals/**"]` would make it structural. Both eval headers already
  say the naming is deliberate, which is the current mechanism.
- **severity** — decline · **confidence** — certain

## What I could not check

- **Whether the model actually produces the inputs that trigger F-3-1, F-3-7,
  and F-3-10.** All three are "no code-side guard exists"; how often the model
  varies an activity's wording, rewrites the group name mid-conversation, or
  emits a dash is a question only a bench run answers, and the audit is
  forbidden from spending money on `eval:detect` / `eval:onboarding`. The code
  facts are certain; the frequencies are not measured anywhere.
- **Whether the change ladder ever declines a request it could serve.**
  `planChange`'s first rung declines whenever `requestedFields` contains
  anything other than `"time"` (`change-plan.ts:50`). If the model ever tags a
  plain time move as `["time","other"]`, Orbit answers "I can't change that part
  of the plan yet" to a request it can do. No bench case covers that shape
  (the closest, `venue-ask-two-plans`, is a genuine venue ask), and I could not
  run the model to see whether it over-tags. Flagging the gap, not asserting the
  bug.
- **Runtime behaviour of any of this.** Read-only audit: no dev server, no
  migrations, no seed scripts, no bench runs. Everything above is from reading
  the code, plus `npx tsc --noEmit` (clean) and two full `npm test` runs.
- **The `{ action: "quiet" }` branch in `detect-intent.ts:315`.** The register
  says it is dead residue; I confirmed `planChange` never constructs it
  (`change-plan.ts` has no such return) and left it alone, since removing dead
  code is not this audit's job and the register already records it.

## Coverage

Read in full:
- `src/lib/orbit/spark.ts`, `normalize.ts`, `change-plan.ts`, `day-comment-plan.ts`,
  `extract.ts`, `merge.ts`, `gap.ts`, `endgame.ts`, `model-errors.ts`,
  `unavailable-copy.ts`, `window.ts`, `fetch-window.ts`, `reconcile.ts`, `rhythm.ts`
- `src/lib/orbit/spark-copy.ts` (read in full; quoted regions 255-340, 440-540, 377-427)
- `src/lib/orbit/change-copy.ts` (all exported copy strings and constants; not the
  date-arithmetic helpers line by line)
- `src/app/actions/detect-intent.ts`, `extract-group.ts`, `merge-gap.ts`
- `src/lib/gauges/open-ask.ts`, `day-comment.ts`, `read.ts`, `threshold.ts`, `promote.ts`
- `src/lib/proposals/endgame.ts`, `read.ts`
- `src/app/api/cron/orbit/route.ts`
- `evals/detect/run.ts`, `evals/detect/cases.ts`, `evals/onboarding/run.ts`,
  `evals/onboarding/cases.ts` (cases files: headers, type definitions, and all
  day-comment / answer / merge cases in full; the eleven extract cases skimmed by
  id and assertion name)
- `docs/build-notes.md` §"Where Orbit decides to speak or stay quiet", lines 200-300
- `vitest.config.ts`, `package.json`

Read in part, for a specific question only:
- `src/app/groups/[id]/GroupHome.tsx` (the send-then-detect transition, lines 95-175)
- `src/app/create/StepGapAsk.tsx`, `PlaybackCard.tsx` (whether the group name renders
  during a gap round)
- `src/lib/gauges/create.ts`, `vote.ts`, `src/lib/proposals/create.ts`, `consensus.ts`,
  `tally.ts`, `src/lib/orbit/occurrence.ts`, `announce.ts`, `playback.ts`
  (referenced through their callers; not read line by line — they are lane 2's
  and lane 4's, and nothing I traced into them contradicted the register)

Assigned and not read:
- `src/lib/orbit/__tests__/**` — the audit reads product code against the written
  register; the tests are a separate lane's material and reading them would have
  told me what the code is believed to do rather than what it does.

Verification run: `npx tsc --noEmit` → clean. `npm test` → 92 files, 935 tests
passing, 2 unhandled errors, exit 0 (see F-3-12). Neither eval bench was run.


---

# Lane 3, SECOND PASS (22 Aug 2026)

A second reader on the same lane. Round one's F-3-1..F-3-12 above are not
re-reported. Register source read in full this time: `docs/build-notes.md`
§"Where Orbit decides to speak or stay quiet", lines 200-330 (round one read
200-300, which stops inside the endgame table).

## Findings (second pass)

### F-3-13: Orbit can only see three of the five plans on the group's screen, so a request about the fourth or fifth is answered about the wrong plan or not at all
- **file:line** — `src/app/actions/detect-intent.ts:90`
- **consequence** — The group home shows up to five upcoming plans in the card
  carousel. When a member asks Orbit to move one of them, Orbit is shown only
  the first three. If the plan they mean is the fourth or fifth, one of two
  things happens: Orbit asks "Which plan do you mean, climbing or beers?",
  naming only plans the member did not ask about, or Orbit picks the closest of
  the three it can see and proposes moving *that* plan to the whole group,
  which resets every RSVP on a plan nobody asked to move once the vote passes.
  Nothing anywhere reports the mismatch. The code's own comment still claims
  Orbit "sees every plan the group sees (the carousel's three)", which was true
  when it was written on 27 July and stopped being true on 12 August when the
  card region went to five.
- **evidence** — Detection fetches a hard-coded three:
  ```ts
  // The model sees every plan the group sees (the carousel's three), each
  // numbered so a change request can say which one it means.
  const events = await findUpcomingEvents(group.id, now, 3)
  ```
  The group home fetches five, from the shared constant:
  `const upcomingEvents = await findUpcomingEvents(group.id, new Date(), CARD_REGION_CAP)`
  (`src/app/groups/[id]/page.tsx:79`), with `CARD_REGION_CAP = 5`
  (`src/lib/cards/region.ts:8`). The same three-item array is what bounds the
  model's answer (`normalizeIntent(claim, events.length, ...)`,
  `detect-intent.ts:148`, which nulls any `targetEventNumber` above
  `upcomingCount`) and what composes the which-plan question
  (`buildWhichPlanQuestion(candidates.map((c) => c.label))`,
  `change-plan.ts:65`). Git dates confirm the drift: the `3` was written
  2026-07-27, `CARD_REGION_CAP = 5` landed 2026-08-12.
- **severity** — queue
- **confidence** — certain (about the mismatch and both call sites); unsure how
  often a real group holds four or five future plans at once, which needs one
  scheduled occurrence plus three or more promoted ideas.

### F-3-14: When Orbit has a question open about one activity and is gauging a different one, a member's day reply can open a gauge for the wrong activity and count them in on it
- **file:line** — `src/lib/orbit/spark.ts:288-296` (the answer arm, checked first and unconditionally)
- **consequence** — Orbit can be waiting on "what day works better for
  climbing?" while separately gauging "beers this Friday". A member types
  "Sunday works better", meaning beers. Because the answer reading is checked
  first and wins whenever the model sets its flag, Orbit can open a **climbing**
  gauge for Sunday and record that member as already in on it. They never said
  climbing and never tapped anything; the false yes then carries through to a
  real RSVP if two other people say yes. The code's own comment says this
  precedence is "the model's call on one flag, not a decided rule", and the
  written register that is supposed to hold every one of these decisions does
  not mention the situation at all, so nobody tuning Orbit would find it.
- **evidence** — `normalizeIntent` runs the answer arm before everything else,
  gated only on there being an open ask anywhere in the group:
  ```ts
  if (hasOpenAsk && o.isAskAnswer === true) { ... return { kind: "answer", ... } }
  ```
  The gating flag is group-wide, not activity-matched: `findOpenRetryAsk` returns
  the first unanswered ask in the group (`src/lib/gauges/open-ask.ts:29-64`) and
  `detect-intent.ts:148` passes only `openAsk !== null`. The action then builds
  the new gauge from the ask's own stored activity, never from anything in the
  member's message (`activity: openAsk.activity`, `detect-intent.ts:189`), and
  seeds the member IN whenever they named a day
  (`initiatorUserId: planned.seedNamer ? user.id : null`, `:194`, which writes a
  real `GaugeAnswer.IN` row in `src/lib/gauges/create.ts:88-92`). The module
  comment at `spark.ts:270-284` names the overlap and says a decided precedence
  and a bench case "are queued, not built". `grep -n "48-hour\|open ask\|openAsk"
  docs/build-notes.md` finds the answer-class row (build-notes.md:216), which
  describes the window as same-activity and does not mention the cross-activity
  overlap. Distinct from round one's F-3-5 (missing endgame and precondition
  rows) and from F-3-1 (silence on an activity mismatch in the day-comment arm);
  this is the opposite failure, Orbit acting on the wrong activity rather than
  staying quiet.
- **severity** — queue
- **confidence** — likely (the code path and the seeding are certain; whether the
  model sets `isAskAnswer` on a message about a different live activity is
  unmeasured, and no bench case covers the two-situation overlap)

### F-3-15: When the tap that should create the plan fails, nothing ever tries again, and Orbit later tells the group the idea didn't come together after three people said yes
- **file:line** — `src/app/actions/gauge-vote.ts:119-125` (and the same shape at `src/app/actions/proposal-vote.ts:114-120`)
- **consequence** — Orbit's own gauge message promises "If three are in, I'll
  set it up." Setting it up happens exactly once, inside the third person's tap.
  If that one attempt fails for any reason (a database hiccup, a timeout, a
  transient error), the failure is written to a server log and nothing else
  happens: no retry in the tap, no retry on the hourly sweep, no note to
  anybody. The idea sits at three yeses with no plan behind it until its day
  arrives, and then Orbit posts "Beers didn't come together this time. Maybe
  next week." to three people who all said yes. The same shape exists on the
  time-change vote: a passing vote whose move failed is later closed with "The
  time change didn't come together", with the vote never re-counted. The
  product's one background sweep exists precisely to catch up on work that did
  not happen; it does not cover this one.
- **evidence** — The only attempt is best-effort inside the vote action:
  ```ts
  if (answer === GaugeAnswer.IN) {
    try { await promoteGaugeToEvent(gaugeId, new Date()) }
    catch (err) { console.error("[gauge-vote] promotion failed", err) }
  }
  ```
  `grep -rn "promoteGaugeToEvent\|promoteProposalMove" src scripts | grep -v __tests__`
  returns only these two action call sites and the definitions: the cron route
  (`src/app/api/cron/orbit/route.ts:49-56`) never calls either. The sweep then
  *recognises* this exact state and deliberately does nothing about it:
  `if (countIn(memberVotes) >= SPARK_THRESHOLD) return { ..., reason: "already_at_bar" }`
  (`src/lib/orbit/endgame.ts:265-267`), whose own comment names the cause ("a
  promotion attempt that committed the votes but rolled back the event") and
  only skips the bump. Once the gauge closes, `handleOne` routes it to
  `handleClose` (`isRetryEligible` is false at three INs, `threshold.ts:42-45`),
  which posts `buildClosureMessage` — "didn't come together this time"
  (`spark-copy.ts:606-609`). On the proposal side `runProposalEndgame` lapses on
  the clock alone and never re-evaluates `hasConsensus`
  (`src/lib/proposals/endgame.ts:109-117`). Partial self-heal exists but is not
  a mechanism: a *fourth* member voting IN would call promote again.
- **severity** — queue
- **confidence** — certain (about the code path and the closing message);
  unsure how often the promote transaction actually fails in production, which
  nothing measures.

### F-3-16: The onboarding bench and the product disagree about which group names count as weekday names, in both directions
- **file:line** — `evals/onboarding/cases.ts:118-141` vs `src/lib/orbit/normalize.ts:167-184`
- **consequence** — The rule "don't name a multi-day group after one weekday" now
  exists as two separate lists in two files, and they do not match. The product
  deliberately allows "Sun Valley Climbers"; the bench marks it a failure. The
  product deliberately catches "Mondays Climbers"; the bench's own list would
  not have. The practical cost is a bench that can print a red line for
  behaviour the owner decided to keep, on the one board that is supposed to mean
  something when it goes red. This is the same shape as the 29 July bug (one
  rule, two copies, quietly disagreeing), just between the product and its
  scorekeeper rather than between a prompt and its code.
- **evidence** — Bench predicate: `WEEKDAY_WORDS` includes `"sun"` and has no
  plural allowance, `const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_WORDS.join("|")})\\b`, "i")`.
  Product guard: `WEEKDAY_NAME_WORDS` deliberately omits `"sun"` (with a
  documented reason at `normalize.ts:156-166`), adds `"tues"` and `"thurs"`, and
  the regex allows a trailing s: `` new RegExp(`\\b(${WEEKDAY_NAME_WORDS.join("|")})s?\\b`, "i") ``.
  The product file knows about the bench ("the two four-letter abbreviations the
  bench's own predicate ... documents as a known, accepted blind spot"); the
  bench file does not know about the product's `"sun"` decision. Different from
  suppression item 16, which records that model-generated names carry a measured
  residual risk closed by `rejectWeekdayNameOnMultiDay`: this is not about the
  model or the residual, it is about the grader and the guard using two
  different rules.
- **severity** — queue
- **confidence** — certain (about the divergence); unsure how often a real
  suggestion would land on the differing words, which is unmeasured.

### F-3-17: Orbit asks one member "Want me to make the change?" and is never told its own question is open, so answering in words gets silence or a second question about the same plan
- **file:line** — `src/app/actions/detect-intent.ts:117-122`
- **consequence** — When Orbit is fairly sure but not certain what somebody
  wants, it replies "Sounds like you want climbing this Sun moved to 9am. Want
  me to make the change?" and puts two chips under it, shown only to that
  person. If they answer in the chat instead of tapping, which is the natural
  thing to do when Orbit just spoke to them in a chat, Orbit has no idea the
  question is open: a plain "yes please" reads as agreement and gets nothing
  back, and a fuller "yes, 9am" is read as a brand-new request, which can put a
  second question to the whole group about the same plan while the first one is
  still sitting there with its chips. The equivalent protection for the
  group-wide vote exists and is a recorded decision; this half of the same
  behaviour has neither the protection nor a line in the register.
- **evidence** — Only GROUP-kind proposals are described to the model:
  ```ts
  const openProposalLines = liveProposals
    .filter((p) => p.kind === ProposalKind.GROUP)
    .map((p) => `A question is already out to the group: move ${label} to ...`)
  ```
  `findLiveProposals` returns both kinds unfiltered
  (`src/lib/proposals/read.ts:20-45`), and the VERIFY kind is what the ask rung
  creates (`planChange` rung 5 → `action: "ask"` → `createChangeProposal`,
  `change-plan.ts:92-98` and `detect-intent.ts:359-367`). Its chips render for
  the asker alone (`src/app/groups/[id]/page.tsx:162`,
  `.filter((p) => p.kind === "VERIFY" && p.askerUserId === viewer?.id)`). The
  intent prompt's only sentence about an open question is the group one ("When a
  note says a question is already out to the group about moving a plan, a
  message that simply agrees with it is neither a spark nor a change request",
  `src/lib/orbit/spark.ts` INTENT_SYSTEM_PROMPT), and the register carries a row
  for exactly that one ("the live-proposal sentence", build-notes.md:213) with
  none for the VERIFY case. A verbal confirm that is read as a change request
  reaches `createGroupProposal` without `resolveVerifyProposalId`
  (`detect-intent.ts:346-354`), which is the only thing that would retire the
  open VERIFY row, so both questions stay live. Not covered by suppression item
  8 (verbal RSVP), which is about attendance, not about answering Orbit's own
  question.
- **severity** — queue
- **confidence** — likely (certain that the VERIFY proposal is never described
  to the model and that nothing retires it on a verbal confirm; the exact
  classification of "yes please" is model behaviour I could not run)

### F-3-18: A member's own name is never trimmed to a sane length or cleaned, and Orbit's stored messages are built out of it
- **file:line** — `src/app/actions/join-group.ts:20` (and `src/app/actions/create-group.ts:41` for the founder's name and the group's name)
- **consequence** — The name someone types on the join screen is stored exactly
  as typed, with no length limit anywhere: not in the form, not in the server
  action, not in the database column. That name is then written verbatim into
  messages Orbit composes and stores forever in the group's feed ("Sam wants
  climbing this Sun at 9am instead of 7pm. Move it?", "Sam & Jordan are in so
  far", "Last call on beers tomorrow: Sam is in, one more makes it happen"). One
  person pasting a wall of text as their name permanently deforms the group's
  chat history for everybody, and there is no way to edit a name after the fact.
  The same gap covers the group's own name, which is the biggest text on the
  home screen and on the invite screen: Orbit's suggestion is capped at 50
  characters, but the founder's edit of it is capped nowhere, while the venue
  field one row below on the same card *is* capped. Nothing here is malicious
  input only; a paste accident produces it.
- **evidence** — Join: `const memberName = (formData.get("memberName") as string | null)?.trim() ?? ""`,
  passed straight to `joinGroupByInvite`; the form field has no `maxLength`
  (`grep -n "maxLength" src/app/create/*.tsx src/app/join/[inviteToken]/JoinForm.tsx`
  returns exactly one hit, `Step2Playback.tsx:226`, the venue). Create:
  `const groupName = input.groupName?.trim() ?? ""` with only a non-empty check,
  while `description` on the very next line is capped
  (`.slice(0, DESCRIPTION_MAX)`). The column is unbounded: `"name" TEXT NOT NULL`
  (`prisma/migrations/20260619003631_init/migration.sql:10,35,73`). The names
  reach Orbit's own composed prose at `buildGroupProposalQuestion`
  (`src/lib/orbit/change-copy.ts:184`), `buildTallyLine`
  (`src/lib/orbit/spark-copy.ts:534-543`) and `buildBumpMessage` (`:595-603`),
  the last two of which are written into stored `Message` rows by
  `handleBump` (`src/lib/orbit/endgame.ts:291-293`). Related to but distinct
  from round one's F-3-10, which is about the model-supplied *activity* string
  (`rhythm.ts:50`, `normalize.ts:71`): this is a different field, typed directly
  by a person, on a path no model touches, and it is the one that lands in a
  permanent stored message rather than a rendered one.
- **severity** — queue
- **confidence** — certain (that no cap or cleaning exists on any of the three
  fields, and that the names reach stored Orbit copy); likely about the exact
  visual damage, which I could not render in a browser under this audit's rules.

### F-3-19: Orbit only ever reads a message if the sender's own browser is still there to ask it to, and a message it never read is never noticed by anything
- **file:line** — `src/app/groups/[id]/GroupHome.tsx:125`
- **consequence** — Orbit reading a member's message is not part of sending it.
  It is a second request the sender's own phone makes after the send completes.
  If that second request never lands or never finishes (the person locks their
  phone, switches apps, or closes the tab in the second after sending, which is
  exactly what people do after firing off "we should finally grab beers"), the
  message posts normally and Orbit simply never reads it. Nothing retries, and
  nothing anywhere records that a message went unread, so an idea that got no
  response is indistinguishable from an idea Orbit deliberately stayed quiet
  about. Every one of the product's headline behaviours (opening a gauge,
  answering a change request, hearing an answer to Orbit's own question) hangs
  off this one client-side call.
- **evidence** — The only call site in the product:
  ```ts
  const result = await detectIntentAction(messageId).catch(() => null)
  ```
  `grep -rn "detectIntentAction" src` returns this line, the import above it,
  and the definition. The action itself refuses any trigger but the sender
  (`if (message.authorId !== user.id) return { status: "quiet" }`,
  `src/app/actions/detect-intent.ts:75`), so no other client can pick up a
  dropped read. The hourly cron runs three sweeps and none of them looks at
  messages (`src/app/api/cron/orbit/route.ts:49-56`:
  `reconcileScheduledEvents`, `runGaugeEndgame`, `runProposalEndgame`); no
  column records whether a message was read (`Message` in
  `prisma/schema.prisma` carries no detection marker, and detection's only
  idempotency is the gauge's unique `sourceMessageId`).
- **severity** — queue
- **confidence** — unsure. The code facts are certain (single client-side
  trigger, sender-only, no retry, no record). What I could not check is how
  often a real phone actually drops the in-flight request: a server action
  already in flight may complete server-side even after the tab goes away, and
  I could not run a browser or a device to measure it. Worth naming because
  nothing in the product would tell anyone if it did happen.

### F-3-20: The recognition bench does not contain a single case for the behaviour the product is built around: someone floating an idea
- **file:line** — `evals/detect/cases.ts:36` (the `spark` shape exists in the type and in no case)
- **consequence** — The 33-case bench is the project's only standing evidence
  that Orbit understands what people say, and build-notes calls that behaviour
  "Healthy" on the strength of it. Not one of the 33 cases is a member floating
  an idea. Every case is a change request, an answer to Orbit's question, a
  comment on a live idea, or something Orbit must ignore. So the single thing
  the product exists to do, "we should finally grab beers" becoming a proposed
  day with three chips under it, is measured by nothing. A prompt edit that
  quietly stopped Orbit recognising fresh ideas would leave the bench fully
  green, and the board would be read as saying recognition is fine. The
  must-stay-quiet cases do protect the other direction (a message wrongly read
  as an idea fails them), so what is missing is specifically the proof that a
  real idea still lands, along with the day it names.
- **evidence** — `grep -n '"spark"' evals/detect/cases.ts` returns exactly one
  hit, the type definition
  `| { kind: "spark"; statedDayOfWeek?: number | null }`; there is no
  `expected: { kind: "spark" ... }` anywhere in the file. Bucket counts confirm
  the whole set: `must-recognize` 15, `must-stay-quiet` 13, `ambiguous` 4,
  `accepted` 1 = 33, and reading the fifteen must-recognize ids
  (`bare-ask-*`, `indirect-push-later`, `reschedule-word`, `correction-names-plan`,
  `follow-up-bare-hour`, `put-it-back`, `venue-ask-two-plans`,
  `retry-answer-*`, `daycomment-*`) shows every one is a change, answer, or
  day-comment case. The runner's spark arm
  (`evals/detect/run.ts:124` and the `statedDayOfWeek` grading at `:172-179`)
  is therefore never executed. Not the same as round one's F-3-2, which is
  about four day-comment cases stopping short of `planDayComment`: those cases
  exist and grade something. These do not exist at all. Also not covered by the
  registered eval-coverage item in build-notes §8, which was about extraction
  and merge having no bench and was closed on 20 Aug; recognition's own bench
  was never claimed to have this hole.
- **severity** — queue
- **confidence** — certain

### F-3-21: For a group anywhere from New Zealand eastwards, Orbit can skip the meeting that is happening today and schedule the next one a week out
- **file:line** — `src/lib/orbit/occurrence.ts:133-145`
- **consequence** — A group whose timezone is UTC+12 or further east (New
  Zealand year-round, Fiji, Samoa, Kiribati, the Marshall Islands, Kamchatka)
  gets the wrong answer when Orbit works out the next occurrence of the group's
  rhythm: today is skipped entirely, even when today is a meeting day and the
  meeting has not happened yet. The place this bites is the worst possible one:
  a founder in Auckland who finishes onboarding on a Monday morning for a
  "Mondays at 8am" group is shown their first plan a week away, with that
  morning's climb silently missing. Every other zone I tested is correct, so
  this reads as fine from anywhere in the Americas, Europe, or most of Asia.
- **evidence** — The day scan anchors each candidate day at **UTC noon** and
  then re-reads its local date:
  ```ts
  const candidateUtcNoon = new Date(Date.UTC(localAfter.year, localAfter.month - 1, localAfter.day + offsetDays, 12, 0))
  const localCandidate = getLocalParts(candidateUtcNoon, timeZone)
  ```
  At UTC+12 or more, UTC noon reads as the *next* local day, so `offsetDays = 0`
  is already tomorrow and today is never a candidate. Verified by re-running the
  three functions verbatim outside the repo (read-only, no repo file touched)
  for a Mondays-08:00 rhythm asked at Monday 06:00 local:
  ```
  Pacific/Auckland   -> 2026-01-12 08:00   (should be 2026-01-05)
  Pacific/Fiji       -> 2026-01-12 08:00
  Pacific/Kiritimati -> 2026-01-12 08:00
  America/Los_Angeles-> 2026-01-05 08:00   correct
  Asia/Tokyo         -> 2026-01-05 08:00   correct
  Europe/London      -> 2026-01-05 08:00   correct
  ```
  The suite cannot see it: every zone in `src/lib/orbit/__tests__/occurrence.test.ts`
  is UTC or west of it (`America/Los_Angeles`, `America/Anchorage`,
  `Pacific/Honolulu`, `America/Chicago`, `UTC`). Distinct from suppression item
  20, which records a **fixed** `zonedWallTimeToUtc` quirk with large *negative*
  offsets: this is a different function (`computeNextOccurrence`), a different
  mechanism (the UTC-noon day anchor, not the offset refinement), and the
  opposite side of the map. The spark path is unaffected: `chooseProposedDate`
  and the retry date helpers build their days with `zonedWallTimeToUtc` at local
  midnight and never use a noon anchor.
- **severity** — queue
- **confidence** — certain (reproduced with the real algorithm); the reachability
  depends on the product having a founder in one of those zones, which for a
  portfolio MVP is the owner's call.

## Appendix, second pass (real, but no product consequence I can name)

### A-3-4: The register's missing rows go further than round one's four
- **file:line** — `src/lib/gauges/promote.ts:56-74` and `src/lib/orbit/reconcile.ts:109-114`
- An addendum to F-3-5, not a second finding: `promoteGaugeToEvent`'s three
  silent skips (`no_gauge`, `below_threshold`, `start_passed`) are places where
  Orbit made a promise ("If three are in, I'll set it up") and then says nothing,
  and the `start_passed` one is a settled decision in CLAUDE.md ("a threshold
  reached after the proposed start creating nothing"). None has a register row.
  Neither does `reconcile.ts`'s scheduled announcement, which is Orbit speaking
  on a timer in every group that has a rhythm. Recorded here so the eventual
  register repair covers the whole list rather than the four already named.
- **severity** — decline (as its own item; fold into F-3-5's fix)
- **confidence** — certain

### A-3-5: The note the model gets about a live idea always says "this <weekday>", even when the idea is more than a week out
- **file:line** — `src/lib/orbit/spark-copy.ts:304-307`
- `buildLiveGaugeLine` renders "Orbit is currently gauging interest in beers for
  this Friday" unconditionally, while the member-facing `buildGaugeMessage`
  correctly switches to "on Fri, Jun 21" past seven days (`spark-copy.ts:474-477`)
  because the fallback buffer can land eight days out. So the model can be told
  "this Friday" about an idea that is next Friday. No member-visible outcome I
  could construct: the day comment records only a weekday number and the revival
  date is computed from the gauge's own stored `proposedDate`
  (`chooseSuggestedRetryDate`), never from the model's sense of which week it is.
- **severity** — decline · **confidence** — certain (about the copy); unsure
  whether it ever nudges the model's reading, which nothing measures.

### A-3-6: With two of Orbit's day questions open at once, only the newest is described, and an answer carries no activity
- **file:line** — `src/lib/gauges/open-ask.ts:39` (`orderBy: { retryAskMessage: { createdAt: "desc" } }`)
- The same root as F-3-14 by a second route: `findOpenRetryAsk` returns one ask
  (the newest unanswered), the answer schema has no activity field at all
  (`INTENT_SCHEMA`'s answer group is day/time only), and the action builds the
  new gauge from `openAsk.activity`. Two ideas that failed on the same day
  therefore leave one question invisible, and an answer meant for it opens a
  gauge for the other. Recorded separately from F-3-14 because the mechanism is
  the read, not the precedence, and because it needs two open asks, which is
  rarer still.
- **severity** — queue (with F-3-14) · **confidence** — likely

### A-3-7: The prompt is told to ask about every gap at once; the code records exactly one and tells the next call only that one
- **file:line** — `src/lib/orbit/extract.ts:69` vs `src/lib/orbit/normalize.ts:221-236`
- The extraction prompt says "make it cover every gap the primary rhythm still
  has ... then ask about all of them in the one question", while `classifyGap`
  picks a single `MissingField`, the hint line under the input comes from that
  single field (`GAP_HINT_EXAMPLES`), and the merge call is told `WE ASKED: about
  the days` and nothing else (`merge.ts:23-29, 94`). `validateQuestion` checks
  length, punctuation and dashes, never subject, so nothing detects a question
  and a classification that disagree. I could not construct a case where they
  actually diverge, because the model writes its question from the same fields
  normalize sanitizes, and a sanitization drop makes the model return no question
  at all, which falls back to the matching template. Recorded because the two
  halves of one rule live in prose and code respectively, which is the shape the
  register exists to track.
- **severity** — decline · **confidence** — certain (about the asymmetry);
  unsure whether it is reachable, and I could not run the model to find out.

### A-3-8: "Sunday's noted in case this one doesn't come together" is often noted and then nothing
- **file:line** — `src/lib/orbit/spark-copy.ts:264-275` with `src/lib/orbit/endgame.ts:202-207`
- A member who names a better day is told the day is noted. The revival only
  happens if the gauge also clears the would-have-cleared bar (`isRetryEligible`:
  three between the yeses and the can't-that-days). Below that, the gauge closes
  with the ordinary goodbye, which never mentions the day, and at zero yeses it
  closes silently, so the person who took the trouble to answer hears nothing at
  all. The copy is deliberately hedged and the doc comment says why ("never
  promises a revival ... because whether one happens depends on a bar the comment
  cannot see"), which is the reason this sits in the appendix rather than above.
- **severity** — decline · **confidence** — certain

### A-3-9: Both eval scripts exit 0 no matter how red the board is
- **file:line** — `scripts/eval-detect.ts:70-83`, `scripts/eval-onboarding.ts:71-83`
- Neither sets a non-zero exit on failures. Correct as designed (these are
  deliberately human-read and deliberately outside CI), and noted only because a
  future attempt to wire either into any automated gate would get a green light
  from a fully red bench.
- **severity** — decline · **confidence** — certain

## What I could not check (second pass)

- **Anything requiring the model.** F-3-14, F-3-16, F-3-17 and A-3-6 all turn on
  what the model actually returns in a situation nothing benches. The code paths
  are certain; the frequencies are unmeasured, and the audit is barred from
  spending money on `eval:detect` / `eval:onboarding`.
- **Whether a phone really drops the detection request** (F-3-19). No browser, no
  device, no dev server under this audit's rules.
- **What a very long name actually does to the header and the join card**
  (F-3-18). The missing cap is verified; the visual damage is not rendered.
- **How often the promote transaction fails** (F-3-15). Nothing in the product
  counts it; the only trace is a `console.error`.
- **The suite.** I did not re-run `npm test`: round one recorded the baseline
  (92 files, 935 tests, 2 unhandled errors, exit 0) and nothing in this pass
  changes it. `npx tsc --noEmit` is clean, and `git status --porcelain` shows no
  file outside `docs/audits/findings/` touched.

## Coverage (second pass)

Read in full this pass:
- `docs/build-notes.md` §"Where Orbit decides to speak or stay quiet", lines
  200-330 (the whole section including the two dated postscripts, where round
  one stopped at 300)
- `src/lib/orbit/spark.ts`, `spark-copy.ts`, `change-copy.ts`, `change-plan.ts`,
  `day-comment-plan.ts`, `endgame.ts`, `extract.ts`, `merge.ts`, `gap.ts`,
  `normalize.ts`, `occurrence.ts`, `playback.ts`, `announce.ts`, `reconcile.ts`,
  `window.ts`, `fetch-window.ts`, `model-errors.ts`, `unavailable-copy.ts`
- `src/lib/gauges/create.ts`, `vote.ts`, `read.ts`, `promote.ts`, `threshold.ts`,
  `open-ask.ts`, `day-comment.ts`
- `src/lib/proposals/create.ts` (both builders), `read.ts`, `promote.ts`,
  `consensus.ts`, `tally.ts`, `endgame.ts`
- `src/app/actions/detect-intent.ts`, `extract-group.ts`, `merge-gap.ts`,
  `create-group.ts`, `send-message.ts`, `gauge-vote.ts`, `proposal-vote.ts`,
  `join-group.ts`
- `src/app/api/cron/orbit/route.ts`, `src/lib/cards/region.ts`,
  `src/lib/events/upcoming-list.ts`
- `evals/detect/run.ts`, `evals/onboarding/run.ts`, `scripts/eval-detect.ts`,
  `scripts/eval-onboarding.ts`
- `evals/detect/cases.ts` (header and type block in full; every case's id,
  bucket, fixtures and expectation enumerated), `evals/onboarding/cases.ts`
  (header, `toOutcome`, every assertion builder, the first two extract cases in
  full; the remaining nine extract and three merge cases skimmed by id)

Read in part, for one question only:
- `src/app/groups/[id]/GroupHome.tsx` (the send-then-detect transition),
  `src/app/groups/[id]/page.tsx` (the card-region fetch and the VERIFY filter),
  `src/app/create/Step2Playback.tsx` and `src/app/join/[inviteToken]/JoinForm.tsx`
  (input length caps), `prisma/schema.prisma` and the init migration (name
  column types)

Not read:
- `src/lib/orbit/__tests__/**` and the other test directories, deliberately: this
  lane reads product code against the written register, and lane 5 owns the tests.
- `src/app/actions/proposal-answer.ts`, `rsvp.ts`, `leave-group.ts`,
  `remove-member.ts`, `reset-invite-link.ts` (lane 2's and lane 1's; nothing I
  traced into them bore on Orbit's speak-or-stay-quiet decisions).

Verification run: `npx tsc --noEmit` clean; the `computeNextOccurrence`
reproduction for F-3-21 run as a standalone copy in the scratchpad, never in the
repo. Neither eval bench was run. No dev server, no migration, no seed script.


---

# Lane 3, THIRD PASS (22 Aug 2026)

A third reader on the same lane. F-3-1..F-3-21 and A-3-1..A-3-9 above are not
re-reported. I also checked the other lanes' files before writing, and
deliberately do NOT re-report what they already hold: lane 2's F-2-2
(unauthenticated paid model calls), F-2-4 (uncapped chat message body
re-charged across the next twenty sends), F-2-5 (replayable detection) and
A-2-8 (a member's text pasted into Orbit's prompt in Orbit's own line format),
and lane 6's F-6-6 (the Anthropic client has no timeout and no retry cap) and
its uncapped-description item. Three of my findings sit next to those; each
says how it differs.

## Findings (third pass)

### F-3-22: Four of the five ways Orbit's reading of a chat message can fail leave the member with nothing at all, and the honest line for exactly that moment already exists and is wired to only one of them
- **file:line** — `src/lib/orbit/extract.ts:118-131` and `src/lib/orbit/model-errors.ts:46-49`, with the sink at `src/app/actions/detect-intent.ts:373-383`
- **consequence** — When Orbit cannot read a message, the product has a written,
  owner-approved line for it: "Your message went through. But heads up: I'm
  having trouble thinking right now, so I might miss ideas for a few minutes."
  That line only ever appears for one family of failure (the service is down, or
  out of credits). For the other four ways the read can fail, the member gets
  complete silence, which is indistinguishable from Orbit deciding their message
  was not a request. So a member who asks Orbit to move a plan and gets nothing
  cannot tell "Orbit ignored me" from "Orbit broke", and the group has no reason
  to try again. The register itself records this catch as an open question and
  justifies it with "a failed model call has nothing honest to say" — that
  sentence was written 29 July 2026 and the honest thing to say was built on
  11 Aug 2026, and nobody went back.
- **evidence** — `callExtractionModel` throws five distinct ways. Only two of
  them are `ModelUnavailableError`:
  ```ts
  if (!process.env.ANTHROPIC_API_KEY) throw new ModelUnavailableError("trouble", ...)   // note fires
  ...
  } catch (err) { throw classifyModelCallError(err) }                                    // note fires only for some
  if (response.stop_reason !== "end_turn") throw new ExtractionError(...)                // silent
  if (!text) throw new ExtractionError("no text block in response")                       // silent
  try { return JSON.parse(text) } catch { throw new ExtractionError("response was not valid JSON") } // silent
  ```
  and inside `classifyModelCallError`, `model-errors.ts:46-49`:
  ```ts
  if (err.status === 400 || err.status === 422) {
    // Our request was malformed: a bug on our side, not an outage.
    return new ExtractionError(`extraction request failed: ${message}`)
  }
  ```
  is silent too. The sink is `detect-intent.ts:373-383`, which returns
  `{ status: "unavailable" }` only for `ModelUnavailableError` and
  `{ status: "quiet" }` for every plain `ExtractionError`; `GroupHome.tsx:128-131`
  raises `OrbitDownNote` only on `"unavailable"`. The four silent modes are
  reachable by a member's own words: a `stop_reason` of `"refusal"` on a message
  the model declines to classify, and a 400 for an over-long prompt (the window
  is 20 uncapped message bodies, lane 2's F-2-4). Onboarding treats the same four
  as `{ status: "error" }` and does show the founder a retry message
  (`extract-group.ts:56-59`, `merge-gap.ts:103-106`), so the asymmetry is
  between the two halves of the same product. Dates confirmed with
  `git log -1 -- src/lib/orbit/unavailable-copy.ts` (2026-08-11) against
  `git log -1 -S "the \`catch\` at the end of the action" -- docs/build-notes.md`
  (2026-07-29).
- **How this differs from the register's own entry** — the register lists the
  `detect-intent.ts` catch as **Open** and stops there. What it does not say, and
  what makes this actionable rather than philosophical, is that the split is not
  between "can say something" and "cannot": it is between five throw sites, two
  of which happen to be typed as the class the note is keyed to. Nothing about
  the other three (and the 400/422 branch) is more or less speakable.
- **severity** — queue
- **confidence** — certain (about the code path); unsure how often the model
  actually returns a refusal or an over-long prompt, which nothing measures.

### F-3-23: The one thing Orbit does on an inference is also the one write it never checks it still makes sense, so it can tell a member their idea might not come together seconds after it became a real plan
- **file:line** — `src/app/actions/detect-intent.ts:224-233`, with the unconditional write at `src/lib/gauges/day-comment.ts:37-58`
- **consequence** — A member types "Sunday works better" while the group is
  voting on an idea. Orbit takes one to three seconds to read that. If the third
  yes lands in that gap, the idea becomes a real plan on the calendar and Orbit
  announces it. Orbit then posts its day-comment reply anyway: "Got it, Friday
  doesn't work for you. Sunday's noted in case this one doesn't come together."
  So the feed carries, back to back, Orbit saying the plan is on and Orbit
  hedging about whether it will happen. The member who commented is also recorded
  as not available on a day they are now shown as unanswered for. This is the one
  place Orbit acts on something nobody tapped, so it is the place where being
  wrong is least forgivable, and it is the only write in that whole action that
  does not check whether it lost its race.
- **evidence** — Every other outcome in `detectIntentAction` re-checks before
  claiming it happened: the spark branch `if (result.status !== "created") return
  { status: "quiet" }` (`:288`), the answer branch the same (`:196`), the move
  branch `if (moved.status !== "moved") return { status: "quiet" }` (`:341`), and
  both proposal branches `if (created.status !== "created") ...` (`:355`, `:368`).
  The day-comment branch is:
  ```ts
  await recordDayComment({ groupId, gaugeId: plan.gaugeId, userId: user.id, ... })
  ```
  with no returned status at all — `recordDayComment` is typed `Promise<void>`
  and its transaction is an unconditional `gaugeVote.upsert` + `gauge.update` +
  `message.create`, with no `where` clause guarding against the gauge having been
  promoted. `liveGauges` was read at `:136`, before the model call at `:141`, and
  `findLiveGauges` filters on `event: null` (`src/lib/gauges/read.ts:47`), so the
  snapshot is exactly as stale as the model call is slow. The register row for
  this path ("`detect-intent.ts`, a write lost its race (gauge, move, either
  proposal)", build-notes.md:275) lists four kinds of write and does not list
  this one, which is consistent with it not having a race check.
- **severity** — queue
- **confidence** — certain (that no guard exists and the register omits it);
  likely (that the race is hit in practice) — the window is one model call wide,
  and nothing counts how often it happens.

### F-3-24: If Orbit's onboarding call dies in transit rather than failing cleanly, the founder loses the whole wizard and everything they typed
- **file:line** — `src/app/create/OnboardingWizard.tsx:119-121` (the gap-answer round) and `:167-170` (confirm), against `src/app/groups/[id]/GroupHome.tsx:125`
- **consequence** — Orbit's model calls are slow by nature, and the two on the
  onboarding path are the longest requests the product makes. If one of them dies
  in transit rather than coming back with an error (the hosting platform cutting
  the request off, the founder's phone dropping the connection for a second, a
  gateway timeout), the founder does not get the designed "let's try that again"
  message. The wizard is replaced by the generic broken-page screen, and because
  the founder's description, their name, and every gap answer live only in that
  screen's memory, "Try again" hands them an empty box. This is a first-run
  experience for someone who has not created anything yet, so there is nothing to
  come back to. The group chat already handles the same situation correctly,
  which is what makes this an oversight rather than a policy.
- **evidence** — `GroupHome.tsx:125` guards the trip itself, with a comment
  saying exactly why:
  ```ts
  // The action is soft on the server; this catch covers the trip
  // itself. Going offline in the beat after sending must leave the
  // message standing, not surface an error boundary.
  const result = await detectIntentAction(messageId).catch(() => null)
  ```
  The wizard's two equivalents have no such guard:
  `startMerge(async () => { const result = await mergeGapAction({...}) ... })`
  (`OnboardingWizard.tsx:119-121`) and
  `startCreate(async () => { const result = await createGroupAction({...}) ... })`
  (`:167-170`). Both server actions catch everything on the server side, so the
  only way through is a failure of the round trip itself, which is precisely what
  the chat comment describes. React 19.2 (`react@19.2.4`) surfaces a rejected
  async transition to the nearest error boundary, which here is the root
  `src/app/error.tsx`; its `reset()` remounts `OnboardingWizard`, whose
  `description`, `founderName`, `rhythms` and `gap` are all `useState` inside
  that boundary. `useActionState` on step 1 (`:64-67`) has the same exposure.
  The trigger is not hypothetical: lane 6's F-6-6 records that the Anthropic
  client is constructed with no request timeout and no retry cap, so a slow call
  outliving the platform's function budget is the expected shape of this failure.
- **How this differs from lane 6's F-6-6** — F-6-6 is about the server-side call
  having no time limit. This is about what the browser does when that call never
  comes back: a missing three-character `.catch` on the client, in the one flow
  where the state that is lost cannot be recovered from anywhere. Capping the
  timeout would make the failure rarer without changing what happens when it
  lands.
- **severity** — queue
- **confidence** — certain (that the catch is missing and that the chat path has
  one); likely (that the outcome is the root error screen) — I could not run a
  browser under this audit's rules, so React 19's exact surfacing of a rejected
  async transition is read from the version in `node_modules`, not observed.

### F-3-25: The guard that stops Orbit renaming a founder's activity mid-conversation is switched off by nothing more than the model listing the same days in a different order
- **file:line** — `src/lib/orbit/gap.ts:138-141`
- **consequence** — CLAUDE.md carries a named guardrail because this already went
  wrong once in QA: a founder said "climbing", answered one follow-up question,
  and Orbit came back calling it "CLIMB". The fix was a code guard that puts the
  founder's own word back whenever the model quietly rewrites it. That guard only
  runs when it is confident it is looking at the same rhythm, and its test for
  "same rhythm" is an exact character comparison of the day list. So a group that
  meets Mondays and Wednesdays is protected only for as long as the model keeps
  writing those two days in the same order it wrote them the first time. If it
  writes them the other way round, the guard steps aside and the drifted word
  goes through: the group's event title becomes "Climb" instead of "Climbing", on
  every card, in every calendar entry, permanently, and there is no path in the
  product for a founder to fix it afterwards. Nothing anywhere asks the model to
  keep the days in a stable order, and no test or bench can see this: the
  onboarding bench compares day lists after sorting both sides.
- **evidence** — `enforceActivityCarryOver`'s same-rhythm test:
  ```ts
  const sameSchedule =
    (o.cadence ?? null) === p.cadence &&
    JSON.stringify(o.daysOfWeek ?? null) === JSON.stringify(p.daysOfWeek)
  if (!sameSchedule) continue
  ```
  `JSON.stringify([3,1]) !== JSON.stringify([1,3])`, so a pure reorder takes the
  `continue` and the drifted activity is never restored. Nothing normalizes the
  order upstream: `normalize.ts:77-87` builds the array with
  `[...new Set(o.daysOfWeek.filter(...))]`, which preserves the model's own
  order, and `parseStoredRhythms` (`rhythm.ts:153-160`) passes it through
  untouched. The prompt's only instruction on this field is
  `- daysOfWeek: integers 0-6 with 0=Sunday, only for days the founder stated.
  Otherwise null.` (`extract.ts:64`) — no ordering rule at all. The two failure
  modes are correlated rather than independent: the merge rule the model has to
  break to drift the activity ("Copy every field the answer does not touch
  character for character", `merge.ts:35`) is the same rule it has to break to
  reorder the days, so the reorder is most likely in exactly the round where the
  guard is needed. Second-order: `enforceVenueCarryOver` runs next and only
  matches on the activity string (`gap.ts:178-179`), with a comment saying it is
  ordered second so "a drift-restored activity lets the venue guard's
  same-activity match succeed" — so the same reorder can cost a captured venue
  too. The bench is structurally blind: `sameDays` in
  `evals/onboarding/cases.ts:100-105` sorts both arrays before comparing.
- **How this differs from anything registered** — suppression item 16 is about
  group *names* and `rejectWeekdayNameOnMultiDay`. Round one's F-3-7 is about the
  group name having no carry-over guard at all. This is the opposite shape: the
  activity's guard exists, is the one CLAUDE.md holds up as the worked example,
  and has a condition on it that nothing upstream guarantees.
- **severity** — queue
- **confidence** — certain (that the comparison is order-sensitive, that nothing
  normalizes the order, and that the bench cannot see it); unsure how often the
  model actually reorders, which I could not measure without running the bench.

### F-3-26: The days a founder gave are shown back to them in whatever order the model happened to return, on the screen whose whole job is proving Orbit understood
- **file:line** — `src/lib/orbit/playback.ts:30-32`
- **consequence** — The playback card exists so a founder can check Orbit got it
  right before a group exists. Nothing sorts the days between the model and that
  card, so a founder who writes "we climb Wednesdays and Mondays" can be shown
  "Wed & Mon at 7pm, every week". It is correct and it reads like a bug, at the
  one moment the product is asking to be trusted. The same string is reused on
  the group info page and on the join screen, so it is also the first thing an
  invited stranger reads about the group. A related roughness on the same line:
  three or more days render as "Mon & Wed & Fri", which is not how the copy rule's
  own example reads and is long enough to matter on a screen whose height the
  card-region-height slice fought for.
- **evidence** — `function formatDays(days: number[]): string { return
  days.map((d) => WEEKDAY_ABBREV[d]).join(" & ") }` — map and join, no sort. The
  array arrives in the model's order (see F-3-25's evidence for the full chain:
  `normalize.ts:77-87`, `rhythm.ts:153-160`, neither sorts, and `extract.ts:64`
  gives the model no ordering rule). Four surfaces render it:
  `src/app/create/Step2Playback.tsx:214`, `src/app/create/StepGapAsk.tsx:111`,
  `src/app/groups/[id]/info/page.tsx:67`, `src/app/join/[inviteToken]/page.tsx:63`.
  Scheduling is unaffected: `computeNextOccurrence` tests membership with
  `rhythm.daysOfWeek.includes(weekday)` (`occurrence.ts:158`), which is
  order-independent, so this is display only.
- **severity** — queue
- **confidence** — certain (that nothing sorts and that all four surfaces use
  it); likely (that the model returns out-of-order days when the founder names
  them out of order) — unmeasured, and the bench sorts before comparing so it
  could never report it.

### F-3-27: The recognition bench's flagship regression case rebuilds the failure using words Orbit does not say and a sequence the product can no longer produce
- **file:line** — `evals/detect/cases.ts:99` (and `:179`, `:183`, `:214`, `:288`, `:367`)
- **consequence** — The recognition bench is the only evidence anyone has that
  Orbit understands people, and its most important case is the one that
  reproduces the 29 July bug where a direct ask got silence. That case works by
  showing the model the conversation Orbit itself just had. The conversation it
  shows is invented: Orbit's line in the fixture is not what Orbit writes, and in
  one case the exchange around it is one the product cannot produce at all any
  more. So the bench is scoring how well Orbit reads a chat that will never
  happen, and the number it prints is being read as "Orbit handles the real
  thing". Whether that makes the score too kind or too harsh cannot be known
  without running it. The same file's gauge cases quote Orbit's real copy word for
  word, so this is drift on one path rather than a decision about fixtures.
- **evidence** — Compare the fixture strings against the builders that actually
  write them:
  - `cases.ts:99` `"Done, climbing is at 9am now. Everyone's answer got cleared, so have another look when you get a sec."`
    vs `buildChangeAnnouncement` (`change-copy.ts:113`), which writes
    `` `Done. ${cap(label)} ${whenPhrase(...)} is moving to ${...}, it was ${oldTime}. Since the time changed, I cleared everyone's RSVPs, so answer again up top. Want it back at ${oldTime}? Say the word.` ``
    The real line ends with an explicit invitation to ask for a revert, which is
    exactly the context a following bare "can we move it?" would be read in.
  - `cases.ts:179` `"Sounds like you want climbing moved to 9am. Want me to make the change?"`
    vs `buildChangeQuestion` (`change-copy.ts:127`), which includes the day:
    `"Sounds like you want climbing this Sat moved to 9am. Want me to make the change?"`
  - `cases.ts:367` `"Priya wants to move climbing to 9am. Does that work?"`
    vs `buildGroupProposalQuestion` (`change-copy.ts:184`):
    `"Priya wants climbing this Sat at 9am instead of 8am. Move it?"` — a
    different sentence, and its closing question is the exact wording the
    17 Aug 2026 event-copy pass deliberately replaced ("Move it?" for
    "Works for you?"). This is the fixture for `agrees-with-live-proposal`, a
    barred must-stay-quiet case.
  - `cases.ts:183`, in `misread-correction`, is a sequence rather than a
    wording: `Sam: "yes"` followed immediately by `Orbit: "Done, climbing is at
    9am now."` on a case with `memberCount: 4`. In today's product the asker's
    confirm on a four-member group does not move anything; it opens a group vote
    (`proposal-answer.ts:104,121-136`, `consensusFloor`), so Orbit's next line
    would be the group proposal question. The fixture encodes part-one behaviour
    the consensus slice replaced.
  - `bare-ask-after-move`'s own `description` says the ask arrives "right after
    Orbit announced a consensus move", and `buildConsensusAnnouncement`
    (`change-copy.ts:201`, `"That settles it. ..."`) appears in no fixture at all.
  For contrast, the gauge-path fixtures are verbatim: `cases.ts:444`
  `"Love it. Beers this Friday? If three are in, I'll set it up."` is exactly
  `buildGaugeMessage`'s output, and `cases.ts:449`
  `"Beers didn't happen for Friday, but three of you want it. What day works better?"`
  is exactly `buildRetryAskMessage`'s. Nothing keeps either in sync: the builders
  are pure, SDK-free functions the bench already imports from
  (`evals/detect/run.ts:12-17` pulls four of them), and the history fixtures are
  hand-written strings instead.
- **How this differs from what is already recorded** — round one's F-3-2 and
  round two's F-3-20 are about what the bench *does not run* (the day-comment
  planner; any spark case at all). This is about what it *feeds in*: the cases it
  does run are handed a context the product does not generate, on the one path
  the bench exists to protect. Suppression item 15 is about one case's score, not
  about the fixtures.
- **severity** — queue
- **confidence** — certain (that the six strings differ from the builders and
  that `misread-correction`'s sequence is unreachable); unsure whether correcting
  them would move the scores, which only a bench run could answer and this audit
  is barred from running.

## Appendix, third pass (real, but no product consequence I can name)

### A-3-10: Orbit spells weekdays out in full in chat and abbreviates them on the chips and the announcement, sometimes in the same exchange
- **file:line** — `src/lib/orbit/spark-copy.ts:467` (`formatWeekdayLong` in `buildGaugeMessage`) against `:499` (`formatWeekdayShort` in `chipLabels`) and `:642` (in `buildSparkAnnouncement`)
- One gauge produces "Love it. Beers this Friday? If three are in, I'll set it
  up." with a chip under it reading "Yes, can't Fri", and later "Three of you are
  in, so beers is on for Fri at 7pm." The copy rule's stated scope is "schedule
  and rhythm copy" with card real estate as the reason, so prose in chat is
  arguably outside it and this is a taste call rather than a violation. Recorded
  because the rule also says "something Orbit follows when it generates copy",
  which reads wider than its own reason, and because someone tidying this later
  should know both forms are deliberate somewhere.
- **severity** — decline · **confidence** — certain

### A-3-11: Orbit declines a venue or day change before it checks whether the group has any plans at all
- **file:line** — `src/lib/orbit/change-plan.ts:50-55`
- Rung 1 fires on `requestedFields.some((f) => f !== "time")` ahead of rung 2's
  no-plans check, so a member of a brand-new group asking "can we do it at the
  gym instead?" is told "I can't change the spot yet, that's coming. I can move
  the time if that helps." about a plan that does not exist. It is not a lie
  (Orbit genuinely cannot change a venue) and there is no better answer to give,
  which is why this sits here rather than above; the honest `NO_PLANS_REPLY` would
  arguably read better. Only reachable on an empty calendar, which is essentially
  a brand-new group, the same rarity the owner already accepted for
  `bare-ask-no-plans` (suppression item 15).
- **severity** — decline · **confidence** — certain

### A-3-12: The which-plan question chains "or" once a group has three plans
- **file:line** — `src/lib/orbit/change-copy.ts:278-280`
- `labels.join(" or ")` gives "Which plan do you mean, climbing or beers or
  dinner?" once the carousel is showing three. Its sibling
  `buildWhichGaugeQuestion` (`spark-copy.ts:282-288`) handles exactly this with a
  comma list plus a final "or", so the good version already exists four files
  away. Three is the maximum the model is ever shown (`detect-intent.ts:90`), so
  it never gets worse than this.
- **severity** — decline · **confidence** — certain

## What I could not check (third pass)

- **Anything that needs the model.** F-3-22's refusal path, F-3-25's reorder
  frequency, F-3-26's day ordering, and whether F-3-27's corrected fixtures would
  change the bench numbers all turn on what the model actually returns. The audit
  is barred from running `eval:detect` and `eval:onboarding`, and nothing in the
  repo records these rates.
- **F-3-23's race in practice.** The window is one model call wide. I confirmed
  the guard is missing and that the snapshot is read before the call; I could not
  observe a collision without a running app.
- **F-3-24's exact browser outcome.** No dev server and no browser under this
  audit's rules. That the `.catch` is missing and that the chat path has one are
  both read off the source; React 19.2's surfacing of a rejected async transition
  to the error boundary is read from `node_modules/react/package.json` (19.2.4)
  and the documented behaviour, not observed.
- **Whether the platform's function budget actually cuts an Orbit call short.**
  No `maxDuration` is exported anywhere and `vercel.json` sets none, so the
  platform default applies; I did not want to assert a specific number for a plan
  tier I cannot see. Lane 6's F-6-6 owns that thread.
- **The suite's unhandled-error warning (round one's F-3-12).** My run of
  `npm test` on the same clean checkout printed `Test Files 92 passed (92) /
  Tests 935 passed (935)` with **no** "unhandled errors" line, where round one
  reproduced it twice. So it is intermittent rather than gone; I am recording the
  disagreement rather than overwriting round one's observation. `npx tsc --noEmit`
  is clean. `git status --porcelain` shows nothing touched outside
  `docs/audits/findings/`.

## Coverage (third pass)

Read in full this pass:
- `docs/build-notes.md` §"Where Orbit decides to speak or stay quiet" (lines
  195-330, the whole section including both dated postscripts)
- `src/lib/orbit/spark.ts`, `spark-copy.ts`, `change-copy.ts`, `change-plan.ts`,
  `day-comment-plan.ts`, `endgame.ts`, `extract.ts`, `merge.ts`, `gap.ts`,
  `normalize.ts`, `occurrence.ts` (the `computeNextOccurrence` half),
  `playback.ts`, `announce.ts`, `reconcile.ts`, `rhythm.ts`, `window.ts`,
  `fetch-window.ts`, `model-errors.ts`, `unavailable-copy.ts`
- `src/app/actions/detect-intent.ts`, `extract-group.ts`, `merge-gap.ts`,
  `send-message.ts`, `proposal-answer.ts` (not read by rounds one or two)
- `src/lib/gauges/open-ask.ts`, `day-comment.ts`, `read.ts`, `vote.ts`,
  `threshold.ts`, `promote.ts`, `create.ts`
- `src/lib/proposals/endgame.ts`, `src/lib/messages/create.ts`
- `src/app/api/cron/orbit/route.ts`, `src/app/error.tsx`
- `evals/detect/run.ts`, `evals/onboarding/run.ts`, `scripts/eval-detect.ts`
- `evals/detect/cases.ts` (header and type block in full; every Orbit history
  line in every case enumerated and compared against its builder, which is what
  produced F-3-27), `evals/onboarding/cases.ts` (header, `toOutcome`, every
  assertion builder and predicate in full; the case bodies skimmed by id)
- `next.config.ts`, `vercel.json`, `node_modules/@anthropic-ai/sdk/client.js`
  (the defaults only)

Read in part, for one question only:
- `src/app/create/OnboardingWizard.tsx` (lines 40-175, the three action call
  sites), `src/app/groups/[id]/GroupHome.tsx` (the send-then-detect transition),
  `src/app/groups/[id]/page.tsx` (the gauge tally composition),
  `src/lib/pending/derive.ts` (the card tally's member filter),
  `prisma/schema.prisma` (the `Message.body` column type)

Not read, deliberately:
- `src/lib/orbit/__tests__/**` and the other test directories — lane 5 owns them,
  and reading them tells you what the code is believed to do rather than what it
  does.
- `src/app/actions/rsvp.ts`, `leave-group.ts`, `remove-member.ts`,
  `reset-invite-link.ts`, `gauge-vote.ts`, `proposal-vote.ts`, `join-group.ts`,
  `create-group.ts` — read by rounds one and two; I re-read only the parts that
  bore on a thread I was following.

Verification run this pass: `npx tsc --noEmit` → clean, exit 0. `npm test` →
92 files, 935 tests, all passing (see the note above about the missing
unhandled-error warning). Neither eval bench was run. No dev server, no
migration, no seed script, no file written outside `docs/audits/findings/`.
