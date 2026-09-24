# Chat sync: the group home updates itself

*Slice document. Written 4 September 2026, before any code, after a design
conversation with the owner that settled seven decisions.*

## Settled, do not relitigate

Found in the owner's first two-person QA, 3 Sept 2026: a second person joined,
posted twice, and Orbit answered them, while his own open tab showed an empty room
until he reloaded. Nothing in this product updates an open page. There is no
polling, no socket, no realtime subscription, and no refetch on focus; the
search for all four returned nothing. `revalidatePath` invalidates the server
cache for the *next request* and pushes nothing to anyone.

1. **Poll, do not push.** Supabase Realtime Broadcast is the better end-state
   and is deliberately declined now: it would ship the anon key to browsers for
   the first time and needs channel authorization that fails open and silent.
   Revisit when members chat live rather than coordinate.
2. **Two triggers:** the tab becoming visible or regaining focus, and a timer
   while visible.
3. **Ten seconds**, no backoff. Visible-only is correctness, not tuning.
4. **Refresh the whole screen**, not just the chat: chip votes and RSVPs post no
   message, and a called-off plan must never keep reading as on.
5. **Failure is silent.** No banner, no error. Try again next tick.
6. **No indicator of any kind.** Anti-clutter; content simply appears.
7. **Group home only.** Event detail and group info are opened and left.

Dropped during the conversation: a cheap "anything new?" endpoint. At eight
members a plain refresh is affordable, and the endpoint is a lever to pull if
cost ever appears.

## Non-goals

Realtime push (above). Any other screen (decision 7). The unbounded message
query, which polling makes more expensive and which is its own queued slice,
triggered at 200 messages. A cap or "load older" control belongs there too.

## How this is verified

The suite cannot render these screens: they are server components talking to a
database, which is why this repo has never had a screen test. So the split is
deliberate and stated before any code.

**Tested in vitest:** the refresher component alone, at its seam. It refreshes
on an interval; it does not while the document is hidden; it refreshes when
visibility returns; it does not while a send is in flight; it clears its timer
on unmount; a rejected refresh never escapes to an error boundary. Each proven
by mutation, not by a green run.

**Proven in a browser, because no test here can:** an open group home picking up
a message it did not send, with no reload. This fails today, which is what makes
it evidence.

**Deliberately not tested:** that ten seconds is the right interval, and that
this feels right on a real phone. Both are the owner's QA, on two devices.

## Debt this opens

Every visible tab now costs a full server render every ten seconds: roughly
eight sequential queries plus about seven Supabase identity checks. Affordable
at this size and unmeasured at any other; the poll cost is worth measuring
rather than assuming, and this project has been burned once already by a
confidently-reasoned mechanism that was wrong. The connection pool is the
resource to watch, not compute.

---

# Tasks

## Task 1 — `LiveRefresh`, the component and its tests

New file `src/app/groups/[id]/LiveRefresh.tsx`, modelled closely on
`SeenMarker.tsx` in the same directory: renders `null`, owns one concern, has
its own test seam. Read `SeenMarker` first; its header explains why this is a
component rather than an effect inside `GroupHome`, and that reasoning applies
here unchanged.

Behaviour:

- On mount, start an interval of **10000ms**. Each tick calls
  `router.refresh()` from `next/navigation`.
- **Only while the document is visible.** Check `document.visibilityState`
  before each tick, and listen for `visibilitychange`. Becoming visible
  refreshes immediately, then resumes the interval. Becoming hidden stops it.
- Also refresh on `window` `focus`, which fires in cases `visibilitychange`
  does not.
- Accept a `paused` prop. While true, no refresh fires, including the
  visibility-return one. See Task 2 for why this exists.
- Clear the interval and remove both listeners on unmount. A dangling timer is
  not hypothetical here: one in `ShareInviteLink.tsx` blocked a safety-net hook
  on 1 Sept 2026.

**The catch is load-bearing and is this file's job.** `SeenMarker`'s header and
`GroupHome`'s `detectIntentAction` call both explain the same failure: a
rejected promise inside a transition reaches `src/app/error.tsx` and replaces
the whole screen with "Something broke on our end." A member on a lift with no
signal must see a slightly stale room, which is decision 5. Wrap accordingly and
swallow.

Tests in `src/app/groups/[id]/__tests__/LiveRefresh.test.tsx`, with fake timers
and a mocked `useRouter`. One test per bullet above. Prove each is non-vacuous
by removing the thing it guards and watching it go red; a green run is not
evidence. Note this repo runs vitest with `globals` off, so import
`describe/it/expect` by name, and `vitest.setup.ts` already handles Testing
Library cleanup.

## Task 2 — Wire it into `GroupHome`

Mount `<LiveRefresh />` beside `<SeenMarker />`. It renders for any viewer of
the group home, member or not; the members-only wall upstream already decides
who reaches this screen at all.

**`paused` is the whole risk of this slice and must not be hand-waved.** From
the message-send-latency slice (31 Aug 2026, build-notes §11): Next dispatches
every server action inside a router-level transition, and `useOptimistic` holds
its optimistic entry until **all** such transitions settle. `router.refresh()`
is one. So a refresh landing mid-send can hold the member's own message drawn
as unsent for longer than it should, which is the exact symptom that slice
existed to remove. Pass the send-in-flight state as `paused` so no refresh
overlaps a send.

Do not re-add a `useTransition` anywhere here believing it fixes something, and
do not touch `settledSends`. That file's header says why, at length, and both
were measured rather than reasoned.

## Task 3 — Verification, and it is not a subagent's

Run by the coordinator, because it needs a browser and the dev-test database.

1. Start the dev server via `.claude/launch.json`'s **`dev-webpack`** entry.
   Turbopack refuses a worktree's `node_modules`, which is why that entry
   exists.
2. Open a group home at 375x812.
3. With the page untouched, insert a message into that group directly in
   dev-test via a throwaway script. **Before the change this must not appear.**
   That is the failing test.
4. With the change, it appears within ten seconds, no reload.
5. Send a message from the page while a refresh is due, and confirm the bubble
   does not linger drawn as unsent.
6. Scroll up in the feed, let a refresh land, confirm the view does not jump.
7. Stop the dev server.

Full suite before and after; the baseline is recorded in the PR body.
