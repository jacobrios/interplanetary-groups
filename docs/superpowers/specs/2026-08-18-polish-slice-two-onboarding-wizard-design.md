# Polish slice two: the onboarding wizard

**Date:** 18 Aug 2026 · **Branch:** `polish-slice-two-onboarding-wizard`

---

## Front section (for the owner)

**Settled, do not relitigate:**
- The build source is the onboarding section of `docs/design/design-polish-rd-2/walkthrough.css` (lines 93-206 plus the override passes from line 530 on). The rd-2 README scoped round 2 to the group home, but the stylesheet it carries holds the wizard's real CSS, and it covers every wizard screen including step 3.
- The loading state (OrbitPause) was never drawn by any designer. Ruled 18 Aug 2026: keep its current shape (Orbit mark plus one quiet status line), tune spacing and text style only. No spinner, no animation.
- The share button's new 46px teal pill shape updates everywhere the shared component appears, including the group info page. No fork.
- The model-eval bench trigger ("first task of whichever slice next touches onboarding") does not fire: this slice touches no prompt, no model, no logic. Benches stay queued. Accepted deviation from the literal wording, owner's call 18 Aug 2026.

**Not in this slice:** remaining screens and the real-phone Safari pass (slice three); copy changes (none anywhere); Orbit behavior or model changes (none); the founder-fix-details gap (queued post-MVP).

**Verification:** each wizard screen rendered in the browser beside walkthrough reference screens 01-04, screenshots shared; the group info page checked for the pill; a real-phone LAN pass before the QA script; suite baseline recorded below, before and after in the PR.

**Expected debt:** none opened. Two recorded debts close: the wizard's two bubble grammars, and the untokenized error red.

**Test-suite baseline at slice start:** recorded in this file's postscript before any code lands, cross-checked against the polish-slice-one finishing number in build-notes §11.

---

## Task-by-task detail (for executing agents)

General rules binding every task:

- The build source is `docs/design/design-polish-rd-2/walkthrough.css`. The onboarding rules live at lines 93-206; later override passes (lines 530-698) supersede earlier values, so always check for a later override of any selector before porting a value. Where this document quotes a value, the stylesheet wins if they disagree; flag the disagreement in the task report rather than silently picking one.
- `docs/design/walkthrough-screens/screens-01-02.png` and `screens-03-04.png` are reference for eyeball comparison only, never a source of values. A difference between the rendered screen and a PNG is a question to raise, not a defect to fix.
- The codebase styles components with inline style objects reading CSS custom properties from `src/app/globals.css` (the pattern polish slice one set). Follow it. Two exceptions already exist in the stylesheet for pseudo-elements (`.scrollbar-hidden`, `::placeholder`); add a stylesheet rule only when a style object genuinely cannot express the rule, and say so in the task report.
- The handoff CSS names some tokens that do not exist in `globals.css` (notably `--ink-faint`, `--ink-soft`, `--border`). Map them to the existing tokens (`--text-faint`, `--text-secondary`, `--hairline`); never add a duplicate token.
- No animation anywhere in this slice (rd-2 README rule, carried forward). The one existing in-flight treatment (`opacity` change on the confirm while creating) stays as-is.
- No copy changes. If a designed frame and the shipped copy disagree, keep the shipped copy and flag it.
- Component tests exist for shared components. When a task changes a shared component's rendered structure or accessible content, update its tests honestly (test first where a behavior changes, per TDD skill); style-value-only changes need no new tests.

### Task 1: Tokenize the error red

- Add an error-color token to `src/app/globals.css` alongside the other color tokens, value `#f87171`, named consistently with the existing token voice (recommend `--danger`).
- Replace the hardcoded `#f87171` in `src/app/create/Step2Playback.tsx` and `src/app/create/StepGapAsk.tsx` with the token.
- Grep the repo for other `#f87171` occurrences. Do not change files outside the wizard; list any found in the task report so the debt line in build-notes §8 can be updated to name exactly what remains.

### Task 2: Move StepGapAsk and Step2Playback onto the shared OrbitBubble

- Both files currently hand-build bubbles with the old top-left notch (`borderRadius: "4px 16px 16px 16px"`, no border). Replace with `src/components/OrbitBubble.tsx` (bottom-left notch `16px 16px 16px 5px`, hairline border, 12px 14px padding, 9px gap, 93% max width, avatar bottom-aligned), the same way `Step3Share.tsx` already uses it.
- The playback card and the gap question are dialogue (the founder's next action answers Orbit), so bubbles are correct here per the bubbles-for-dialogue rule; do not convert anything to the note treatment.
- In Step2Playback the schedule rows currently sit inside the bubble. Task 4 moves them onto their own card; coordinate so the bubble here carries only Orbit's spoken line(s). Sequence: this task lands the bubble swap, task 4 restructures the card. If one agent takes both, still verify each separately.
- This closes the "two bubble grammars" debt recorded in build-notes §11 (polish slice one).

### Task 3: Step 1 shapes, tail, and character counter

Source: `walkthrough.css` lines 123-139 (tail) and 193-206 (fields), override at 575-578.

- **Tail:** replace the current single-triangle tail in `Step1Describe.tsx` with the design's two-triangle construction: a back triangle in `--hairline` (13px, at top -12px, left 17px) behind a front triangle in `--surface-raised` (12px, at top -11px, left 18px), so the tail reads as bordered along its slants. The bubble box itself takes the hairline border it currently lacks. This remains the product's only tailed bubble (the recorded onboarding exception); do not generalize it into OrbitBubble.
- **Description field (`.s1-field`):** min-height 150px, border-radius 14px, padding 14px 15px, background `--surface-raised`, 1px `--hairline` border, no shadow.
- **Character counter (`.count`):** currently missing entirely. Pin inside the field, right 12px, bottom 10px, in the counter's designed type (read exact size/color from the stylesheet). Wire it to the field's existing max length; if the field has no max length today, that is a data-shaped question: check what the server accepts (`create-group` path) and flag before inventing a limit.
- **Name input (`.s1-name`):** border-radius 12px, padding 11px 14px, same surface/border treatment.
- **`.s1-note`:** centered eyebrow-size hint, per stylesheet.
- Continue button: the stylesheet's onboarding buttons are pills; port the designed radius/height rather than the current 0.5rem rectangle (read exact values from the stylesheet's button rules for this screen).

### Task 4: Playback card, gap marker, confirm band

Source: `walkthrough.css` lines 150-172, overrides at 555-558 and 609.

- **Card (`.cardX`):** the schedule rows move out of the Orbit bubble onto their own card: background `--surface-raised`, border-radius 14px, box-shadow `0 1px 3px rgba(0,0,0,.35)`.
- **Rows (`.s2-srow`):** key/value rows with 1.4px dividers; keys at eyebrow size, letter-spacing .12em, uppercase, weight 700, fixed width 62px.
- **Gap marker (`.s2-gap`):** the "what time?" marker becomes `border-bottom: 2px dashed var(--lime)` with `--text-secondary` text, a 12px lime-stroked clock glyph, and the pending row's key in `--lime`. Currently the underline is solid; dashed is the designed final form (line 609). Lime here is the gap-cue meaning, per the color rules; nothing else on the screen may be lime.
- **Confirm (`.cfA`):** the confirm becomes the designed teal footer band on the card: background `--action`, label `--action-ink`, circular go-glyph at `rgba(10,33,37,.20)`. Keep the existing disabled/in-flight opacity treatment, no transition.
- The same row/card treatment applies wherever StepGapAsk renders the playback rows, so gap-ask and playback stay visually identical apart from the marker.

### Task 5: Chat input and send button (gap-ask)

Source: `walkthrough.css` lines 142-148, override at 694-698.

- Input pill: border-radius 26px.
- Send button resting: background `--surface-raised`, 1px `--hairline` border, arrow stroke `--text-faint` (a filled circle, not the current bare arrow).
- Send button active (text present): background `--action`, arrow stroke `--action-ink`. This mirrors the group chat composer's teal-when-sendable behavior.

### Task 6: Step 3 pill, link row, proceed button

Source: `walkthrough.css` lines 174-191, overrides at 548-554 and 588.

- **ShareInviteLink (shared component, `src/components/ShareInviteLink.tsx`):** height 46px, border-radius 24px pill, teal `--action` / `--action-ink`. This intentionally updates the group info page too (owner's call, 18 Aug 2026); verify both surfaces.
- **Link row (`.s3-link`):** border-radius 10px, padding 11px 12px, background `--surface-base`, 16px globe glyph, URL ellipsised at `--type-label`.
- **Caption (`.s3-caption`):** uppercase eyebrow, letter-spacing .12em.
- **Proceed button (`.s3-proceedB .btn`):** min-height 52px, border-radius 28px, background `--surface-raised`, text `--text-primary` (the override at 588 makes it a secondary, not teal; the current transparent-plus-hairline version changes to this). Hint below stays a centered eyebrow.
- Teal audit for the screen: the share pill is the screen's teal; the proceed button is deliberately not. That matches the teal-marks-what-matters rule.

### Task 7: Wizard header

Source: `walkthrough.css` lines 95-105, override at 533. File: `src/components/WizardHeader.tsx`.

- Orbit mark slot grows to 44px (currently 36), transparent background, no border, overflow visible so the orbit path is uncropped (OrbitMark already draws at 156% of slot).
- Step eyebrow: keep size/tracking, color maps `--ink-faint` to `--text-faint` (currently `--text-secondary`).
- Back chevron: 20x30 slot, `--text-secondary` (mapping `--ink-soft`), negative margins per stylesheet.
- Name stays at `--type-heading`, tight leading. Update WizardHeader's component test if it asserts structure.

### Task 8: OrbitPause tune-up

File: `src/app/create/OrbitPause.tsx`. Ruled 18 Aug 2026: shape stays (mark plus one status line, `role="status"` preserved). Tune only: spacing consistent with the wizard's body rhythm, text at the meta/secondary voice matching the rest of the wizard's quiet text. No animation, no new elements. Judgment values here are the implementer's, named in the task report, since no drawn design exists.

### Task 9: Verification pass (after all tasks, before the PR)

1. Dev server up; render step 1, gap-ask, playback, step 3 in the browser beside `screens-01-02.png` and `screens-03-04.png`; capture side-by-side screenshots as evidence. Differences from the PNGs get listed as questions, not fixed.
2. Render the group info page; confirm the share pill and capture it.
3. Trigger the loading state (submit a description) and capture it.
4. Real-phone pass on the LAN address covering the full wizard flow end to end (create a real group against the dev-test database; run `npm run db:which` first). Findings fold into the QA script.
5. Full suite; report before/after against the baseline in this file's postscript.

---

## Postscript: test-suite baseline

Recorded 18 Aug 2026, at branch start, before any code: **90 files / 914 tests green**, zero
failures, matching the previous slice's finishing number recorded in build-notes §11
(time-change-ending slice). No pre-existing failures to carry.


---

## Postscript, 19 Aug 2026: what actually shipped against what this document planned

- **Task 3 was split and half of it is unbuilt.** The character counter is not in the branch. The
  design's counter reads "0/500", which imposes a 500-char cap on the founder's description where none
  exists; that is product behavior, it was surfaced to the owner as a question, and the task was split
  rather than guessed. Everything else in step 1 landed.
- **Task 7's brief was wrong.** It said the step eyebrow maps `--ink-faint` to `--text-faint`. The
  stylesheet defines `--ink-faint` as #A7AAB6, which is `--text-secondary`. The implementer followed the
  source over the brief and said so. The source-wins instruction in this document is what caught it.
- **The final review added seven fixes** beyond the nine planned tasks, two of them defects this slice
  itself introduced (a mid-word text break created by task 4's own overflow fix, and a duplicated send
  button). Also corrected: a fixed height violating the grows-with-content rule, step 1's label grammar,
  two shipped-code quiet-text sizes, step 2's missing disabled affordance, and the wordmark weight.
- **No real-phone pass was run by the build.** The document's verification plan asked for one. The build
  produced a 375x812 emulated pass with measured computed values instead; that is not the same thing and
  the phone pass is step 1 of the PR's QA script.
- **Final numbers:** 91 files / 920 tests green against a 90 / 914 baseline, `tsc --noEmit` clean.
