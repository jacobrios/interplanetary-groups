# Slice: the card region gets a height budget (14 Aug 2026)

*Companion to `2026-08-14-card-region-height-design-prompt.md`, the brief sent to Claude Design.*

**Status: design in progress.** The idea card's half is settled and written below. The confirmed
card's half waits on the design round the owner ran on 14 Aug. This document is committed now so
the settled decisions cannot drift while the handoff is out.

---

## For the owner

**Decisions already settled, do not relitigate.**

1. **Target B: the card region at 245px, cards at roughly 204px**, for typical content. Not a
   guaranteed ceiling; a two-line event title exceeds it and the design round is being asked what
   happens then.
2. **Equal-height cards stay**, and the hollow middle on a short card is accepted. The owner's
   call, carried from the PR #66 QA.
3. **Background colour is not a lever**, on this or any card problem. Also the owner's call from
   that QA.
4. **Height is bought from padding, wrapping, and copy length only, never by spending one of the
   five idea-versus-plan distinctness signals** (the controls, the shadow, the title weight, the
   need label, the fill, in measured strength order). If an option costs one, it gets raised
   rather than taken.
5. **The gauge chips drop their emoji and keep every word.** "I'm in / Next time / Yes, can't Mon"
   measures 291px against 310px available, so the three fit one row. "Not Mon" was considered and
   rejected by the owner: the third chip is not a decline (its stored answer is `NOT_THAT_DAY`
   and the wrong-day retry counts it as interest), and a shortened form would read as a second
   refusal sitting beside the real one.
6. **The card's tally takes a counts form; Orbit's chat message is untouched.** The card says
   "2 in · one more to go"; the bubble keeps "Sam & Jordan are in so far · one more makes it
   happen". The card loses the names and loses "makes it happen"; both survive in chat. Chosen
   because no rewrite of the named form guarantees one line (it is composed of up to three
   clauses, and the three-clause case measures 389px against 298px available), because the
   preview-card rule already says counts on the card and names on the detail screen, and because
   a one-line tally stops the card changing height as people vote.

**Not in this slice, and where each belongs instead.**

- **Making an idea card more visually distinct from a confirmed one.** Its own slice, post-MVP.
  Queued from the PR #66 QA, where the owner ruled the next attempt structural (a corner mark was
  floated and left undecided). This slice's constraint 4 exists to keep its material intact.
- **The time-change tally's wording.** Its own micro-slice. It is a copy problem on a correct
  mechanism, it lives on the event detail screen, and it touches no height.
- **Answering a time change with checkboxes.** Round-2 polish, post-launch. It would add height,
  not remove it.
- **The "two things both feel pending" information-architecture question.** Open, not decided,
  and explicitly the owner's to settle. Any option that resolves it by dropping the time-change
  notice off the confirmed card is out of bounds here.
- **A long venue label wrapping the meta line** (+22px). Named as debt below, not fixed.

**How this slice will be verified, written before any code.**

1. **The number is the deliverable, so the number gets measured, not asserted.** Before and after
   heights for: the idea card, the confirmed card in its baseline state, the confirmed card with a
   two-line title, the confirmed card carrying a time-change notice, the card region as a whole,
   and the chat feed. Measured in a browser at 390px wide, by `getBoundingClientRect`, not read
   off a screenshot.
2. **A real-phone pass over the LAN before the QA script is written**, per the standing rule added
   14 Aug 2026. This slice exists because a desktop pass missed the problem, so a desktop-only
   verification of the fix would be self-defeating. The owner's device is an iPhone 13 Pro in
   Chrome, which gives the page 661px, not the 780px a desktop browser at "mobile size" suggests.
3. **Unit tests on the two card components** for the states that carry the height: chips on one
   row, the counts-form tally at each vote state, the need label, and the notice. The repo can
   test a component but not the server-rendered page, so the region's total height is browser
   evidence, not test evidence, and will be reported as such.
4. **The full suite, before and after.** Baseline recorded at slice start: **89 files / 889 tests
   green**, matching the previous slice's finishing number, no pre-existing failures.
5. **The three excluded items are checked as unchanged**, not assumed: Orbit's chat tally still
   reads the named form, the time-change notice still says what it said, and the five
   distinctness signals are all still present on the idea card.

**Debt this slice is expected to open.**

- **A second tally voice.** The card and the chat will say the same thing two ways. That is the
  point, but it means a future change to how a tally reads has two places to land. Mitigated by
  keeping both in `spark-copy.ts` next to each other rather than composing the card's form at the
  render site.
- **The 204px budget is a decision with no enforcement.** Nothing in the repo will fail if a
  future slice adds a row to a card and pushes the region back to 315px. A test pinning a maximum
  height is not available, because the page is server-rendered and untestable here.
- **The long-venue case is unresolved.** A venue's `displayLabel` is meant to be short and nothing
  enforces it; a long one wraps the meta line and adds 22px. Recommendation: decline for now, and
  revisit if it ever appears in real data, since the field already exists to prevent it.

---

## The measured problem

On the owner's iPhone 13 Pro in Chrome the page gets **661 CSS pixels**, because Chrome holds both
its bars and the feed's inner scroll never collapses them. Spent as: header 74px, **card region
315px (47.7%)**, **chat feed 208px (31.5%)**, composer 64px.

Every card sets `height: 100%` and the rail renders at its tallest card's height. Contrary to the
QA note's diagnosis, the tallest card was the **idea card at 272px**, not the confirmed card,
which measures 229px with a one-line title. The confirmed card was the one wearing the hollow
middle.

Where the idea card's 272px went: the ask block is 169px of it, being a chip row that wraps to two
rows (87px) and a tally that wraps to two lines (52px).

## Task-by-task detail

*The idea card's tasks are written. The confirmed card's tasks are pending the design handoff and
will be appended to this document before any execution run begins.*

### Task 1: the gauge chips fit one row

Drop the emoji from all three chip labels in `chipLabels` (`src/lib/orbit/spark-copy.ts`), keeping
every word. The labels become "I'm in", "Next time", and "Yes, can't {Day}".

One grammar, not two: `GaugeChips` is shared by the card and the chat feed and reads one label
source, so this changes both surfaces deliberately. Do not add a card-only chip variant; the
`choice.tsx` grammar file exists precisely to stop four hand-kept copies drifting.

Measured expectation: the chip row falls from 87px to roughly 44px, and the idea card from 272px
to roughly 229px. Verify by measurement, not by assuming the arithmetic.

Tests: the existing chip-label tests will assert the emoji; update them, and add one pinning that
the three labels' combined width assumption is documented (a comment, since width is not testable
in jsdom). The real width evidence is the browser measurement.

### Task 2: the card's tally takes a counts form

Add a sibling to `buildTallyLine` in `src/lib/orbit/spark-copy.ts` composing the counts form, and
leave `buildTallyLine` itself untouched so Orbit's chat message does not change. The card's form:

- in-count as "N in", always present once anyone has voted
- the different-day clause as "N for another day" when nonzero
- the countdown as "one more to go", only at one away from the bar, matching the existing rule

Empty string when nobody has voted, same as today, so the line is absent rather than saying
"nobody is in yet".

Measured ceilings, against 298px available: the three-clause case "2 in · 1 for another day · one
more to go" is 258px, and the absurd 23-person case is 290px. "One more makes it happen" cannot be
kept here; it measures 355px in the three-clause case, which is why the card's countdown shortens.

`IdeaCard` reads the new form; `MessageFeed`'s gauge bubble keeps reading the old one. The wiring
runs through `src/lib/pending/derive.ts`, which composes `item.chips.tallyLine` today.

Measured expectation: the tally falls from 52px to 26px in every state, and the idea card lands at
roughly 203px.

Tests: the counts form at each vote state (zero, one, two, at the bar, past it, with and without
different-day votes), and one asserting `buildTallyLine` still returns the named form, since that
is the thing this task must not break.

### Task 3 onward: the confirmed event card

Pending the design handoff. The card's measured anatomy, which the brief carries: border 3.4px,
padding 27px, need label 25px, title 23px at one line and 46px at two, meta 23px, counts 29px,
RSVP pair 51px, time-change notice 42px. Natural totals 229px at a one-line title and 246px at
two, against a 204px budget.
