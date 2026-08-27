# Round 11 · The bottom of the sheet — handoff

Design reference: `Round 11 - Sheet Bottom - Interplanetary Groups.html`
CSS delta: `design_handoff_round11/sheet-bottom.css` (load after `design_handoff_round10/email-ask.css`)

Round 10's B2 shell, Orbit's note, the copy and the code step are unchanged. Only the region
below the note moves.

---

## The answer

**The reassurance belongs to the field, not to the sheet.**

It answers a question the input raises: what happens to the thing I am about to type. Attached
to the field, it is read at the moment the decision is being made, and the space under Save is
left holding one item.

Under Save: **Save, then Not now.** Two items. **The X is deleted.**

Reading order: what I want → what you type → what happens to it → the button → the way out.

---

## Ship this (frame A)

```
.ea-scrim.bottom
  .ea-sheet                      min-height 65%, max-height 100%
    .ea-grab
    .ea-pad                      scrolls inside the sheet when content exceeds the page
      .ea-note                   unchanged from round 10
      .ea-fieldgroup
        .ea-lab                  "EMAIL"
        .ea-input                17px, min-height 52px
        p.ea-assure              the reassurance line
      .ea-actions
        .ea-save                 teal, the only teal element
        .ea-exit                 "Not now"
```

No `.ea-top`, no `.ea-x` in this markup.

### `.ea-assure`
`--type-meta` 15px · `--leading-normal` · `--text-secondary` · `margin-top: 9px` ·
`text-wrap: pretty`. Above the 13px floor, clearly subordinate to the 17px copy, and not styled
as fine print: fine print would be 13px grey, and this is a promise.

Copy:

> I use it to sign you in and send you plans. I never share it or sell it.

First person, because everything else on the sheet is Orbit speaking. Two clauses: what it does,
what it will never do. 15 words, two sentences, no dashes. It says "plans" rather than naming
the digest, so it stays true when the digest ships.

### `.ea-exit`
17px, weight 600, `--text-secondary`, underlined at 4px offset, 1.5px thickness, min-height
48px, full width, centred under Save. Never teal, never lime. Underline plus position carries
it with colour switched off.

Replaces `.ea-notnow`. Same treatment, taller target.

---

## Dismissal, and what each gesture costs

| Gesture | Legible | Spends an ask |
|---|---|---|
| **Not now** | labelled word | **yes** |
| Scrim tap | learned pattern | no |
| Drag the sheet down | grab bar signals it | no |
| System back | platform | no |

**Flagged, as requested.** The labelled exit and the scrim look like one gesture and are not.
We think this asymmetry is acceptable and pointed the right way: the silent gesture is the cheap
one. Someone who taps outside gets asked once more later. Someone who reads and taps Not now has
told us something, and spending the ask honours it. Inverted, it would be a bug.

The grab bar does enough work that the worded exit can be quieter than a bordered button. It
cannot be quieter than legible: 17px, weight 600, 48px target.

---

## What was rejected, and why

- **X restyled or relocated (frame D).** Moving the circle onto the scrim genuinely fixes the
  competing-border problem. It leaves a sheet where every word is about staying and the only way
  out is a symbol, at the point furthest from the thumb. Fails the eighty-year-old rule.
- **Reassurance in Orbit's note (frame B).** Right about voice, wrong about placement. The
  promise arrives before the member knows there is a field, and on the second ask it becomes a
  sixth sentence under five. Field-attached puts the line in the same place in both asks.
- **Reassurance and exit as one element (frame C).** It does read as one block, but it makes the
  decline the last line of a small-print paragraph and gives up the centred position that made
  it findable.
- **Two exits at different weights (frame E).** Stripping the X's circle removes what made it a
  control. Two controls doing the same thing at two weights implies one of them does something
  else. Costs 50px, buys nothing.

---

## Growth

The second ask (frame F) is the tallest state: **about 600px of 661**, sheet grown well past its 65%
floor, nothing dropped. Beyond that, `.ea-sheet` takes `max-height: 100%` and `.ea-pad` scrolls
inside it, so enlarged device text lengthens the scroll instead of pushing Save off screen.
Nothing clips at any text size. The 65% remains a floor.

Scrollbars are suppressed in the reference (`scrollbar-width: none`) to match the platform's
overlay scrollbars. In app, use whatever the codebase's sheets already do.

---

## Not on the code step

The reassurance does not appear there. By then the address is given and the promise is
retrospective, and the code step already carries one subordinate line (the resend). Two of them
under one button is the stack this round exists to prevent. The code step is exactly as shipped
in round 10.

---

## CSS delta

Ship:
- `.ea-fieldgroup`, `.ea-assure`, `.ea-exit`
- `.ea-sheet { max-height: 100% }` and the scrolling `.ea-pad`

Do not ship (they exist only to draw the rejected frames):
- `.ea-closing` (C) · `.ea-scrim.xtop` + `.ea-xrow` (D) · `.ea-x.bare` (E)
- `.ea-note .stack` and `.ea-note .copy.soft` (B)

`.ea-top` and `.ea-x` stay in `email-ask.css` for other surfaces. Delete the markup on this
sheet, not the classes.

Nothing depends on hue. Save is the only teal element. Lime appears only inside Orbit's mark.
