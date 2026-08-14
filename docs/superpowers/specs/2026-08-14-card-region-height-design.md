# Slice: the card region gets a height budget (14 Aug 2026)

*Companion to `2026-08-14-card-region-height-design-prompt.md`, the brief sent to Claude Design
for round 8. The round produced two approaches; both were declined in favour of a simpler answer
the owner proposed, described below. Round 8's one surviving contribution is the 44px tap target.*

---

## For the owner

**Decisions already settled, do not relitigate.**

1. **The card region lands at roughly 220px, down from 315px.** On the owner's phone (iPhone 13
   Pro in Chrome, 661px of page) that takes the region from 47.7% of the screen to 33%, and the
   chat feed from 208px to about 304px, from 31.5% to 46%.
2. **Equal-height cards stay**, and the hollow middle on a short card is accepted.
3. **Background colour is not a lever**, on this or any card problem.
4. **Height is bought from padding, wrapping, and copy length only, never by spending one of the
   five idea-versus-plan distinctness signals.**
5. **The gauge chips drop their emoji and keep every word.** "I'm in / Next time / Yes, can't Mon"
   measures 291px against 310px available. "Not Mon" was considered and rejected: the third chip
   is not a decline (its stored answer is `NOT_THAT_DAY` and the wrong-day retry counts it as
   interest), so a shortened form would read as a second refusal beside the real one.
6. **The card's tally takes a counts form; Orbit's chat message is untouched.** Card: "2 in · one
   more to go". Bubble: "Sam & Jordan are in so far · one more makes it happen", unchanged. No
   rewrite of the named form guarantees one line (three clauses, 389px against 298px available),
   and the preview-card rule already says counts on the card, names on the detail screen.
7. **The need label leaves its own row on both cards.** On the confirmed card it joins the counts
   line; on the idea card it joins the title, dropping back to its own line when a long activity
   name leaves no room. Both rows wrap rather than clip.
8. **An open time change no longer appears on the confirmed card at all.** It is raised,
   announced, chipped and tallied in chat, exactly as it already is, and the vote itself stays on
   the event's detail screen. Owner's decision, on three grounds: the card was a second surface
   pointing at a conversation that already carries the same chips ("8pm works" / "Keep 7pm"); an
   RSVP and a time-change vote on one card are two decisions the product already treats as
   coupled, since a passed change wipes every RSVP; and a time change is secondary and does not
   earn permanent space above the fold.
9. **The RSVP pair gets 44px tap targets** (from 40.6px), round 8's one adopted contribution. It
   costs about 16px of card height and is free here, because the idea card sets the region's
   height either way.

**Not in this slice, and where each belongs instead.**

- **A time change has no ending.** Verified in code: `ChangeProposal` has no expiry or close, and
  the hourly cron runs only `reconcileScheduledEvents` and `runGaugeEndgame`. A stalled proposal
  sits open forever and Orbit never bumps it. **Its own slice, recommended as the next one**, and
  the same shape as the gauge-endgame slice. An owner proposal for a preventive "speak now if you
  want a different time" nudge on every event was declined in favour of this, because it would
  spend a nudge on every plan to prevent an occasional problem, against the anti-clutter rule.
- **A saved calendar entry does not update when the group moves the plan.** Pre-existing and
  already recorded at build-notes §6. Owner's decision 14 Aug 2026: its real home is post-MVP
  notifications, weighted by whether the viewer has RSVP'd, which is what makes it a signal
  rather than noise.
- **Making an idea card more visually distinct from a confirmed one.** Its own slice, post-MVP.
  Constraint 4 exists to keep its material intact.
- **The time-change tally's wording**, on the event screen. Its own micro-slice.
- **Answering a time change with checkboxes.** Round-2 polish, post-launch.
- **A long venue label wrapping the confirmed card's meta line** (+22px). Named as debt below.

**How this slice will be verified, written before any code.**

1. **The number is the deliverable, so it gets measured.** Before and after heights for: the idea
   card, the confirmed card at a one-line and a two-line title, the card region, and the chat
   feed. Measured in a browser by `getBoundingClientRect` at 390px wide, never read off a
   screenshot.
2. **A real-phone pass over the LAN before the QA script is written**, per the standing rule added
   14 Aug 2026. This slice exists because a desktop pass missed the problem.
3. **Both wrap fallbacks are proved, not assumed**: the confirmed card's counts row with a large
   group, and the idea card's title row with a long activity name. Each must grow, never clip.
4. **Unit tests** on both card components and on the two copy builders. The repo can test a
   component but not the server-rendered page, so the region's total height is browser evidence
   and will be reported as such, not as test evidence.
5. **The full suite, before and after.** Baseline at slice start: **89 files / 889 tests green**,
   matching the previous slice's finishing number, no pre-existing failures.
6. **Three things checked as unchanged, not assumed**: Orbit's chat tally still reads the named
   form, the time-change chips and tally in chat are untouched, and the vote still renders on the
   event detail screen.

**Debt this slice is expected to open.**

- **A second tally voice.** The card and chat say the same thing two ways. Mitigated by keeping
  both builders adjacent in `spark-copy.ts`.
- **The 220px budget has no enforcement.** Nothing fails if a future slice adds a row. A
  max-height test is not available, because the page is server-rendered and untestable here.
- **The long-venue case is unresolved.** Recommendation: decline, since `displayLabel` exists to
  prevent it.
- **A stalled time change is now invisible.** Today it at least sat on the card. This is the
  direct cost of decision 8 and the reason the endgame slice is recommended next.

---

## The measured problem

On the owner's phone the page gets **661 CSS pixels**. Spent as: header 74px, **card region 315px
(47.7%)**, **chat feed 208px (31.5%)**, composer 64px.

Every card sets `height: 100%` and the rail renders at its tallest card's height. Contrary to the
QA note's diagnosis, the tallest card was the **idea card at 272px**; the confirmed card is 187.4px
without a time-change notice and 229.4px with one, and was the card wearing the hollow middle.

Where the idea card's 272px went: the ask block is 169px of it, a chip row wrapping to two rows
(87px) and a tally wrapping to two lines (52px).

**Projected end state:** idea card 178px, confirmed card 178px at a one-line title and 201px at
two, region about 219px, chat feed about 304px.

---

## Task-by-task detail

### Task 0: amend CLAUDE.md (first, before any code)

The standing-rule amendment comes first, because CLAUDE.md loads every session and a wrong rule
works against the slice that disproved it. Four edits, each a dated inline note, nothing deleted:

- The card-state-grammar paragraph's sentence describing the open time-change vote as "one quiet
  line" on the card.
- The settled-list clause "an open time-change vote showing on its event's card as a recessed
  one-line notice ... the one named exception to answer-in-place". The exception itself survives
  (the vote still lives one tap away on the event screen); the card's pointer to it does not.
- "A card carries a short top-right label naming what it still needs" — no longer top-right on
  either card.
- The "Next slice" paragraph, which describes this slice as upcoming.

### Task 1: the gauge chips fit one row

Drop the emoji from all three labels in `chipLabels` (`src/lib/orbit/spark-copy.ts`), keeping every
word: "I'm in", "Next time", "Yes, can't {Day}".

One grammar, not two: `GaugeChips` is shared by the card and the feed and reads one label source,
so this changes both surfaces deliberately. Do not add a card-only variant; `choice.tsx` exists to
stop four hand-kept copies drifting.

Expected: chip row 87px → about 44px; idea card 272 → about 229. Verify by measurement.

Tests: update the existing chip-label assertions.

### Task 2: the card's tally takes a counts form

Add a sibling to `buildTallyLine` in `spark-copy.ts` composing the counts form, and leave
`buildTallyLine` itself untouched so Orbit's chat message does not change. The card's form: "N in"
once anyone has voted; "N for another day" when nonzero; "one more to go" only at one away from the
bar. Empty string when nobody has voted.

Measured ceilings against 298px: three clauses is 258px, the 23-person case 290px. "One more makes
it happen" cannot be kept (355px in the three-clause case).

`IdeaCard` reads the new form via `src/lib/pending/derive.ts`; `MessageFeed`'s gauge bubble keeps
reading the old one.

Expected: tally 52px → 26px in every state; idea card to about 203.

Tests: the counts form at each vote state, plus one asserting `buildTallyLine` still returns the
named form.

### Task 3: the idea card's need label joins the title row

Move `NeedLabel` out of its own row in `IdeaCard.tsx` onto the title's row, right-aligned. The row
must **wrap** when a long activity name leaves no room, dropping the label to its own line and
returning the card to today's height. Never clip.

Measured: "beers?" plus "NEEDS OTHER VOTES" fits comfortably in 310px; a long activity name does
not, which is what the wrap is for.

Expected: idea card 203 → about 178.

Tests: the label renders beside a short title and still renders (on its own line) with a long one;
both states keep the teal-when-it-is-yours rule.

### Task 4: the confirmed card's need label joins the counts row

Move `NeedLabel` in `EventCard.tsx` onto the counts line, right-aligned, as a sibling of the
title/meta column so it gets the full 310px rather than the narrower text column.

**Two defects found in round 8's version of this move must not be reproduced:**

- **It clipped.** Round 8 set `flex-wrap: nowrap` on that row with both halves at natural width.
  Stress-tested in their own boards, a larger group gave 345px of content in a 307px box with the
  row height unchanged, and the card root's `overflow: hidden` cut it off. **The row must wrap**,
  dropping the label to its own line.
- **It hung past the chevron.** Measured in their boards: the title, the meta line and the chevron
  all end at 378.5px while the label ended at 404.5px, 26px further right. Baselines were exact
  (0.00px delta), so the misalignment is horizontal only. Give the label a right offset matching
  the chevron's gutter. Do **not** fix it by narrowing the row, which makes the clipping worse.

Expected: confirmed card 187.4 → about 162 before task 5.

Tests: the label renders on the counts row; a large group wraps rather than clips.

### Task 5: the RSVP pair gets 44px tap targets

Raise the compact RSVP buttons in `RsvpControls.tsx` from 40.6px to a 44px minimum. **Compact
only**, which is the home card's variant; the event screen's non-compact pair is untouched.

Expected: confirmed card about 162 → about 178. Free, because the idea card sets the height.

Tests: the compact variant asserts the 44px floor.

### Task 6: the time-change notice leaves the confirmed card

**Delete**, do not hide:

- the footer notice block in `EventCard.tsx`, and the `proposal` prop on both `EventCard` and
  `EventCarousel`
- the `proposalBands` computation and its wiring in the group home's `page.tsx`
- the open-proposal branch of `eventNeedLabel` in `src/lib/cards/region.ts`
- the now-dead `notice` field on `ProposalBandData` and `proposalNoticeQuestion` in
  `change-copy.ts`, whose only reader was that block

**Keep, untouched:** `deriveProposalBands`, `ProposalBandData` itself, `proposalBandQuestion`,
`ProposalSection`, and the event detail page, which is where the vote lives. Also untouched: the
chips and tally in chat, which already carry "8pm works" and "Keep 7pm".

Expected: the confirmed card stops varying with an open vote, and its worst case drops from 252.4
(two-line title plus notice) to about 201.

Tests: the card renders no notice when a proposal is open; `eventNeedLabel` returns null for a
viewer who has RSVP'd regardless of any open proposal; the event screen still renders the vote.

### Task 7: measure, verify, and record

- Browser measurement of every state named in the verification plan, before and after.
- The real-phone LAN pass, then the QA script written from what it surfaces.
- Full suite, before and after numbers.
- `build-notes.md` §11 entry: why both round-8 approaches were declined, the owner's simpler
  answer and its three grounds, the two defects found in round 8, and the finding that a time
  change has no ending.
- CLAUDE.md's current-state section rewritten to what is now true.
- Two items queued with their reasoning: the time-change endgame slice, and notifications
  weighted by RSVP for a moved plan.
