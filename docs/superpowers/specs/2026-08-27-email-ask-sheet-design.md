# The email ask becomes a sheet

Slice branch: `email-sign-in` (the same branch, deliberately). Opened 27 August 2026.

**Status: design settled with the owner over two Claude Design rounds (10 and 11) and
this conversation. Frame A of round 11 is what ships.**

---

## Front section (for the owner)

### Settled, do not relitigate

The ask leaves the chat feed and becomes a **bottom sheet**. The reasoning that decided it,
which is not the obvious one: a sheet costs **less** total screen time than the inline note,
because the inline note is sticky until answered and competes with chat the entire time a
member stays undecided, while a sheet takes the screen once and ends. Anti-clutter argues
**for** the sheet here.

Everything else settled: round 10's B2 shell (65% floor, grows, scrim). Orbit's note in the
labeled-note grammar, mark in a grid column so no line wraps around it, "A NOTE FROM ORBIT"
eyebrow, copy at 17px. Round 11's frame A for the bottom: reassurance with the field, one
worded exit under Save, **no X at all**. Teal on Save and nothing else. **The founder no
longer gets different copy.** Dismissing spends one of the two lifetime asks; tapping the
scrim, dragging the sheet down, or going back does not.

### Not in this slice

The digest (its own slice, next, and the reassurance line's mention of reminders is honest
because of it). The eligibility rule, which is unchanged. The two sign-in screens, which were
deliberately never built on `EmailAttachFlow` and are untouched here. The group info row stays
**inline**: only the group home's shell changes.

### How this slice will be verified

Component tests for the sheet's states and the new bottom arrangement, red-first. The existing
eligibility and guard tests must stay green untouched, and the guard test renders these very
components, so a redden there is a real signal. **Nothing will be rendered by me**: no dev
server, by standing instruction, so every measurement is arithmetic and the owner's phone is
the only real verification. The QA staging script already seeds every state this needs.

### Debt this slice opens

**This is the product's first modal.** Nothing in the app uses a scrim, a sheet, or a
dialog today, so whatever this ships becomes the pattern the next one copies. Focus
management, scroll locking behind the scrim, and the back gesture are all being decided here
for the first time and none of them has a precedent to follow.

---

## The decisions, and where each came from

1. **A sheet, not an inline note.** The owner's diagnosis on a real phone: the inline version
   was "the worst case in-between, where it doesn't take up enough space that it seems like you
   can work around it but not enough space to really stand out."
2. **Bottom sheet rather than full screen.** Claude Design's reasoning, accepted: a full screen
   hides the header, and the header is exactly what the second ask tells the member to tap.
3. **Frame A's bottom: reassurance above Save, one worded exit below it, no X.** The tension
   that decided it: putting the reassurance under Save leaves the only exit as a glyph, and
   Orbit must be readable by anyone from a teenager to an eighty-year-old. Deleting the X also
   dissolves the owner's complaint that its bordered circle competed with the note's border.
4. **The reassurance line, measured rather than guessed:** "For sign-in and reminders. Never
   shared or sold." **Centred.** The owner's own draft was 412px against 352px of available
   width and would have wrapped to two lines, and centred text that wraps reads worse than
   left-aligned. Under about 50 characters, one line, centred, and narrower than the input all
   happen together; over it, none of them do.
5. **The founder's extra sentence is deleted.** The owner's call. A founder understands it is
   their group, and the clause did not name what a founder actually loses (the ability to manage
   members and reset the link), so it gestured at a bigger stake without carrying it. If founders
   should ever be warned about powers, that is different copy written on purpose.
6. **The reassurance line lives in the shared flow**, so the group info row gets it too. The
   promise is about the address and is equally true on both surfaces.

---

# The plan

## Task 1. Bring the real source into the repo

Copy the round 10 and round 11 handoffs out of Claude Design into `docs/design/`, matching the
existing `design_handoff_roundN` convention: both READMEs, `email-ask.css`, `sheet-bottom.css`,
and both HTML boards. **Proves it:** the files exist and the CSS referenced by the build is the
CSS that was drawn, not a description of it.

## Task 2. The sheet shell

`EmailAskNote` stops being an inline note above the composer and becomes a scrim plus sheet over
the group home. Scrim `rgba(8,9,13,.70)`, sheet `--surface-low`, `min-height: 65%`,
`max-height: 100%`, radius `22px 22px 0 0`, top hairline, grab bar, and the pad scrolling inside
the sheet so enlarged text lengthens the scroll rather than pushing Save off screen.

**Decide deliberately and record:** focus handling, whether the feed behind it scrolls, and what
the back gesture does. There is no precedent in this codebase; this sets it.

**Proves it:** component tests for the shell, plus tests that the four dismissal gestures spend
or do not spend an ask exactly as decided.

## Task 3. The bottom arrangement

Frame A: `.ea-fieldgroup` holding label, input and the reassurance line; then Save; then the one
worded exit. No `.ea-top`, no `.ea-x` in this markup. The reassurance line at `--type-meta`,
`--text-secondary`, centred.

**Proves it:** tests that the reassurance renders on both surfaces, that the exit is a word and
not a glyph, and that Save is the only teal element.

## Task 4. Copy

The founder variant is deleted. One string per ask for everyone. The reassurance line is added.
**Proves it:** the settled strings asserted as hardcoded literals, per the trap this branch
already recorded: two existing bad-code tests compare an imported constant against itself and
cannot catch a copy change, and the only real guards are hardcoded.

## Task 5. Documentation

`CLAUDE.md`'s current-state section, the build-notes entry, and the "Where Orbit decides to speak
or stay quiet" row, which now describes a sheet rather than a per-viewer inline note. The
first-modal precedent gets recorded wherever a future modal author would look.
