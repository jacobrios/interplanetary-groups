# Card state grammar design (12 Aug 2026)

Two changes to the group home's card region, brainstormed together because they are the same
underlying question: how a card communicates its own state. One, the event card's RSVP pair
stops leaning on the answer. Two, the pending strip retires and pending items become cards in
the top carousel. Sources read before anything here was proposed: the 12 Aug QA postscript at
the end of build-notes §11 (which records both changes and their lineage), the strip-placement
decision record (11 Aug), and the pending-surface postscript (10 Aug) whose switching-cost
assessment still holds.

**Status: awaiting owner approval.** Nothing below is built. The owner's reply to the brainstorm
message is the design gate; the decisions in Part 1 become do-not-relitigate only once that
reply lands.

---

## Part 1 · Decisions settled here (do-not-relitigate once approved)

### 1. The RSVP pair adopts the chip grammar

Unanswered, "I'm in" and "Can't make it" render as two visually equal options: transparent
fill, hairline border, the chip radius and type the gauge chips already use. No teal anywhere
on the pair, in any state. Answering marks the chosen option exactly the way a chosen gauge
chip is marked: a checkmark plus the small grey fill shift (the shipped selected-chip
treatment, which the owner ruled stays as shipped). The pair keeps its current two-across
full-width layout on the card; only the dress changes. Because the pair is one shared
component, the fix lands on the carousel card and the event detail screen in the same edit.

Why this is the fix and not a softer one: the owner's own comparison is right, the gauge chips
already solve this problem, and the product should have one grammar for "open question on a
card" rather than two. The gauge chips' slight brightness emphasis on the yes option (primary
text on the yes, secondary on the declines) carries over as-is; the complaint was the solid
teal fill reading as a pre-selected answer, not the brightness hierarchy, and the owner ruled
the chip treatment correct.

### 2. The teal rule is amended, because the treatment was right to lose

The tension the QA postscript named resolves against the old treatment, not against the rule's
intent. Proposed amendment to CLAUDE.md's color rule: **teal marks an action, never one side of
a question. When a control offers two or more equally valid answers, the options start visually
equal and the choice is shown by checkmark plus fill shift (the chip grammar).** Every other
teal in the app survives this wording unchanged: "Add to calendar", the onboarding CTAs, the
share button, and the composer send are all invitations to act in one direction, not one
answer favored over another. The strip's 7% wash amendment is struck (dated, per append-only
rules) when the strip retires.

### 3. Consequence, surfaced deliberately: the group home at rest shows no teal

After this slice the home screen's only teal is the composer send circle, which lights only
once there is text to send. That is "used sparingly" working as intended, not a loss; no teal
moment is invented to replace the buttons. Flagged so the owner confirms it knowingly rather
than discovering it in QA.

### 4. The strip and panel retire; pending items become carousel cards

The collapsed band, the panel, the scrim, the strip's icons, and the caught-up machinery all
go. What carries over unchanged, per the standing switching-cost assessment: the derivation
module, the server vote actions, the chip components and their callbacks, the shared Orbit
bubble, and (added by the 12 Aug postscript) the rebuilt carousel chrome, whose peek geometry,
scroll-derived dot, and disappearing-card reclamp are exactly what a mixed carousel needs.

### 5. Confirmed always leads: the ordering invariant that answers the dilution question

The card region's one job is the constant next-plan reminder, and that was the product reason
the carousel option originally lost. The answer is an invariant, not a treatment alone: **the
first card is always the next confirmed plan whenever one exists.** Full order: confirmed
events by start time, then pending gauges the viewer has not answered (by proposed start),
then pending gauges the viewer said yes to (by proposed start). A maybe can never appear
ahead of a real plan, and never appears first except when the group has no confirmed plans at
all, in which case surfacing the maybe is the region doing its job.

The three-card cap applies to the combined list, and confirmed events win slots. Overflow
pending items are simply not shown in the region; chat still carries every one of them, which
was always the primary surface (the strip was purely additive, and so is this).

### 6. Pending cards are subordinate by structure and label, never by hue

A pending gauge card carries: a short state label in the card's own top right (recommended
copy: **"Still waiting"**, eyebrow style, at or above the 13px floor); a title composing the
activity plus proposed day and time through the existing deterministic format helpers; the
same three gauge chips as chat (same component, same server action, same tally, per the
settled answer-in-place decision); and the live tally in the product's one tally voice.
Confirmed cards get **no label**: their raised chrome and counts line are their identity, the
label marks the exception, and a lone "Confirmed" eyebrow would invite "as opposed to what?"
while adding clutter. This refines the owner's QA sketch (which listed a label for both
states, copy unsettled); if the owner wants symmetric labels, only the confirmed card's copy
changes, nothing structural.

Subordination constraints binding on the design round: the pending card reads quieter than
the confirmed card by brightness and structure (for example a flatter, hairline-only shell),
plus the label; never by hue alone, never red or green as the only signal; **no teal wash on
any card** (a washed pending card would rank a maybe above a real plan, inverting the
hierarchy the wash was retired with). Layout grows with content and never clips.

### 7. A time-change proposal is a band on its event's own card, not a second card

The strip carried proposals as their own rows; in the carousel, the affected event already has
a card, and two cards for one plan would corrupt the at-a-glance read worse than any label
could repair. The proposal renders as a band on the confirmed event's card: the question, the
two proposal chips, and the live tally, all the existing shared components. The card stays a
confirmed card (the plan is real; only its time is in question) and grows to hold the band.
This is also better than the strip was: the question now sits on the plan it is about.
Alternative considered and declined: a separate "time change proposed" card, rejected for the
duplicate-plan confusion above.

### 8. Viewer tailoring carries over, adapted to cards

The carousel is already rendered per viewer. Unanswered items lead (the ordering above). A
viewer's yes stays visible as the selected chip on the card, still changeable, so the quiet
"You're in on" group is no longer needed as a separate structure. A decline removes that
pending card from that viewer's carousel; the vote stays recorded, and if the gauge later
promotes, the decline arrives as an OUT RSVP on the created event (already settled), so
nothing is lost by hiding the card. Promotion still removes the item from pending the instant
it happens: the gauge card becomes the event card, and the third yes from a card chip creates
and announces exactly as chat does today.

### 9. The caught-up moment retires with nothing in its place

The panel's caught-up note and the band's "All caught up" label existed because an enclosed
surface needed an empty state. Cards need none: the card disappearing, the carousel
re-clamping, and the region simplifying are the feedback. The settled "note fires only when a
decline clears the last waiting item" decision retires with the panel it described; this is a
deliberate retirement, recorded so the silence is never read as an oversight.

### 10. Empty states

The existing "No upcoming events yet" box renders only when the composed list is empty
entirely (no confirmed events and no pending items). When there are no confirmed events but
something is pending, the pending cards render alone; a card with a live question beats a box
saying nothing is happening.

### 11. One chip primitive replaces four near-copies

Three sibling chip components ship today with duplicated style blocks, and restyling the RSVP
pair would create a fourth. This slice extracts one shared chip primitive into the shared
components folder and rebuilds all four consumers on it. Product reason: the whole slice is
about one grammar for "open question on a card", and one component is how a grammar stays one;
four hand-kept copies will drift, and the shared folder is the only place the repo can
honestly test. The RSVP pair component also moves out of the event-detail folder it is
flagged as mis-homed in, since it is being rewritten anyway.

### 12. A Claude Design round is required before visual code, and this names its contents

The strip-placement record said a placement change needs its own design round, since the
handoff drew the strip and not cards. That round must draw: the pending gauge card (unanswered
and answered-by-viewer states) with its label; the confirmed card carrying a proposal band;
the restyled RSVP pair on the confirmed card face (so the board shows the whole region in one
grammar); and the mixed carousel with a confirmed card leading. The chip grammar itself is
shipped and settled and is not up for redraw. The empty-state box and chat surfaces are out of
the round's scope.

---

## Part 2 · Not in this slice (every exclusion names its home)

- **Orbit's open day-question getting a card or row.** It answers in prose, not chips;
  inherited exclusion from the pending-surface slice, home: a future slice when it earns a
  chip-free type.
- **Verbal RSVP** ("see you Monday" marking attendance). Home: its own queued slice, per the
  29 July QA finding in build-notes §11.
- **An overflow indicator or count** for pending items beyond the cap (the strip's "2 waiting
  on you" summary line dies with the strip). Home: post-MVP, with a named trigger in Part 4.
- **Venue on pending cards.** Settled: no gauge stores one until promotion; never shown early.
- **Any change to how often Orbit speaks in chat.** None; the region stays purely additive.
- **Condensing the event card after RSVP.** Open question recorded in build-notes §7; not
  built preemptively.
- **Animations** (card transitions, fades). Declined for MVP in the strip-placement record.
- **The onboarding wizard's polish.** Home: polish slice two, which this slice displaces in
  time but not in order; the pre-MVP triage order otherwise stands.
- **Founder fixing group details after creation.** Home: the queued post-MVP slice.
- **Multi-group home.** Out of MVP scope per build-notes §8.

---

## Part 3 · Verification (written before any code)

**No model behavior is touched.** No prompt changes, no new model calls, zero marginal run
cost; the recognition bench is not owed a run by this slice. Stated so the absence of bench
numbers in the PR is read as correct rather than skipped.

1. **Test-suite baseline** recorded at slice start in the build-notes §11 entry,
   cross-checked against polish slice one's finishing number, before any code lands.
2. **Component tests on the new chip primitive and the rebuilt RSVP pair**, written first and
   shown failing against the current build where applicable: the unanswered pair renders no
   teal on either option and no checkmark; selecting either option marks exactly that option;
   the pending (in-flight) state disables both. Assertions target semantics (labels, marks,
   the absence of the action color), not pixel values. This closes the current zero-coverage
   gap on the RSVP pair.
3. **Pure-function tests on the carousel composition**: confirmed-first ordering; the
   combined cap with confirmed winning slots; unanswered-before-answered pending order; a
   viewer's decline dropping the card; promotion moving an item from pending to confirmed; a
   proposal attaching to its event rather than composing as its own item; both empty-state
   branches. The existing derivation tests carry over; the strip's own tests and the
   strip-gate helper's tests retire with their components.
4. **Browser walkthrough on dev-test, multi-session**, evidence captured as screenshots and
   named in the PR: the unanswered card leaning on nothing; a "Can't make it" tap visibly
   moving the selection; a chip vote from a pending card landing in chat's tally and vice
   versa (same action, same rows); a third yes from a card chip creating the event, the card
   converting in place, chat announcing once; a decline clearing the last pending card with
   nothing else firing; a proposal band on the event card whose clearing vote moves the plan
   and resets RSVPs per the settled consensus rules; the mixed order holding confirmed-first.
5. **Rendered-vs-design comparison** against the new design round's board for every visual
   claim, per the no-claimed-match-without-comparison rule.
6. **Owner QA script**, proposed unprompted with the PR, ten minutes or less, run on a real
   phone, and it must include re-judging both originating complaints: "does the card still
   lean toward yes before you have answered?" and "do the maybes read clearly subordinate to
   the real plans?", plus the label copy call ("Still waiting", or the owner's alternative)
   which is a judgment only a human should make.

---

## Part 4 · Debt this slice expects to open

- **Hidden overflow has no surface count.** More than three combined items hides the rest of
  pending from the region entirely, and the strip's summary count is gone. Accepted for MVP
  group sizes; revisit trigger: a real group regularly holding more than three simultaneous
  items. Home: post-MVP.
- **A proposal on an event outside the top three cards is invisible outside chat.** Same
  acceptance, same trigger.
- **Mixed-height cards leave dead space below shorter ones**, since the rail stretches to the
  tallest card. Cosmetic; handed to the design round, and accepted if the round does not
  solve it.
- **The written-off strip polish** (separation geometry, the wash) is knowingly discarded;
  already recorded in the 12 Aug postscript, restated here so the PR diff's deletions read as
  intended.
- **Inherited, unchanged:** the day-question has no surface outside chat; a wrong venue still
  has no fix path.

---

## Slicing recommendation: one slice, with the split point named

**Recommendation: build both changes as one slice.** Reasoning: they share one foundation
(the chip primitive and the "open question on a card" grammar), one design round (the board
must show the restyled pair and the pending cards on the same card faces to be judged at
all), one surface, and one QA walkthrough; split in two, each half ends in a separate
ten-minute QA of the same screen, and the owner's attention is the binding constraint. Every
seam is proven ground: the chips, the vote actions, the derivation module, and the carousel
chrome are all shipped and walked, so the slice is large but honestly verifiable, which is
the stated bias.

The split point, if the owner prefers motion before the design round completes: change one
alone (chip primitive, restyled pair, teal amendment) needs no design round and could land as
its own small slice first. The cost is touching the same card twice and running QA twice;
recommended against, but it is the clean seam. This reasoning is engineering-shaped on the
seam and product-shaped on the QA load; the choice stays the owner's.

---

## Doc obligations when the slice lands (not debt; duties)

- CLAUDE.md: the teal-rule amendment in decision 2; strike the strip-wash amendment line with
  a date; rewrite the pending-strip paragraph of "Where the build is"; update the event-card
  line in the color rules ("teal primary plus outlined secondary") to the chip grammar; update
  the settled-decisions list where strip-specific decisions retire (the caught-up note, the
  wash) and where card decisions supersede them.
- build-notes §11: the slice entry, with baseline and after test counts and the walkthrough
  evidence.
- The strip-placement decision record gets a dated postscript pointing here, recording that
  the revisit trigger fired early (a real phone, pre-launch) and the carousel option revived.
- Pre-deploy checklist: nothing to add; no migration, no environment variable, no model call.
