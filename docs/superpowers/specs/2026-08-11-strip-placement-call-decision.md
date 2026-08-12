# Strip placement call, design round, and its rulings, decision record (11 Aug 2026)

Settled in a parallel brainstorm while the share-readiness slice was in flight, then carried
through two Claude Design rounds to an approved handoff the same day. This document rides the
visual-polish slice-one branch as its first commit (with a matching build-notes §11 postscript);
it is drafted outside the repo because the checkout was on feat/share-readiness when the calls
were made and slice docs never travel on another slice's branch.

## Decisions, settled, do not relitigate

- **The pending strip stays where it is.** The owner's QA reaction ("it blended into the event
  card") was a visibility problem, not a placement problem. Ruled by the owner, 11 Aug 2026.
- **The carousel option (pending items as cards in the top carousel) is deferred post-MVP, not
  deleted.** Only the presentation layer would change if it ever revives; nothing shipped
  forecloses it. The revisit trigger: the dressed strip still reading wrong after launch.
- **Teal-rule amendment: the event card no longer holds the group home's only teal.** The strip
  is a real action surface (decisions waiting on this member), so its band carries a translucent
  wash of the action teal. This bends the constraint recorded in the pending-surface QA note,
  knowingly, by the owner who wrote it. The parent teal rule survives intact: the wash is an
  attention weight on a genuine action, far quieter than any button, and the sentence still
  carries the meaning (greyscale-safe). CLAUDE.md's color rule needs a matching one-line note
  when this ships.
- **The chosen strip treatment: separation geometry plus the 7% wash.** Full-bleed band, feed
  gutter, air above (all per handoff item 03), washed with `tint-a`, `rgba(24,188,203,.07)`.
  The stronger 13% `tint-b` was drawn, compared by eye, and not chosen; do not build it.
- **The front door keeps its shipped copy.** Eyebrow, the wedding-planner headline, one short
  lede, one teal action, plus the handoff's new invite note ("Already invited? Open the link
  you were sent.", deliberately not a button). The round-one claims list and second lede were
  cut as too much copy. Layout per handoff item 01 (mark top, copy and action pinned low).
- **The carousel chrome is approved as drawn.** Active dot as a wider, brighter pill (width
  plus brightness, hue-free), 22px undimmed peek, three-card cap, single card stays bare.
- **The finish layer is declined for MVP, with two salvaged moves.** The owner could not see
  the before/after difference, which is the pilot doing its job; no per-screen finish rounds
  will be commissioned. Kept, as functional fixes rather than aesthetics: tabular numerals on
  all tallies (counts stop jiggling on live updates) and the grounded-composer scrim (feed no
  longer slides bare under the pinned input). Both already sit unscoped in the round-two base
  CSS. Animations stay out of MVP entirely.
- **`docs/design/design-polish-rd-2` is the sole build source for all of this.** Round two is
  a complete superseding bundle; round one (`design-polish-rd-1`) stays in the repo as the
  lineage record of the declined pilot and the pre-teal strip, and is not a build input.
  `finish-layer.css` is never loaded. Load order per the rd-2 README.
- **No wholesale redraw of stale screens** (unchanged from earlier today): recorded decisions
  win over the walkthrough; no other screen gets a design round.

## Resolved by events

- The open question of whether the dead-end screens (bad invite, not found, error) and the
  group-info founder states should join the design round closed itself: the round completed
  without them, matching the standing recommendation. They get tidied with existing tokens in
  the polish pass, no design round.

## Verification

Design rounds were verified by rendered inspection (the round-one board was walked in a browser
before the revision prompt was written; the owner judged the round-two tints by eye). Deferred
proof points for polish slice one: the QA script must include the owner re-judging the dressed
strip against the original complaint ("does it now read as its own element?"), and the slice
records the usual test-suite baseline before code lands.

## Debt and carry-items

- The build-notes §11 postscript recording these calls lands with polish slice one (append-only
  record, rides the slice branch), along with the CLAUDE.md teal-rule amendment note.
- Both design bundles are untracked in the shared checkout until the polish branch exists; the
  share-readiness session must not sweep them into its PR.
- Two record inconsistencies carried from the screen-inventory sweep: build-notes line ~890
  misattributes the `.ed-cal` CSS rules to the PNG reference folder (they live in the handoff
  bundles' walkthrough.css), and the wizard's OrbitPause loading state was never drawn by
  anyone, which nobody has ruled on.
- If the carousel-placement option ever revives post-MVP, it needs its own design round plus
  the two questions that died with it (caught-up state without a panel; keeping maybes
  subordinate to confirmed plans).

## Carryover prompt for the session that opens polish slice one

Use after the share-readiness merge lands:

> Open visual-polish slice one (foundations plus the group home). Before touching code: confirm
> main is current, cut the slice branch, commit this decision record into
> docs/superpowers/specs/ plus a matching build-notes §11 postscript and the one-line CLAUDE.md
> teal-rule amendment it names, then commit the two design bundles already sitting untracked in
> docs/design/ (design-polish-rd-2 is the build source; rd-1 is lineage only). Decisions are in
> the record, all settled, do not relitigate; the short form: strip stays in place with the
> item-03 separation geometry plus the 7% teal wash (tint-a; do not build tint-b), front door
> keeps its shipped copy in the item-01 layout with the invite note, carousel chrome per item
> 02, finish layer declined except tabular numerals and the grounded composer, no animation
> anywhere. The slice also covers the dark default, Geist, Orbit's real avatar, the group-home
> subline, and bubble/chip polish per the feel-pass register. Record the test-suite baseline
> before any code lands. The QA script must include me re-judging the dressed strip against the
> original complaint. Read the round-two triage entry in build-notes §11 and the feel-pass
> register before planning, and use subagents for any codebase investigation.
