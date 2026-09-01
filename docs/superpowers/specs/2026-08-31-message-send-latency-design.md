# Message send latency, slice one: give the message back

*Branch `message-send-latency`, cut from `main` at `f698f6b`. Written 31 August 2026,
after the measurement and before any product code.*

---

> **AMENDMENT, 31 August 2026, written after the build and left at the top on
> purpose. THE ROOT CAUSE NAMED BELOW IS WRONG.** This document says the member's
> message stayed greyed because Orbit's read was dispatched inside the send's
> transition, and prescribes fixing the dispatch site. Measured in a browser,
> that was false three times over: dispatching outside every transition changed
> nothing, dispatching from an effect changed nothing, and removing the
> `useTransition` changed nothing. A component test said the third one worked and
> the browser said it did not, because the test mocks the server actions and a
> real one behaves differently.
>
> The actual cause: Next dispatches every server action inside a router-level
> transition, and `useOptimistic` holds its optimistic entry until all of those
> settle. Merely calling `detectIntentAction` held it. What shipped instead is
> that the entry stops being *drawn* as sending when the send's own promise
> resolves, leaving React to release it whenever it likes.
>
> The document is left otherwise unedited, per the append-only rule, because the
> gap between it and `build-notes.md` §11 is the useful record: this is what
> careful reasoning about the code produced, and it was wrong.

---

## For the owner

**Settled, do not relitigate.** The optimistic-update pattern stays. Orbit reads every
member message *after* the send settles and never inside it. Everything renders in the
group's timezone. Chat body stays at `--type-body`. Two decisions the owner made on 31
Aug: this is **two slices, keyboard first**, and the chat input is **never disabled**,
because your message is already on screen and the field is already cleared, so disabling
only blocks you.

**Non-goals, each with a home.** Making the send itself faster (parallel queries, one
identity check per request, a bounded history query) is **slice two of this pair**.
Replacing `revalidatePath` with something lighter than a full page re-render belongs with
slice two or its own slice, not here. Orbit's model latency is out of scope entirely.
Site health monitoring stays queued where CLAUDE.md left it.

**How this is verified, written before any code.** Component tests in jsdom with the
server actions mocked, each written first and shown failing: the input is never disabled;
the send's pending window is not extended by Orbit; Orbit is still dispatched with the
right message id; the Orbit-down note still surfaces; two sends in flight both reach the
server. Then a re-measurement with the same browser instrument that produced the before
numbers, in a local production build. **Deliberately not covered by tests:** the real
revalidation round trip (the suite cannot reach a server-rendered page) and the iOS
keyboard, which only the owner's phone can settle.

**Debt this slice expects to open.** The faded window will still last as long as the send
itself, which is slice two's problem, not a failure of this one.

---

## What was measured, and what it proved

All numbers below are from a **local production build** (`next build` + `next start`),
driven in a real browser, against the dev-test database. The link from this laptop to
that database is roughly 200 ms per round trip; on Vercel the function sits beside the
database at nearer 5-15 ms. So the *server* half of every figure here is inflated
relative to production. **The model call is not**, and that turns out to be the point.

### The recorded diagnosis is wrong, and the measurement says so plainly

Audit finding F-6-2, confirmed on the owner's phone on 25 Aug, says a six-message group
takes three to four seconds to send "because the app reloads the entire chat history and
re-renders twice per send."

`scripts/measure-group-home.ts` replays the group home's exact query sequence at growing
message counts. Median of five passes, warm-up discarded:

| messages | one render | the "whole history" query | history shipped to the phone |
|---:|---:|---:|---:|
| 6 | 1177 ms | 146 ms | 1.4 KB |
| 50 | 1223 ms | 158 ms | 11.2 KB |
| 200 | 1335 ms | 230 ms | 44.9 KB |
| 500 | 1378 ms | 350 ms | 112.4 KB |

At six messages the unbounded query is **12% of the render**, and growing the conversation
from 6 to 500 messages makes a render **17% slower**, not several times slower. The
mechanism the audit named cannot produce the symptom the owner felt, because at six
messages there is essentially no history to reload. The query is a real problem that will
matter later. It was never this one.

Two smaller corrections to the record, from reading the code:

- **"Re-renders twice per send" is true only when Orbit speaks.** `detect-intent.ts`
  returns early on every quiet path, before its `revalidatePath`. An ordinary message
  Orbit ignores costs one re-render, plus a full model call whose answer is discarded.
- **A send costs seven identity checks**, not one. `supabase.auth.getUser()` runs in the
  proxy, twice inside `sendMessageAction` (once directly, once inside `getCurrentUser`),
  and again in each page render, across both requests. Nothing caches it; there are 19
  call sites. It is a real network call, measured at 180-330 ms warm and 1250 ms cold
  from this laptop, confirmed by timing a deliberately invalid token and getting a 403
  back from the server rather than a local rejection.

### What is actually wrong

**The member's own message paints instantly and then sits looking unsent.**

`MessageFeed.tsx:207` renders a message carrying `isPending` at `opacity: 0.65`. The
optimistic entry carries it. `useOptimistic` holds that entry until the transition that
created it settles. Three samples, measured by reading the rendered opacity of the
member's own bubble:

| | message appears | at opacity | turns solid | input released |
|---|---:|---:|---:|---:|
| sample 1 | 16 ms | 0.65 | **6194 ms** | 6194 ms |
| sample 2 | 6 ms | 0.65 | **6484 ms** | 6484 ms |
| sample 3 | 19 ms | 0.65 | **5034 ms** | 5034 ms |

So the message is on screen in under 20 ms and then reads as *not sent yet* for five to
six and a half seconds. That is what "sending takes three to four seconds" is.

**Orbit is what holds it, which the code says is impossible.** `GroupHome.tsx:81-91`
carries a comment stating the detection transition's pending flag "is deliberately
dropped on the floor and never reaches ChatInput's `disabled`", and calls that "the whole
architecture of this slice." It is not true in practice. `startDetection` is called from
*inside* `startTransition`'s async callback, so React treats the two as one scope and the
outer `isPending` stays true until Orbit's request finishes.

Proved with a two-arm experiment in one build, on one server, back to back, toggled at
runtime so nothing else differs:

| arm | input dead for |
|---|---|
| **A — as it ships today** | 5998 / 7472 / 5306 ms |
| **B — Orbit's read switched off** | 4375 / 4312 / 2902 ms |

The causal signature is tight rather than merely correlated: in arm A the input came back
**6 ms after Orbit's request completed** (released 5998, request ended 5992). In arm B,
with no Orbit request at all, it came back about a second after the send's own request
ended, which is the client re-render. The experiment was reverted; nothing from it ships.

**Why this matters more on production than these numbers suggest.** Everything in the
send half gets much cheaper when the function sits beside the database. The model call
does not get cheaper at all. So the share Orbit holds is larger on the owner's phone than
it is here, not smaller.

---

## The change

Two edits, one root cause.

### Task 1 — the failing tests, first

`src/app/groups/[id]/__tests__/GroupHome.test.tsx`, new, jsdom, both server actions
mocked in the style of `src/components/__tests__/RsvpControls.test.tsx`. Each test is
written and shown failing before Task 2 or 3 touches product code. `detectIntentAction`
is mocked as a **deferred promise the test resolves by hand**, which is what makes "the
send finished but Orbit has not" an observable state rather than a race.

1. **The input is never disabled.** Submit a message; while the send is still in flight,
   assert `input[name=body]` is not disabled. Fails today.
2. **Orbit does not extend the send's pending window.** Resolve the send, leave detection
   deferred, and assert the send's transition has settled: the optimistic pending copy is
   released even though Orbit is still working. Fails today.
3. **Orbit still runs, with the right message id.** Guards against "fixed it by deleting
   the feature." Passes today and must keep passing.
4. **The Orbit-down note still surfaces.** A detection resolving `unavailable` still
   renders `OrbitDownNote`. This is the one thing the sender is told, and it is the thing
   a careless un-entangling would drop. Passes today and must keep passing.
5. **Two sends in flight both reach the server.** The behavior the owner chose when he
   said never disable the input. Fails today, because the second send cannot be typed.

Tests 3 and 4 pass today. Per the standing rule that a passing test is only evidence if
it could have failed, each is confirmed by breaking the code deliberately once and seeing
it red, and that confirmation is reported, not assumed.

### Task 2 — un-entangle Orbit from the send

`src/app/groups/[id]/GroupHome.tsx`. The contract, which is what the test holds:
detection must not extend the send's pending window, **and** Orbit must still start as
soon as the message id exists rather than waiting for the send's transition to settle.
Both halves matter; satisfying only the first would push Orbit's reply about two seconds
later on a slow send.

**Recommended mechanism:** capture the action's promise in `handleSubmit`, chain
detection off it *outside* every transition, and let the transition await the same
promise for its optimistic bookkeeping. Registering the continuation outside any
transition is what leaves the scope.

**Fallback if that still entangles:** record the message id in state inside the
transition and dispatch detection from a `useEffect` keyed on it, which unambiguously
runs outside the transition. The cost is that Orbit starts when the send settles rather
than when it resolves, so the fallback is second choice, not equal.

**Which one ships is decided by measurement, not by reading.** Test 2 gates it, and the
re-measurement in Task 4 confirms it on a real browser. The comment block at lines 81-91
is rewritten to describe what the code now actually does, since it currently documents an
architecture the product does not have.

### Task 3 — stop disabling the input

`src/app/groups/[id]/ChatInput.tsx`. Remove `disabled={isPending}` from the text input
(line 99) and drop `isPending` from the send button's guard (line 118), where `!hasText`
already does the real work: the field is cleared on submit, so the button is already
inert until the member types again.

`isPending` then has no reader in this component, so **the prop is removed from the
interface** rather than left dangling. That is deliberate: a boolean sitting unused on a
props interface is an invitation to re-wire it to `disabled`, which is the bug this slice
exists to remove. `GroupHome` stops passing it.

One consequence to handle in the same task: with rapid consecutive sends now possible,
the optimistic key `optimistic-${Date.now()}` can collide for two sends in the same
millisecond. It becomes a monotonic counter, because this slice is what makes the
collision reachable.

### Task 4 — re-measure, and record the after numbers

Re-run the browser instrument against a fresh local production build, same method, same
three-sample shape, reporting `appeared / opacity / turns solid / input released`. The
before table above is the comparison. `scripts/measure-group-home.ts` is re-run unchanged
so slice two has a clean baseline to move.

**What the after numbers will and will not show.** The faded window should collapse from
the full six seconds to the send's own duration, which on this link is roughly three
seconds and on production much less. It will not reach zero, and saying so is the point:
what remains is slice two's, and this slice must not be reported as having fixed it.

### Task 5 — the records

A `build-notes.md` §11 entry carrying the measurement, the falsified diagnosis, the
two-arm experiment, and the corrections to F-6-2's claims. CLAUDE.md's current-state
section updated, including the fact that the "input never waits on Orbit" architecture
claim was false from the day it was written. The PR body per the standing rule, with the
review report and the test numbers before and after.

**One thing the record must carry rather than bury:** F-6-2 was marked *confidence:
certain* and was confirmed on a real phone, and it was still wrong about the cause. The
symptom was real, the mechanism was assigned to it by reading rather than by measuring,
and it survived two weeks and a ranking decision that way.

---

## Risks, and what is deliberately accepted

- **Two messages in flight at once.** Now reachable. Each send is independent server-side,
  and concurrent detections are already guarded: `Gauge.sourceMessageId` is unique, and
  the spark path refuses a second gauge for an activity already being gauged or already
  on the calendar. Accepted rather than defended against further.
- **The suite still cannot see the revalidation round trip**, because it cannot render a
  server component that talks to the database. Tests hold the client contract; the browser
  measurement and the owner's phone hold the rest. Named, not papered over.
- **The iOS keyboard claim is a hypothesis.** Disabling a focused input on iOS dismisses
  the keyboard and re-enabling does not restore it, which would make the dead window feel
  worse than its duration. This cannot be tested from here. Removing `disabled` makes it
  moot either way, so the slice does not depend on the hypothesis being right.
