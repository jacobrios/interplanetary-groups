# The composer wraps

*Micro-slice document. Written 4 September 2026, before any code. Reported by
the owner from production with screenshots.*

## Settled, do not relitigate

**The defect.** Both message composers are single-line `<input type="text">`
elements, so a long message scrolls sideways and the member cannot see what they
typed. Screenshots show `"he line. It just keeps on going forever."` in the group
chat and `"also, you need to know where we c"` in onboarding's gap-ask. Two
files, one cause.

1. **Both become auto-growing `<textarea>`s.** `src/app/groups/[id]/ChatInput.tsx`
   and `src/app/create/StepGapAsk.tsx`. A textarea wraps by default; that alone
   fixes the reported bug.
2. **Interaction does not change.** Enter still submits, exactly as it does
   today, so there is no regression for anyone on any platform. Shift+Enter
   inserts a newline, which is new and free. *This is a decision made in the
   owner's absence: the alternative, Enter inserting a newline with only the
   send button submitting, is arguably better for a mobile-first product but is
   a behaviour change nobody asked for, and the reported bug is about wrapping,
   not about authoring multiple paragraphs. Overrulable.*
3. **Growth is capped, then it scrolls.** The composer must never eat the
   screen. This project has a measured height budget for the group home (the
   card region takes 34% and the feed 43.8%), and an unbounded composer would
   take it back silently.
4. **Neither input needs a font-size change.** Both are already
   `--type-body` (17px), above the 16px threshold that triggers iOS Safari's
   zoom-on-focus. The zoom trap the owner reported is the *venue* field on
   onboarding step 2 and belongs to that slice, not this one.

## Non-goals

The standalone-web-app blank screen, which is a viewport problem in home-screen
mode and is queued separately. The venue field's zoom trap (above). Any change
to how or when a message is sent.

## How this is verified

**Tested in vitest:** a long value wraps rather than overflowing on one line;
Enter submits; Shift+Enter does not submit; the element grows with content and
stops at the cap. Each proven by mutation, not by a green run.

**Proven in a browser at 375x812:** a long message visibly occupying more than
one line in both composers, which is the reported bug and fails today.

**Deliberately not tested:** how it feels on a real phone keyboard. That is the
owner's QA, and it is the only place the Enter decision above can really be
judged.

## Debt

Two composers now share a shape and still do not share a component. They differ
in fill, border and radius by design (the chat bar is grounded by a scrim, the
gap-ask is a 26px pill), so extracting one is not obviously right; if a third
appears, extract then.

---

# Tasks

## Task 1 — both composers wrap

Convert both `<input type="text">` elements to `<textarea>`.

`src/app/groups/[id]/ChatInput.tsx`: the input at roughly line 108, inside the
scrim'd bar, sharing a flex row with `SendCircleButton`.

`src/app/create/StepGapAsk.tsx`: the input at roughly line 161, the 26px pill,
same flex row shape.

Requirements, both files:

- `rows={1}` so it starts exactly the height it is today. Nothing about the
  resting state may change; this fix must be invisible until somebody types a
  long message.
- Auto-grow with content up to a cap of about five lines, then scroll inside.
  Reset the height when the value is cleared, or a sent message leaves the
  composer tall and empty.
- `resize: "none"`, so a member cannot drag it over the feed.
- Enter submits; Shift+Enter inserts a newline. Enter must submit even though a
  textarea's default is a newline, so this needs an explicit key handler.
- Keep every existing visual property: the fill, border, radius, padding,
  `--type-body` size, caret colour, and the flex relationship with
  `SendCircleButton`. A textarea also carries a default `line-height` and inline
  baseline gap an input does not; check the resting height actually matches
  before and after rather than assuming.
- Keep the hidden `<label>` and its `htmlFor` in both files. `ChatInput` uses
  `useId()`; do not replace that with a literal.
- `ChatInput` must NOT gain an `isPending` or `disabled` prop. Its header says
  why at length: the input is never disabled, because disabling it on iOS
  dismisses the keyboard and does not bring it back.

Tests: extend the existing test files. Cover wrapping, Enter submitting,
Shift+Enter not submitting, growth, and the cap. For each, break the thing it
guards, confirm red, restore, confirm green, and report what you saw.

Run only the tests reaching what you touch (`npx vitest related --run <file>`),
NOT the full suite: it takes 90s against a shared database and the coordinator
runs it.
