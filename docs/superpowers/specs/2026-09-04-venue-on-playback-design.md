# The venue stops hiding on step 2

*Micro-slice document. Written 4 September 2026, before any code. Two defects
the owner reported from production with screenshots, plus one prior decision
this slice deliberately reverses.*

## Settled, do not relitigate

**The defects.** On onboarding step 2, an empty venue renders as a small
underlined "Add where you meet" text link that is easy to miss. Tapping it
reveals a 14px input, and **iOS Safari force-zooms the page on any input under
16px and never zooms back**, so the founder is left stuck at an unfamiliar
magnification with the card cropped. The input's placeholder is also truncated
mid-word ("Where do you usually meet? (op").

**This matters more than a missed optional field, and that is why the July
decision is being reversed:** there is no way to add a venue after group
creation, anywhere. Not in the wizard, not on the group info page, not by
telling Orbit. A founder who misses this link cannot fix it later.

1. **The empty state becomes a full-width box that looks like a tappable field,
   in the group-name row's existing visual language.** Impossible to miss.
2. **It stays a `<button>`, not an `<input>`.** This preserves the distinction
   the owner drew on 22 July 2026 after seeing the always-on treatment
   rendered: the group-name row is an input holding a value **Orbit produced**,
   which is editing; an empty venue input holds nothing, which is collecting,
   and the card's heading promises "Here's what I understood." **What is being
   reversed is the quietness of that control, not the principle behind it.**
3. **It also removes the zoom entirely**, because tapping a button focuses
   nothing. The revealed input is raised to at least 16px anyway, so the trap
   cannot return by another route.
4. **"Optional" is dropped from the copy.** It is not optional in any useful
   sense when it can never be added later, and the word was being truncated
   anyway.
5. **Copy is as short as it can be.** Every extra word costs a rendered line,
   and vertical space on this screen is already contested.
6. **No new design elements.** Reuse the group-name row's shape, padding,
   radius, border and colours. A previous slice invented new elements where
   existing ones would have served, and the owner named that as the thing to
   avoid here.

## Amended 4 September 2026, after the owner tested it rendered

Three changes, all settled with him, none relitigable.

**7. The box spans the whole card, not the value column.** The first build made it
full-width *within* the rhythm row's value column, which is indented past the
activity label, so it did not line up with the group-name field above it. It must
match that field's width exactly.

**8. The venue is REQUIRED on the primary rhythm.** Confirm does not enable until
it has something, the same way it already refuses an empty group name. **This
amends the standing rule "venue never gates anything"**, and the amendment is
narrower than a reversal: *the model still never blocks anyone; only the
founder's own empty box does.* That rule exists so a bad extraction cannot trap a
founder, and that protection is untouched. **It reverts when the editable event
card ships**, the owner's stated trigger, because the gate exists only because
there is no way to add a venue later.

**Secondary rhythms stay optional, and the reason is not effort** (it is one word
in the check). A secondary activity like a monthly beers often has no fixed
place. Gate it and the founder types "idk" to get past, and that string does not
stay in onboarding: venue inheritance attaches a matching rhythm's venue to real
events Orbit creates later, so a junk answer becomes the meeting place on a real
plan. This project already prefers no venue over a wrong guess about where a
group drinks. **Blank is honest; "idk" is a wrong answer that propagates.**

**9. The gap-ask card must show a captured venue.** This is the defect the owner
originally reported, and it is narrower than it first appeared: extraction
captures the venue, carry-over preserves it, and step 2 displays it correctly.
What drops it is the **gap-ask** card, because `StepGapAsk` renders through
`PlaybackCard`, and `PlaybackCard` contains no venue rendering at all. A card
whose heading reads "Here's what I got" omitting something Orbit did get is a
silent drop of the same class this project has a standing rule about.

## Non-goals

Adding a venue after creation, which is the real gap and its own slice. The
venue-not-showing-when-extracted report, which the owner is re-testing: the code
path reads correct end to end (extraction captures `venueName`, `enforceVenueCarryOver`
carries it through a gap round, and `seededVenueIdx` reveals the input when it is
present), so there is nothing to fix until it is reproduced.

## How this is verified

**Tested in vitest:** the empty state renders a button, not an input, and is
full-width; tapping it reveals the input focused; a captured venue renders the
input directly with its value and does not steal focus on mount; the revealed
input is at least 16px. Each proven by mutation, not by a green run.

**Measured in a browser at 375x812, and this is the acceptance gate the owner
named:** the teal confirm band must stay above the fold with **two** rhythms,
which is the worst case. Report the pixel position before and after.

**Deliberately not tested:** whether iOS actually stops zooming. That needs the
owner's phone; the 16px threshold is a documented WebKit behaviour, not
something this environment can observe.

## Debt

**One box per rhythm, so a two-rhythm group gets two.** That is the exact
condition the owner reversed in July, when two stacked placeholders read as a
form. It is accepted here because these are tap targets rather than text fields,
and because a missed venue is permanent. If a founder ever reports the card
reading as a form, this is the line to revisit.

---

# Tasks

## Task 1 — the venue control

`src/app/create/Step2Playback.tsx`, the venue block at roughly lines 216-268.
Read the comment above `seededVenueIdx` (about line 60) first: it records the
July decision this slice partially reverses, and its distinction still holds.

**Empty state.** Replace the underlined text link with a full-width control
carrying the group-name input's own visual language — read that input's actual
style object in this file and reuse its values rather than inventing any. It
stays a `<button type="button">` with the same `onClick`. Its label reads as
placeholder text, in the placeholder colour, not as a bright value: **"Where do
you meet?"** — four words, phrased as the field it resembles rather than as an
action, because it now looks like a field. Keep the existing `aria-label`
naming the activity, so two rhythms are distinguishable to a screen reader.

**Revealed and captured states.** Unchanged behaviour, two edits: raise
`fontSize` from `var(--type-label)` (14px) to at least 16px so iOS cannot
force-zoom it, and shorten the placeholder to **"Where do you meet?"** so it
stops truncating. Everything else — `maxLength`, `autoFocus` on tap only,
`seededVenueIdx` computed once at mount — stays exactly as it is, including the
comments explaining why.

**Do not** change `PlaybackCard`, the confirm band, the group-name row, or
anything in `StepGapAsk`.

**The fold is an acceptance criterion, not a nicety.** This screen has a
measured history of pushing content below the fold on the owner's phone. After
the change, render step 2 with **two** rhythms at 375x812 and report where the
confirm band's top edge sits, before and after. If it drops below the fold, say
so rather than shipping it; the fix is spacing elsewhere on the card, not
shrinking this control.

Tests: extend `src/app/create/__tests__/`. Mutation-prove each. Run only the
tests reaching what you touch, not the full suite.
