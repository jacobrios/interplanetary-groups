# The email ask gets a cooldown

Cut from `main` at `987830c`, in the worktree
`.claude/worktrees/email-ask-cooldown`, branch `email-ask-cooldown`.

**Test-suite baseline, recorded by running the suite at slice start rather than
copied from the record: 1663 passed of 1663, across 145 files, zero
pre-existing failures.** (The record's last figure, 1576 across 139, was
accurate on 2 Sept and had been overtaken by the cancel slice merging.)

---

## Front section

**This is not a bug fix in the sense of reverting a decision, and misreading
that would undo something deliberate.** The sheet reappearing is specified
behavior. `email-ask.ts`'s own comment: `emailAskCount` "is not an impression
counter: it only advances when the member answers an offer by dismissing it."
`EmailAskNote.tsx`'s header tables the scrim tap, Escape and navigating away as
free on purpose, because "the silent gesture is the cheap one." All of that
stands. **The defect is narrower: "free" was built as "means nothing at all,"
when tapping outside plainly means "not right now."** This slice teaches the
product to hear that, and changes nothing about what the two lifetime asks
count.

**Settled with Jacob, 3 Sept 2026, do not relitigate.**

1. **The two-ask lifetime counter is untouched.** It still advances only on the
   worded exit ("Not now" / "No thanks"). Nothing in this slice reads it, writes
   it, or changes what it means.
2. **The cooldown is 24 hours.**
3. **It is per person, not per group.** One cookie, no group id in it. Orbit is
   asking who you are, not which group you are in, and the lifetime counter is
   already per person on `User`, so a future column swap stays a straight swap.
4. **A cookie, read server-side. No migration, no database column.** Accepted
   knowingly: a cookie is per device and clears with site data, and the failure
   mode is only that the sheet returns, which is today's behavior.
5. **The client writes the cookie; the server only ever reads it.** No server
   action, so a silent exit still costs no network call and gains no failure
   mode it does not have today.
6. **The cooldown starts when the sheet is SHOWN, not when it is dismissed.**
   This amends the decision Jacob brought into the session, which said any
   dismissal including the scrim tap sets the snooze. See "The amendment" below;
   it was his call, made on a correction, and it is recorded rather than slipped
   in.
7. **Accepted knowingly: a member who only ever taps outside is asked once a day
   indefinitely.** Jacob's reasoning, which is the original design's own: tapping
   away often means they did not read it and want to get back to what they were
   doing, which is not a decision to refuse. Revisit only if it becomes a real
   complaint.

### The amendment, and why it is here rather than buried

Jacob arrived with "any dismissal, including the scrim tap, sets a snooze." I
raised a fourth way out that a dismissal trigger cannot reach: the phone's own
back gesture, which leaves the page entirely, so none of our code runs and
nothing is recorded. I first recommended accepting it, on the claim that it
costs at most one extra look, since tapping outside is right there and works.

**Jacob accepted conditionally, on exactly that claim, and the claim was
wrong.** Nothing in the code bounds it. A member whose habitual exit is the
back gesture uses it every time, records nothing every time, and meets the sheet
on every return, which is the very loop this slice exists to close. "One extra
look" was a prediction about behavior, not a property of the code.

So the trigger moved to "the sheet was shown." All four exits are covered by one
write, and the bound comes from the code rather than from a member's habits. The
cost I had attached to this option also turned out to be smaller than I said: a
member interrupted mid-typing is not shut out for a day, because the group info
page carries a permanent email row with no cooldown on it.

**Two consequences of the amendment, stated so no future reader has to derive
them.** First, the cookie now records an impression while the counter beside it
deliberately records only answers; those two things measure different things,
neither reads the other, and the difference is on purpose. Second, a finding
from the design pass dissolved with it: `onDone`, the way off the done step
after a successful attach, shares `handleLeaveQuietly` with the scrim tap, and a
dismissal-triggered write would have written a pointless snooze for somebody who
had just succeeded. Nothing writes on exit any more, so there is nothing to
separate and `onDone` is left exactly as it is.

### Non-goals, each with where it belongs instead

- **Making the scrim tap spend a lifetime ask.** Declined; it would invert the
  asymmetry `EmailAskNote.tsx`'s header comment calls deliberate. If the two-ask
  allowance ever needs rethinking, that is its own product decision, not a side
  effect of a cooldown.
- **A `User` column for the snooze.** The named successor to the cookie, if the
  cookie proves too flimsy. Task 1 is shaped so that swap is one call site plus a
  migration.
- **Intercepting the Android/browser back gesture.** Declined by
  `EmailAskNote.tsx`'s own precedent, because catching back means pushing a
  history entry and putting the sheet in the router's back stack. The on-show
  trigger covers the back gesture without intercepting it.
- **Changing the ask copy, the sheet's shape, or where it is asked.** Untouched.
- **Rate-limiting the group info page's permanent email row.** It has no
  cooldown and should not get one; it is the always-open door that makes the
  sheet's cooldown safe.

### How this slice is verified, written before any code

- **The decision function gets real tests, written first and shown failing
  before the change.** Shown ten minutes ago means no ask; shown twenty-five
  hours ago means ask; never shown means ask; and the existing two-ask and
  seven-day behavior is unchanged by the new input.
- **The cookie's parser gets real tests**: a valid value, a missing cookie,
  garbage, an empty string, and a non-numeric value. Every unreadable case
  resolves to "no note," which fails toward showing the sheet rather than
  toward silencing Orbit.
- **The sheet gets a component test** proving it writes the cookie when it
  appears, does not write when the gate says nothing, and that no exit path
  removes it.
- **One thing gets verified in a real browser and cannot be verified any other
  way: that leaving the group page and returning re-runs the server render and
  re-reads the cookie**, rather than the page being restored from Next's client
  router cache with the old answer baked in. If it is restored, this design does
  not work and Jacob is told before the build continues. This is checked early,
  as task 0, not at the end.
- **Deliberately not covered by any automated test: the real phone.** The
  tap-outside and back gestures on an actual iPhone are Jacob's QA pass. A
  script is handed over with the PR.
- **No test is claimed as evidence unless it was seen failing first.**

### The debt this slice opens

- **The cookie is per device and clears with site data**, so the same person on
  a phone and a laptop meets the sheet once on each, and clearing browser data
  returns them to today's behavior. Accepted at decision 4; the named successor
  is a `User` column.
- **A shared device inherits one snooze.** Two people using one phone share the
  cookie, so the second is quietly not asked for up to a day. The failure mode
  is silence rather than pestering, and the group info page's permanent row is
  still open to them.
- **The cookie records an impression while the counter beside it records
  answers.** No code depends on the difference, but a future reader could
  misread it as "impressions count now." Guarded by comments at both sites and
  by this document, which is the strongest guard available and not a strong one.
- **The 24-hour constant is a product number with no test that could tell you it
  is the wrong number.** It is tested for being applied correctly, not for being
  right.

---

## Task-by-task detail

Written for the agents that execute it. Full length on purpose; not thinned.

### Task 0 — Prove the return navigation re-reads the server (no code)

**This gates everything after it.** The whole design rests on the group page
being re-rendered on the server, with a fresh cookie read, when a member returns
to it. If Next's client router cache serves the previous render instead, the
server never re-reads the cookie, the component's local `answered` state has
been lost with the unmount, and the sheet reappears exactly as it does today.

The app has no `middleware.ts` and no `staleTimes` configuration in
`next.config.ts`, so the Next 16 default applies. The page is already dynamic
(it reads cookies through `getCurrentUser` → `createClient()` → `cookies()`), and
the documented default for dynamic segments is not to reuse them from the client
router cache. **That is a reading of the default, not a measurement, and it is
not accepted as evidence.**

Do this:

1. Start the dev server and sign in as a member of a seeded group who has no
   attached email and has contributed, so the sheet is live.
2. Add a temporary `console.log` in `page.tsx` that prints on every server
   render.
3. From the group home, navigate to group info and back, using the in-app
   controls. Confirm the server log prints again.
4. Repeat with the browser's back button, and with a forward navigation after a
   back.
5. Remove the temporary log.

If any of those paths does not re-render on the server, **stop and report to
Jacob before writing any of tasks 1 to 6.** The fallback would be a
`staleTimes` configuration change, which is a framework-wide setting affecting
every page and is his call, not the build's.

Record what was observed, path by path, in the PR body.

### Task 1 — The decision function learns about the cooldown

File: `src/lib/auth/email-offer.ts`. Tests:
`src/lib/auth/__tests__/email-offer.test.ts`.

Write the tests first and show them failing before touching the module.

**Add to `ShouldOfferEmailInput`:**

```
/**
 * The moment the sheet was last put in front of this member, or null if it
 * never has been. Deliberately an instant handed in rather than a boolean
 * computed by the caller: the comparison belongs here, beside the seven-day
 * one, where a test can hold it, and the shape matches what a `User` column
 * would store if the cookie is ever replaced.
 *
 * The caller reads this from a cookie. This module never does, and must not
 * learn how it is stored.
 */
lastShownAt: Date | null
```

**Add a constant** beside `SECOND_ASK_MIN_WAIT_MS`, and **export it**:

```
export const ASK_COOLDOWN_MS = 24 * 60 * 60 * 1000
```

It is exported for one reason, which should be stated in a comment beside it:
the cookie's `max-age` in task 2 is the same duration, and two places each
holding their own `24 * 60 * 60 * 1000` is how they end up disagreeing. The
product rule lives here, next to the decision it governs; the cookie module
imports it. `SECOND_ASK_MIN_WAIT_MS` stays unexported, because nothing outside
this module has any business knowing it.

**Add an exported predicate**, shaped like the existing `emailAskIsSettled`:

```
export function emailAskIsSnoozed(lastShownAt: Date | null, now: Date): boolean
```

Returns false when `lastShownAt` is null; otherwise true when
`now - lastShownAt < ASK_COOLDOWN_MS`.

It exists for the same reason `emailAskIsSettled` does: so `page.tsx` can skip
work whose answer cannot matter, without re-implementing the rule. **It is
exported so there is exactly one definition of the cooldown, used by both the
page's skip and the decision below.** Like `emailAskIsSettled`, it is allowed to
be conservative and is never allowed to be wrong in the other direction.

**Wire it into `shouldOfferEmail`**, as an early return placed after the
`hasVerifiedEmail` and `emailAskCount >= 2` checks and before the count
branches. Order matters and should carry a comment: a member who has attached an
address or spent both asks is settled forever, and the cooldown is a temporary
state, so the permanent answers are read first.

**Amend the module's own header comment and `shouldOfferEmail`'s doc comment.**
The existing text says "there is no bound here on how many times 'first' or
'second' can be returned," which stops being true in this narrow sense. It must
be corrected rather than left to mislead, and the correction must say what is
still true: the counter is still not an impression counter, the cooldown is a
separate and temporary thing, and neither reads the other.

**Tests to write (all failing first):**

- Never shown (`lastShownAt: null`), count 0, has contributed → `"first"`.
  Proves the new input does not break the existing path.
- Shown ten minutes ago, count 0, has contributed → `null`.
- Shown exactly 24 hours ago → `"first"`. Pins the boundary as inclusive.
- Shown 25 hours ago → `"first"`.
- Shown in the future (a skewed device clock) → `null`. Documents that a future
  timestamp reads as snoozed rather than as expired.
- Count 2 and shown ten minutes ago → `null`, and count 2 and never shown →
  `null`. Proves the settled check still wins and the cooldown did not become a
  way back in.
- `hasVerifiedEmail: true` with every cooldown combination → `null`.
- The full existing second-ask matrix (7 days elapsed, contributed since),
  re-run with `lastShownAt: null`, unchanged. Then the same matrix with a fresh
  `lastShownAt` → `null`, proving the cooldown gates the second ask too.
- `emailAskIsSnoozed` directly: null, just now, boundary, past, future.

Every existing test in this file must keep passing; they will need the new
required field added. **Adding `lastShownAt: null` to an existing case is not a
change to what that case proves** and should be done mechanically.

### Task 2 — The cookie: name, format, parser, writer

New file: `src/lib/auth/email-ask-cooldown.ts`. New tests:
`src/lib/auth/__tests__/email-ask-cooldown.test.ts`.

Write the tests first and show them failing.

This module is the only place that knows the cookie exists. It holds four
things:

**The name.** `export const EMAIL_ASK_SHOWN_COOKIE = "ipg_email_ask_shown"`.

**The format.** Epoch milliseconds as a decimal string. Nothing else; no JSON,
no group id, no user id. A cookie a member can read and edit is fine here,
because the worst a forged value can do is silence an optional nudge on that
person's own device for a day.

**The parser**, pure and exported:

```
export function parseEmailAskShown(raw: string | undefined): Date | null
```

Returns null for: `undefined`, the empty string, a non-numeric string, `NaN`,
a non-finite number, and a value at or below zero. Returns a `Date` otherwise.
**Every unreadable case resolves to null, which means "not snoozed", which means
the sheet shows.** That direction is deliberate and must carry a comment: a
parser that failed the other way would silence Orbit permanently on a corrupted
cookie, and nobody would ever find out.

**The writer**, client-only, exported:

```
export function markEmailAskShown(now: Date): void
```

It sets `document.cookie` to `EMAIL_ASK_SHOWN_COOKIE=<now.getTime()>` with:

- `path=/` — the cookie is per person, not per group or per page.
- `max-age` derived from `ASK_COOLDOWN_MS`, imported from `email-offer.ts`
  (`ASK_COOLDOWN_MS / 1000`), never a second literal. Garbage collection only:
  **the timestamp in the value is the authority, not this.** Comment why both
  exist: if the device clock is ahead of the server's, `max-age` expires the
  cookie early and the sheet shows early; if behind, the cookie lingers and the
  timestamp still governs. Both directions fail toward showing, which is the
  safe one.
- `SameSite=Lax`.
- `Secure`, **only when `location.protocol === "https:"`**. This is
  load-bearing and not optional polish: phone QA runs against the Mac's LAN
  address over plain http (see `allowedDevOrigins` in `next.config.ts`), and an
  unconditional `Secure` means the browser silently refuses to store the cookie
  there, so the fix would appear not to work on the exact device it is being
  tested on.

**`now` is passed in, never read here**, for the same reason every other
decision in this codebase takes its clock as an argument, and for a second
reason specific to this slice: the caller passes the **server's** render clock,
which the component already receives as a prop. That removes device-clock skew
from the stored value entirely. Say so in the comment.

**Tests:** every parser case above; and the writer, in jsdom, asserting the
cookie is readable back, that the value round-trips through the parser to the
same instant, and that `Secure` is absent on `http:`. Cookie attributes other
than the value are not readable back from `document.cookie`, so assert the
writer's behavior by asserting on the string it assigns, via a spy on the
`document.cookie` setter.

### Task 3 — The page reads the cookie and passes it down

File: `src/app/groups/[id]/page.tsx`.

Import `cookies` from `next/headers` and read
`EMAIL_ASK_SHOWN_COOKIE` through `parseEmailAskShown`. **This adds no
dynamic-rendering cost**: the page already reads cookies through
`getCurrentUser`, so it is already dynamic. Say so in a comment, so nobody
"optimizes" it away later believing it forces dynamic rendering.

Two changes:

**a. Join the existing skip.** The block at roughly line 102 already skips
`loadEmailAskInputs` (three table reads on the product's slowest screen) when
`emailAskIsSettled`. Add `emailAskIsSnoozed(lastShownAt, now)` to that
condition. This is safe in the same conservative direction: snoozed can only
mean no ask, so no value those three reads could return would change the
outcome. The comment above that block already explains the rule and should be
extended rather than replaced.

**b. Pass `lastShownAt` into `emailAsk`**, alongside `askState` and the rest.

**One `now`, declared once, near the top beside the cookie read.** Today this
file calls `new Date()` in two places for two purposes; the skip check at line
~102 and the `emailAsk` prop at line ~257 must use the *same* instant, or a
render that straddles the cooldown boundary can skip the contribution reads as
snoozed and then hand the component a `now` that says otherwise. Hoist it and
use it for both. Leave the unrelated `new Date()` passed to
`findUpcomingEvents` alone; that one is not part of this decision.

**Do not call `shouldOfferEmail` here.** The decision stays in the component,
where a test can reach it; that is the existing arrangement and this slice does
not change it.

### Task 4 — Thread the prop through to the sheet

Files: `src/app/groups/[id]/GroupHome.tsx` (types only; it spreads
`EmailAskNoteProps` through untouched) and
`src/app/groups/[id]/EmailAskNote.tsx`.

Add `lastShownAt: Date | null` to `EmailAskNoteProps` with a doc comment saying
it arrives from the server so that the same value is present on the server
render and on hydration. **That is what stops the sheet appearing and then
vanishing**, and it is the reason the component must never read the cookie
itself for the decision. Say it there, because that is where somebody would be
tempted.

Pass it into the existing `shouldOfferEmail` call.

### Task 5 — The sheet writes the cookie when it appears

File: `src/app/groups/[id]/EmailAskNote.tsx`.

Add an effect that calls `markEmailAskShown(now)` when `showing` becomes true.
It can sit in the existing focus-and-scroll-lock effect, which already keys on
`showing`, or in its own; **its own is preferred**, because that effect's
cleanup returns borrowed things and this write is not borrowed and must not be
undone on close.

Notes for the implementer:

- `now` is the server render's clock, arriving as a prop. Use it, not
  `new Date()`.
- The write is intentionally **not** in any of the exit handlers. All four exits
  are already covered because the write happened on show. Do not add a second
  write "to be safe"; two write sites is how the two drift apart.
- `handleLeaveQuietly`, `handleDecline` and `onDone` are all left exactly as
  they are. `handleDecline` still calls `dismissEmailOfferAction`, which still
  advances the lifetime counter, and that is the only thing that does.
- React's development StrictMode runs effects twice. The second write is the
  same value to the same cookie and is harmless; do not add a guard for it.

**Amend the component's header comment.** The "WHAT EACH WAY OUT COSTS" table is
now incomplete in a way that would actively mislead: every row still reads
correctly about the *lifetime asks*, and every row is now also "and Orbit waits
a day before asking again." Rewrite the table with a second column rather than
editing the first, so the asymmetry the original comment calls deliberate is
still visible, and add a short paragraph naming the on-show trigger, the back
gesture it exists to cover, and a pointer to this spec.

**Tests** in `src/app/groups/[id]/__tests__/EmailAskNote.test.tsx`, written
first and shown failing:

- Renders with a live offer → the cookie is written, carrying the `now` prop's
  instant.
- Renders with `hasVerifiedEmail: true` (so the gate returns null and nothing
  shows) → nothing is written. **This is the important one**: it proves the
  write is tied to the sheet actually appearing, not merely to the component
  mounting.
- Renders with a fresh `lastShownAt` → nothing shows and nothing is written.
- After tapping "Not now" → the cookie is still there, and
  `dismissEmailOfferAction` was still called. Proves the two mechanisms are
  independent.
- After tapping the scrim, and after pressing Escape → the cookie is still
  there.

The existing tests in this file, particularly the ones holding the free-exit and
expensive-exit asymmetry, must keep passing untouched. If one of them needs
changing, that is a signal to stop and re-read, not to change it.

### Task 6 — Verify it in a browser, then hand over a phone script

Not a test, and not optional.

1. On a seeded group with a member who has contributed and has no email:
   confirm the sheet appears.
2. Tap the scrim. Navigate to group info and back. **The sheet does not appear.**
3. Confirm the cookie exists in devtools with the expected name and a plausible
   value.
4. Delete the cookie. Reload. **The sheet appears again**, proving the cookie is
   what is doing the work and not some other state.
5. Repeat step 2 using the browser's back button rather than in-app navigation,
   which is the path task 0 exists to have already cleared.
6. Confirm the group info page's permanent email row is unaffected and still
   offers to attach an address.

Take screenshots of steps 2 and 4.

Then write the PR's manual QA script for Jacob, five minutes or under, per
`~/.claude/checklists/pr-handoff.md`. It must cover, on a real phone, the two
things no automated test in this repo reaches: **tapping outside the sheet then
returning to the group**, and **leaving with the phone's back gesture then
returning**. Both should now be quiet. Seed the state, put the dev server's run
command in a `bash` block, and give him working links in order.
