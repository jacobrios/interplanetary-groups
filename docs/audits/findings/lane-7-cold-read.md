# Lane 7: What does an engineer think reading this cold?

*Read-only pass, 22 Aug 2026. Evidence commands run: `npx tsc --noEmit` (clean, exit 0),
`npm test` (92 files, 935 tests, all passing, 70s), `npm run lint` (exit 1, 15 errors,
28 warnings).*

## Coverage

**Read in full**

- `README.md`, `AGENTS.md`, `CLAUDE.md`, `.env.example`, `.gitignore`
- `package.json`, `vercel.json`, `vitest.config.ts`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`
- `docs/audits/findings/_brief.md`, `docs/audits/findings/file-ledger.txt`
- `scripts/` — every file's header block (all 20); full or near-full reads of
  `scripts/db-which.ts`, `scripts/qa-sweep.ts`, `scripts/try-extract.ts`, `scripts/try-merge.ts`,
  `scripts/qa-protect-paths.sh`, `scripts/qa-test-hooks.sh`, and the staging and output
  sections of `scripts/qa-stage-pending.ts` and `scripts/qa-stage-groupinfo.ts`
- `src/components/PageHeader.tsx`, `src/components/ShareInviteLink.tsx`,
  `src/app/create/Step3Share.tsx`, `src/lib/events/format.ts`, `src/lib/gauges/threshold.ts`,
  `src/lib/orbit/fetch-window.ts`, `src/lib/orbit/unavailable-copy.ts`, `src/proxy.ts`
- `docs/build-notes.md` §8 (lines 145-165), "Where Orbit decides to speak or stay quiet"
  (lines 200-270), and the "Before first Vercel deploy" checklist (lines 338-420)
- `prisma/migrations/` directory listing against the checklist

**Read in part, targeted at a claim**

- `src/lib/orbit/spark-copy.ts` (lines 1-60, 120-150, 440-460, 495-520),
  `src/lib/orbit/playback.ts` (1-60), `src/lib/orbit/model-errors.ts` (1-50),
  `src/lib/orbit/change-plan.ts` (exports and every return),
  `src/app/actions/detect-intent.ts` (lines 205-220, 305-320, plus every `"quiet"` site),
  `src/app/groups/[id]/GaugeChips.tsx` (40-95), `src/lib/supabase/proxy-session.ts` (1-30)
- `evals/detect/cases.ts` and `evals/onboarding/cases.ts` (case ids and bucket counts only)

**Read structurally, not line by line** — the whole `src/` tree (full file listing plus
automated scans over every non-test file for: exported symbols with no importer, components
with no render site, props no caller passes, header comments, file sizes, `console.*`,
`TODO`/`FIXME`/`@ts-ignore`, commented-out code, duplicated idioms, and hardcoded constants).

**Assigned but not read**

- `docs/build-notes.md` in full (603 KB). I read the three sections the lane needed and
  spot-checked claims by grep. Reading it whole was not a good use of this pass.
- The 41 slice plans and specs under `docs/superpowers/`. I opened
  `2026-08-10-pending-surface.md` at the one line that mattered (F-7-9) and left the rest.
- The bodies of the design handoff assets under `docs/design/` (CSS, HTML, JSX). I compared
  them by checksum and line count rather than by content.
- `docs/walkthrough.html` (1.7 MB). CLAUDE.md forbids grepping it and rendering it was out of
  scope for a read-only pass.
- The 92 test files' bodies. I ran the suite and inspected only the four test files implicated
  in F-7-11.

**Note on the lane brief's own count**: it says `scripts/` holds "17 slice-specific QA
stagers". It holds 10 (`qa-stage-*.ts`), plus `demo-stage.ts`, `qa-sweep.ts`, two `.sh` hook
QA scripts, two `try-*` prompt harnesses, two eval runners, and `db-which.ts` with its test:
20 files, 3,401 lines.

## Findings

### F-7-1: `npm run lint`, the command the README tells a stranger to run, fails

- **file:line** — `README.md:133` (`npm run lint`), `eslint.config.mjs:9-15` (ignore list),
  `docs/design/joining-arc-handoff/design-canvas.jsx`, `docs/design/group-info-handoff/design-canvas.jsx`,
  `docs/design/joining-arc-handoff/walkthrough-frames-1.jsx`
- **consequence** — The repo exists to be read by engineers evaluating the work. The README
  hands them two commands to run. One of them exits with an error, and 13 of the 15 errors
  come from design-handoff files that were never this project's code. The first impression
  is a project whose own quality gate is red.
- **evidence** — `npm run lint` exits 1. Error distribution:
  `4 docs/design/group-info-handoff/design-canvas.jsx`,
  `4 docs/design/joining-arc-handoff/design-canvas.jsx`,
  `5 docs/design/joining-arc-handoff/walkthrough-frames-1.jsx`,
  `1 src/app/create/OnboardingWizard.tsx`, `1 src/app/groups/[id]/info/ResetInviteLink.tsx`.
  `eslint.config.mjs` ignores only `.next/**`, `out/**`, `build/**`, `next-env.d.ts`; nothing
  excludes `docs/`. The design files are vendor handoff artifacts (`docs/design/.../design-canvas.jsx`
  is Claude Design's canvas editor, not product code).
- **severity** — queue
- **confidence** — certain

### F-7-2: Two genuine lint errors in product source

- **file:line** — `src/app/create/OnboardingWizard.tsx:58`, `src/app/groups/[id]/info/ResetInviteLink.tsx:71`
- **consequence** — Two real code-quality errors an engineer reviewing the repo would see
  flagged by the project's own tooling. Neither breaks the product today. The unescaped
  apostrophe is cosmetic; the setState-in-effect is a React pattern the current version's
  rules call out.
- **evidence** — `OnboardingWizard.tsx:58` `setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null)`
  inside `useEffect` → `react-hooks/set-state-in-effect`.
  `ResetInviteLink.tsx:71` unescaped `'` → `react/no-unescaped-entities`.
- **severity** — queue
- **confidence** — certain

### F-7-3: README's test numbers are stale by 80 percent

- **file:line** — `README.md:111`
- **consequence** — The README tells a reviewing engineer "517 tests across 38 files." The
  suite is actually 935 tests across 92 files. It understates the work by nearly half, and a
  number that specific and that wrong invites doubt about every other number in the document.
- **evidence** — `README.md:111`: "517 tests across 38 files, covering the normalization
  boundary…". `npm test` output: `Test Files 92 passed (92) / Tests 935 passed (935)`.
- **severity** — queue
- **confidence** — certain

### F-7-4: README calls the recurring-event cron "daily"; it runs hourly

- **file:line** — `README.md:80` and `README.md:107`, against `vercel.json:6`
- **consequence** — A stranger reading the README gets the wrong operating picture of the one
  scheduled job in the product, and the same wrong figure appears twice, so it reads as
  deliberate rather than a slip.
- **evidence** — `README.md:80` "A daily scheduled job that creates the next recurring
  occurrence"; `README.md:107` "Vercel, with a daily cron for the recurring-event job".
  `vercel.json`: `"schedule": "0 * * * *"` (hourly). CLAUDE.md agrees with the code:
  "an hourly Vercel cron". A third copy of the same wrong word sits in `.env.example:22`:
  "Shared secret for the daily scheduled job."
- **severity** — queue
- **confidence** — certain

### F-7-5: The README's "Where it stands" is 18 shipped slices out of date

- **file:line** — `README.md:82-84` ("Next up"), `README.md:90` ("visual polish pass is pending")
- **consequence** — The one document a stranger reads first tells them the product's next
  piece of work is something that shipped 18 days ago, and that the app still looks like an
  unstyled prototype. It undersells three completed polish slices and the whole event/idea
  card system. For a repo whose purpose is to demonstrate the work, the README is arguing
  against the code.
- **evidence** — `README.md:82-84`: "**Next up** — The one-bump resurface: a stalled but
  still viable idea earns exactly one nudge, then dies quietly." That shipped in the
  gauge-endgame slice, 4 Aug 2026 (CLAUDE.md: "A gauge still short of three yeses gets
  exactly one bump around 8pm the evening before its day"). `README.md:90`: "A visual polish
  pass is pending, and some scaffolding defaults from project creation are still in place."
  Polish slices one, two and three all landed (11-12, 18-19 and 21 Aug); CLAUDE.md records
  "the visual-polish pass is complete" and the scaffolding defaults "Both closed 11 Aug 2026".
  `git log -1 -- README.md` returns `77d0148` (PR #59, 11 Aug); 18 PRs have merged since.
- **severity** — queue
- **confidence** — certain

### F-7-6: A QA staging script still walks the reader through a UI that was deleted

- **file:line** — `scripts/qa-stage-pending.ts:116` and `:239`
- **consequence** — A staging script prints step-by-step instructions ending in "The strip
  should read '2 waiting on you · 1 you're in on'". The strip was removed from the product on
  12 Aug. Anyone who runs it (the owner in a future QA pass, or an engineer exploring the
  repo) is told to look for something that cannot appear, and will reasonably conclude the
  app is broken.
- **evidence** — `scripts/qa-stage-pending.ts:116`: `next: "Reload the group home. The strip
  should now read 2 waiting on you · 1 you're in on."`; `:239`: `"Load homeUrl. The strip
  should read \"2 waiting on you · 1 you're in on\"."`; header comment line 5: "then stages
  every piece the strip needs to prove itself". CLAUDE.md: "Unanswered ideas are cards now,
  and the pending strip is gone. The strip, its panel, and its wash retired 12 Aug 2026."
  The script was last committed 20 Aug (`3c260a2`), so it was touched after the removal and
  the instructions were not revisited.
- **severity** — queue
- **confidence** — certain

### F-7-7: The rule for how Orbit names a plan out loud is written inline in five places

- **file:line** — `src/lib/proposals/endgame.ts:160`, `src/lib/proposals/promote.ts:75`,
  `src/app/actions/proposal-answer.ts:100`, `src/app/actions/detect-intent.ts:120`,
  `src/app/actions/detect-intent.ts:297`
- **consequence** — "What does Orbit call this plan when it speaks?" is a copy decision the
  owner has already changed once this month (event titles stopped naming weekdays, 20 Aug).
  It is currently re-typed at five separate places rather than living in one. The next time
  that decision moves, four of the five have to be found by memory; whichever is missed
  leaves Orbit calling the same plan two different things in the same feed.
- **evidence** — The identical expression `proposal.event.activityLabel ?? proposal.event.title.toLowerCase()`
  appears at `proposals/endgame.ts:160`, `proposals/promote.ts:75`, `actions/proposal-answer.ts:100`;
  `e.activityLabel ?? e.title.toLowerCase()` at `actions/detect-intent.ts:297`; and
  `p.event.activityLabel ?? p.event.title.toLowerCase()` at `actions/detect-intent.ts:120`.
  `scripts/qa-stage-endgame-proposal.ts` even documents it as "the established label idiom
  (activityLabel ?? title.toLowerCase())", so the idiom is recognised as a rule but has no
  home. No shared helper exists: `grep -rn "activityLabel" src` returns only these five call
  sites plus the write in `lib/events/create.ts:48`.
- **severity** — queue
- **confidence** — certain

### F-7-8: The same "turn an hour into 8pm" rule is implemented three times

- **file:line** — `src/lib/events/format.ts:77` (`formatTime`),
  `src/lib/orbit/playback.ts:23` (`formatTimeLocal`),
  `src/lib/orbit/spark-copy.ts:133` (`formatTimeLocalLabel`)
- **consequence** — Every time in the product is written by one of three separate copies of
  the same rule. They agree today. Any future change to how times read (a 24-hour setting, a
  ".30" style, non-English) has to land in all three or the onboarding playback, the group
  chat, and the event card start disagreeing about the same time, which is exactly the kind
  of small wrongness that makes people stop trusting a scheduling app.
- **evidence** — `playback.ts:19-21` says so in its own comment: "Mirrors the hour/minute
  logic of formatTime in src/lib/events/format.ts but takes a wall-clock 'HH:mm' string
  instead of a UTC Date." `spark-copy.ts:133` is a third copy and no comment connects it to
  either. The bodies are the same arithmetic:
  `playback.ts:25-26` `const ampm = h < 12 ? "am" : "pm"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h`;
  `spark-copy.ts:135-136` `const suffix = h < 12 ? "am" : "pm"; const h12 = h % 12 === 0 ? 12 : h % 12`;
  `format.ts:80-82` `const ampm = h < 12 ? "am" : "pm"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h`.
  I checked every hour 0-23 by hand against the two variants and they agree, so this is a
  drift risk, not a present bug. A shared "format an (hour, minute) pair" primitive with the
  two thin wrappers over it would remove it.
- **severity** — queue
- **confidence** — certain

### F-7-9: Four of the ten QA staging scripts have no database guard at all, and one of them was written after the plan explicitly asked for one

- **file:line** — `scripts/qa-stage-answer.ts` (no guard; writes at 9 call sites),
  `scripts/qa-stage-endgame.ts:17-19` (comment admits it), `scripts/qa-stage-pending.ts`,
  `scripts/qa-stage-retry.ts`
- **consequence** — "Two databases, never crossed" is the one rule this project says is
  unrecoverable if broken. Six staging scripts refuse to run unless the environment is
  confirmed as dev-test. Four of them do not check at all, and will write fabricated members,
  fake chat messages and fake events into whatever database `.env` happens to point at. The
  only thing standing between a mistyped `.env` and invented people appearing inside a real
  group's chat is the owner remembering to run a separate command first. Today production
  does not exist, so nothing is lost yet; the moment it does, this is a way to corrupt live
  user data by muscle memory.
- **evidence** — `scripts/qa-stage-endgame.ts:17-19` states it plainly: "WHERE IT WRITES:
  whichever database `.env` points at. Run `npm run db:which` first, every time; this script
  has no idea which project it is talking to and will happily write to production if that is
  what `.env` says." `grep -c "requireDevTest"` returns 0 for `qa-stage-answer.ts`,
  `qa-stage-endgame.ts`, `qa-stage-pending.ts`, `qa-stage-retry.ts`, and 4-5 for
  `qa-stage-cardstate.ts`, `qa-stage-daycomment.ts`, `qa-stage-endgame-proposal.ts`,
  `qa-stage-groupinfo.ts`, `qa-stage-ics.ts`, `qa-stage-polish.ts`, `demo-stage.ts`,
  `qa-sweep.ts`. `qa-stage-pending.ts` is the sharpest case: its own plan,
  `docs/superpowers/plans/2026-08-10-pending-surface.md:690`, says "Guard: the script must
  call the same db guard the existing staging scripts use (see how `qa-stage-answer.ts`
  protects itself…)" — and `qa-stage-answer.ts` has no guard either, so the instruction to
  copy the model copied nothing.
- **severity** — fix-now
- **confidence** — certain

### F-7-10: The dev-test guard is copy-pasted into eight files, project ref and all

- **file:line** — `scripts/db-which.ts:21` (the definition that is not exported), and the
  eight redeclarations: `scripts/qa-sweep.ts:24`, `scripts/qa-stage-ics.ts:32`,
  `scripts/qa-stage-endgame-proposal.ts:48`, `scripts/demo-stage.ts:64`,
  `scripts/qa-stage-cardstate.ts:75`, `scripts/qa-stage-daycomment.ts:82`,
  `scripts/qa-stage-polish.ts:93`, `scripts/qa-stage-groupinfo.ts:58`
- **consequence** — The safety check for the project's one unrecoverable rule exists as nine
  separate copies of the same twelve lines and the same hard-coded database identifier.
  Changing dev databases means finding and editing nine files; missing one leaves a script
  that refuses to run for the wrong reason or, worse, is edited into checking the wrong
  thing. It is also what made F-7-9 possible: because there is nothing to import, adding the
  guard to a new script is a copy-paste that is easy to skip and invisible when skipped.
- **evidence** — `scripts/db-which.ts:21` `const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"`
  is module-private; only `judge`, `extractSupabaseRef`, `extractPoolerRef` and `Verdict` are
  exported (`grep -n "^export" scripts/db-which.ts`). Every consumer therefore redeclares
  both the constant and an identical `function requireDevTest(): void { const verdict =
  judge(process.env, EXPECTED_DEV_TEST_REF); if (verdict.ok) return; … process.exit(1) }`
  (`grep -n "function requireDevTest" scripts/*.ts` → 8 hits). Exporting a single
  `requireDevTest()` from `db-which.ts` collapses all nine and makes the guard one import.
- **severity** — queue
- **confidence** — certain

### F-7-11: A callback prop left behind by the deleted pending panel, kept alive only by its own tests

- **file:line** — `src/app/groups/[id]/GaugeChips.tsx:52` and `:80`,
  `src/app/groups/[id]/GroupProposalChips.tsx:39` and `:71`
- **consequence** — Two of the product's vote controls carry a hook for telling their parent
  screen that a vote landed. No screen uses it; the only things that pass it are the
  components' own tests. So four test assertions read as proof that chip voting works when
  what they actually prove is that an unused hook fires. A reviewer counting test coverage
  gets a slightly inflated number, and a future engineer sees an extension point that has
  never been exercised in the real app.
- **evidence** — `grep -rn "onAnswered" src` returns the two declarations, the two internal
  calls (`GaugeChips.tsx:80` `onAnswered?.(next)`, `GroupProposalChips.tsx:71` same), and
  eight lines inside `__tests__/GaugeChips.test.tsx` and `__tests__/GroupProposalChips.test.tsx`.
  No production caller passes it: `IdeaCard.tsx:83` renders
  `<GaugeChips gauge={item.chips} indentPastAvatar={false} rowMargin="11px 0 0" />` and
  `ProposalSection.tsx:50` renders `<GroupProposalChips proposal={band.chips} rowMargin="10px 0 0" />`.
  The history explains it: the prop arrived in `f98d7ef` "Let chip rows report a settled
  answer to whoever rendered them", was consumed by `54e6d17` "Build the pending strip and
  panel over the feed's own chips", and its consumer was deleted in `5b9de21` (the
  card-state-grammar slice, 12 Aug) which retired the strip and panel. The prop was not
  removed with them. Its two sibling props, `indentPastAvatar` and `rowMargin`, ARE still
  passed, so this is one orphan and not three.
- **severity** — queue
- **confidence** — certain

### F-7-12: CLAUDE.md states a bench reading as "current" that its own later paragraph contradicts

- **file:line** — `CLAUDE.md:31` against `CLAUDE.md:59`
- **consequence** — CLAUDE.md loads at the start of every session, so a wrong number in it is
  believed by every future session and by the owner. It currently states two different
  answers to "how many cases must Orbit recognize, and what do they score," one of them
  labelled "current." The next person to run the bench will read a pass as a regression or a
  regression as a pass.
- **evidence** — `CLAUDE.md:31`: "the current full-bench reading is 80/80 runs on the sixteen
  cases Orbit must recognize, 65/65 on the thirteen it must stay quiet about, and 10/20 on
  the four deliberately ambiguous ones". `CLAUDE.md:59` (19 Aug): "The case moved to a new
  fourth bench bucket, `accepted` … so `must-recognize` reads 75/75". The code agrees with
  line 59: `grep -oE 'bucket: "[^"]+"' evals/detect/cases.ts | sort | uniq -c` gives
  `15 must-recognize`, `13 must-stay-quiet`, `4 ambiguous`, `1 accepted` (33 total). Line 31
  was never amended when the case moved out of the bucket.
- **severity** — queue
- **confidence** — certain

### F-7-13: Neither README.md nor CLAUDE.md mentions `scripts/` at all

- **file:line** — `README.md:138-144` ("Where the thinking lives", which points at CLAUDE.md,
  build-notes and `docs/superpowers/` and never at `scripts/`); `package.json:5-13` (5 of 20
  wired); no occurrence of the string `scripts/` anywhere in `README.md` or `CLAUDE.md`
- **consequence** — `scripts/` is 20 files and about 3,400 lines, roughly a fifth of the
  hand-written code in the repo, and neither document a stranger is pointed at says what it
  is. Ten of the files are named `qa-stage-*`, look interchangeable from the outside, and
  each stages a different slice's walkthrough. An engineer evaluating the repo either skips
  the folder or spends real time working out what it is for, and in a repo whose whole
  argument is process rigour, an undocumented fifth of it is the wrong impression to leave.
- **evidence** — `grep -n "scripts/" README.md` returns nothing; the same grep on `CLAUDE.md`
  returns nothing. `package.json` wires up only 5 of the 20 (`db:which`, `eval:detect`,
  `eval:onboarding`, `qa:stage-cardstate`, `qa:sweep`); the other nine staging scripts are
  invoked as bare `npx tsx --env-file=.env scripts/…` lines buried in each file's own header.
  There is no `scripts/README.md`. The individual file headers are genuinely excellent, which
  is what makes the missing index the whole of the gap: the material exists, nothing points
  at it.
- **severity** — queue
- **confidence** — certain

### F-7-14: The pre-deploy checklist names four migrations by hand and silently skips five, including the whole spark feature

- **file:line** — `docs/build-notes.md:338-415` (the "Before first Vercel deploy" block);
  specifically item 5 at `:361` and items 7, 8, 10, 11 at `:369`, `:372`, `:400`, `:406`
- **consequence** — The deploy checklist is the document that stands between this build and a
  live database. From item 7 onward it adopts a convention of one item per new migration,
  which makes it read as complete. It is not: five database changes have no item, and they
  include the tables behind interest gauges, event creation from an idea, and time-change
  proposals, which is the product's headline behavior. A deployer working the list item by
  item would ship a database in which nobody can float an idea.
- **evidence** — `prisma/migrations/` holds 14 migrations. The checklist names
  `add_group_description` "and everything before it" (item 5, a snapshot dated to when the
  item was written), then names `20260804190626_wrong_day_retry_markers` (7),
  `20260810204408_gauge_day_suggestion` (8), `20260811150701_add_system_message_author` (10)
  and `20260818190840_proposal_lapsed_answer` (11). Unnamed anywhere in the block:
  `20260723232850_add_spark_gauge`, `20260724232540_spark_event_creation`,
  `20260728032447_change_request_time`, `20260728234513_change_request_consensus`,
  `20260804145211_gauge_endgame_markers`. Mitigation, stated honestly: the ordinary command
  `npx prisma migrate deploy` applies every pending migration at once, so anyone using the
  standard path is safe; the exposure is only for someone treating the numbered list as the
  procedure, which is exactly what the list's later convention invites. This is not the
  suppressed "an item on the checklist is not done yet" — it is the checklist missing items.
- **severity** — fix-now
- **confidence** — certain

### F-7-15: A dead branch the codebase already knows about, kept alive by its own type

- **file:line** — `src/lib/orbit/change-plan.ts:32` (the union member),
  `src/app/actions/detect-intent.ts:315` (the branch it feeds)
- **consequence** — There is one line in the message-handling path that can never run. It
  costs nothing today. What it costs is trust: it is exactly the kind of thing a reviewing
  engineer notices, and the honest reading is "somebody removed a behavior and left half of
  it behind." The project already found it, wrote it down, and moved on without a ticket, so
  it is also evidence that a finding recorded in the 600 KB decision record does not
  reliably turn into work.
- **evidence** — `change-plan.ts:31-32` declares `export type ChangePlan = … | { action: "quiet" }`.
  `planChange` is the type's only producer (`grep -n "^export" src/lib/orbit/change-plan.ts`
  returns only `ChangeTarget`, `ChangePlan`, `planChange`), and none of its nine returns is
  `quiet`: they are at `:51`, `:64` `{ action: "reply", body: NO_PLANS_REPLY }`, `:65`, `:72`,
  `:85`, `:88`, `:93`, `:103`, `:111`. No test constructs one either
  (`grep -rn "quiet" src/lib/orbit/__tests__/change-plan.test.ts` → nothing). So
  `detect-intent.ts:315` `if (plan.action === "quiet") return { status: "quiet" }` cannot fire.
  Build-notes states this already, at the "Where Orbit decides to speak or stay quiet"
  section (`docs/build-notes.md:227`): "The `{ action: \"quiet\" }` variant is still declared
  in its type union and is constructed nowhere in `src/`; it is part-one residue, and the
  branch that handles it in `detect-intent.ts` is dead." Note the mechanism that hides it:
  because the union member exists, TypeScript believes the branch is reachable and
  `npx tsc --noEmit` is clean. Deleting the union member would make the compiler point at
  the dead line. NOT the same as `day-comment-plan.ts`'s own `action: "quiet"`, which is a
  different type, is genuinely constructed at `:50`, `:58`, `:71`, and whose branch at
  `detect-intent.ts:215` is live.
- **severity** — queue
- **confidence** — certain

## Appendix (real, but no product consequence)

### A-7-1: `spark-copy.ts` is 663 lines and its name understates half of what it holds

`src/lib/orbit/spark-copy.ts` is the largest file in `src/`. Alongside copy it owns date
arithmetic (`chooseProposedDate:185`, `chooseRetryGuessDate:218`, `localWeekday:225`,
`startOfLocalDay:660`, `sparkStartInstant:122`), the live-window rules, the time-resolution
fallbacks (`resolveSparkTime:72`, `resolveAnswerTime:344`), and the product's central number,
`SPARK_THRESHOLD = 3` at `:447`. An engineer looking for "where is the three-yes rule" would
try `gauges/threshold.ts` and find only a re-export (`threshold.ts:14`). The placement is
deliberate and documented (`threshold.ts:8-9`: "The number itself lives in spark-copy.ts
beside the copy that counts down to it"), and one half of that reason weakened on 17 Aug when
the chat tally lost its countdown, though the idea card kept one. Nothing is wrong today.

### A-7-2: The invite URL is assembled in two places

`src/components/ShareInviteLink.tsx:22` builds `${window.location.origin}/join/${inviteToken}`
for the share payload; `src/app/create/Step3Share.tsx:30-33` builds the same string again for
the visible pill directly above that button. If the join route ever moves, the displayed link
and the shared link can disagree. Both are three lines apart on the same screen, so the
failure would be caught immediately.

### A-7-3: Seven byte-identical copies of `walkthrough.css` are committed

`find docs/design -name walkthrough.css` returns seven files; `md5` shows all seven are the
same 698-line file (`217959c5…`). Four of five `round4-base.css` copies are likewise
identical. Roughly thirty comments in `src/` cite "walkthrough.css line NNN" without a
directory, which is unambiguous today only because the copies match. I checked this
specifically because it looked like a real ambiguity and it is not, yet. The next handoff
round that edits one copy makes every bare citation ambiguous, and CLAUDE.md's "rd-2 is the
build source" line is the only thing that would resolve it.

### A-7-4: `npm run lint` reports 28 warnings alongside its 15 errors

Mostly `_args`-style unused parameters in component tests (nine files) and unused test
fixtures (`src/lib/orbit/__tests__/spark.test.ts:21`, `:763`,
`src/lib/groups/__tests__/remove-member.test.ts:100`,
`src/lib/events/__tests__/rsvp.test.ts:60`). Two are in production files:
`src/lib/orbit/announce.ts:9` imports an unused `GroupRhythm`, and `src/lib/prisma.ts:5`
carries an `eslint-disable` directive that no longer suppresses anything. All harmless; they
are noise that makes the two real errors in F-7-2 harder to see.

### A-7-5: Thirteen source files lack the header comment every other file has

`src/proxy.ts`, `src/app/layout.tsx`, `src/lib/prisma.ts`, `src/lib/auth/current-user.ts`,
the three Supabase modules, and the six leave/remove/reset files from the group-info slice.
The repo's own convention is a paragraph at the top explaining what a file is for and why,
and it is one of the strongest things about reading this codebase. `src/proxy.ts` is the
sharpest omission: it is Next 16's renamed middleware, the one filename in `src/` whose
purpose is not guessable from its name, and it is the one with no explanation.

### A-7-6: `scripts/qa-protect-paths.sh` is a one-off historical demo kept as a permanent script

It reconstructs a hook from a pinned commit (`scripts/qa-protect-paths.sh:18`,
`BEFORE_REF="73ee046"`, which I confirmed still resolves) to prove that one fix, merged in
PR #44 on 3 Aug, changed behavior. It works and is well argued, but its meaning is entirely
historical: nothing it checks can regress, since the "before" side is frozen. A stranger
reading `scripts/` meets it with no context. Recommend keeping it but saying so at the top of
whatever `scripts/README.md` answers F-7-13.

### A-7-7: AGENTS.md is 327 bytes and says nothing about this project

It carries only the generic "This is NOT the Next.js you know" block, unchanged since the
Create Next App commit (`git log -1 -- AGENTS.md` → `5a44ab2`). For a repo where CLAUDE.md is
81 KB of standing context, a non-Claude agent or a human who opens AGENTS.md first learns
nothing about the two-database rule, the normalize boundary, or where the decisions live. One
line pointing at CLAUDE.md would close it.

### A-7-8: The README's setup steps run a migration without mentioning the two-database rule

`README.md:122` tells a newcomer to run `npx prisma migrate deploy`. CLAUDE.md calls
`npm run db:which` "the sanctioned path" and says to run it "before any migration or seed".
The README never mentions it. For a stranger with their own database this is harmless; it
matters only because the README is also the owner's own quick reference.

## What I could not check

- **Whether `next build` fails on the 15 ESLint errors.** Next 16 changed when lint runs
  during a build, and running `npm run build` was outside the commands this audit allows. If
  it does gate the build, F-7-1 is a deploy blocker rather than a presentation problem. Worth
  one command at the deploy moment.
- **Whether the ten QA staging scripts actually produce the states their headers describe.**
  They write to a database; I did not run any of them. Everything I say about them comes from
  reading their code and comparing it against the current product. `qa-stage-pending.ts`
  (F-7-6) is the one I am confident is wrong, because the UI it instructs you to look at no
  longer exists in `src/`.
- **The two eval benches' actual scores.** I read the case files and counted buckets, which is
  what F-7-12 rests on. I did not run `eval:detect` or `eval:onboarding`, per the brief.
- **Anything in `docs/walkthrough.html`.** CLAUDE.md forbids grepping it and I did not render
  it, so I make no claim about mockup copy.
- **Whether removing `{ action: "quiet" }` from `ChangePlan` (F-7-15) is safe.** I confirmed
  nothing in `src/` or the tests constructs it. I did not attempt the deletion, so I have not
  proved the compiler stays clean afterwards.
