# Round 10 · Orbit's email ask — handoff

Design reference: `Round 10 - Email Ask - Interplanetary Groups.html`
CSS: `design_handoff_round10/email-ask.css` (additive; load after `round4-base.css`)

Nine frames, all on the measured 390 × 661 page: A1/A2 full screen, B1/B2 bottom sheet,
C1/C2 centred card, D the inline version done properly, E the code step, F the second ask.

---

## Recommendation

**B2 — bottom sheet, 65% min-height, X plus "Not now".**

- Full screen (A) hides the header, and the header is exactly what the second ask tells the
  member to tap. It also reads as a wall rather than an interruption.
- The centred card (C) is light enough that a member can read it as dismissible noise.
- The sheet is heavy enough to be answered and cheap enough to be left. The group stays
  visible, so the member can see what they would be locked out of.

---

## Structure

### Shells
| Frame | Element | Geometry |
|---|---|---|
| A | `.ea-full` | `position: absolute; inset: 0`, `--surface-base`, column flex |
| B | `.ea-scrim.bottom` > `.ea-sheet` | `min-height: 65%`, radius `22px 22px 0 0`, `--surface-low`, top hairline, grab bar |
| C | `.ea-scrim.center` > `.ea-card` | content height, 18px side inset, radius 18px, `--surface-low`, hairline |
| D | `.ea-inline` | inside the group home, above `.gh-pin`, `margin: 0 16px 10px` |

Scrim: `rgba(8,9,13,.70)`. Tapping it dismisses without spending the ask.

### Orbit's note (`.ea-note`, and the same grammar in `.ea-inline`)
- `display: grid; grid-template-columns: 34px 1fr; column-gap: 13px`
- Mark: `grid-row: 1 / span 2`, 34px circle, 1.5px `--text-primary` border,
  `--surface-base` fill, `drop-shadow(0 0 9px rgba(164,239,78,.28))`
- Eyebrow: "A NOTE FROM ORBIT", `--type-eyebrow` 13px, `letter-spacing: .14em`,
  weight 700, `--text-secondary`, vertically centred against the mark
- Copy: `--type-body` **17px** (up from the shipped 15px), `--leading-normal`,
  `--text-primary`, `text-wrap: pretty`

**Do not float the mark.** The grid is what fixes the ragged indent in the current version:
every line of copy shares one left edge.

Box is `--surface-raised` with a 1px `--hairline` border, radius 14px. Not a chat bubble:
one viewer sees this, and a bubble would imply the group can read it.

### Fields
- Email: `.ea-input`, min-height 52px, `1.0625rem` (17px, above the 16px iOS zoom threshold),
  `--surface-base` fill, 1.6px `--hairline`, radius 12px, placeholder `--placeholder`.
  Filled state adds `.typed` (text `--text-primary`, border `--text-secondary`).
- Code: `.ea-input.ea-code`, **one input, eight digits**, JetBrains Mono, `--type-title`,
  `letter-spacing: .26em`, tabular figures, min-height 60px. No segmented boxes: paste has to
  work, and eight boxes read as a puzzle.
- Save: `.ea-save`, `--action` on `--action-ink`, min-height 52px, full width, weight 700,
  the existing top-lit gradient from the finish layer. **Save is the only teal element.**

### Dismiss
- `.ea-x` — 44px circle, `--surface-raised`, 1px `--hairline`, glyph `--text-secondary`.
  Bordered on purpose: a bare glyph in padding does not read as a control.
- `.ea-notnow` — 17px, weight 600, `--text-secondary`, underlined with 4px offset,
  min-height 44px, directly under Save. Underline plus position carries it with colour off.
- Never teal, never lime.

### Copy
First ask, second ask: **verbatim from the brief, do not rewrite.** `[group name]` renders the
real name in `--text-primary` weight 600 — a pointer to the header, not a control.

Code step copy (new, written to the voice rules, no dashes):
> I sent an eight digit code to {email}. Type it in and you're set.

Resend line: "No code yet? You can ask for a new one in 60 seconds." Plain words, not a
ticking timer the member has to watch.

---

## Behaviour for engineering

1. **At most twice per person, ever.** First on their first contribution (message, RSVP, or
   vote). Second no sooner than 7 days later, and only if they have been active since.
2. **Declining spends an ask** (X or "Not now"). **Ignoring does not** (scrim tap, back
   gesture, app backgrounded, navigation away).
3. Save → the same shell swaps to the code step. Do not open a second modal.
4. Resend is disabled for 60 seconds after send; the label states the wait rather than
   counting down.
5. On success the member is a permanent identity; the ask never appears again.

## Growth

No fixed heights. The sheet's 65% is a floor and frame F shows it exceeded by the longer
second-ask copy. The full screen puts its flexible spacer between the note and the field, so
enlarged device text consumes air first and Save stays reachable. The card is content-height.
Nothing clips at any device text size.

## One tension, named

Frame D carries a teal border because the brief asks for it — the only place teal appears on
something that is not Save. It reads as a system callout rather than a control, and D is the
version being chosen against, so it sets no precedent. If the inline version ever shipped, that
border should be 1.6px `--hairline` with the fill lifted instead.

## Notes

- Colour independence: no state in this element depends on hue. Save is a filled button with a
  label, decline is underlined text, the code field's filled state changes border weight and
  text colour together.
- New token used: `--surface-low: #1f222c` (from the brief's token list; it was not yet in
  `walkthrough.css`). Everything else resolves to existing tokens.
- These files are design references in HTML, not production code. Port the measurements and the
  structure into the app's own components.
