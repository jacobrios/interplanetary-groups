# The refresher stops piling up

*Micro-slice document. Written 4 September 2026, before any code. A production
regression caused by the chat-sync slice that shipped this morning.*

## What happened

The owner's wife sent five or six messages from her phone. He opened his own
phone to a Safari tab that had been sitting on the group home. **Nothing
arrived, and the whole app was dead:** no card taps, no navigation, no group
info, and messages he typed never reached the server. Reloading the tab fixed
it. The same app open as a standalone home-screen instance worked fine, which is
a separate browser instance with its own state.

**This is worse than the bug it replaced.** A stale room is annoying; an app
that silently swallows messages while looking alive is not.

## The mechanism, and it was predicted

The whole-branch review of the chat-sync slice recorded exactly this as debt:

> No in-flight backpressure. If a server render ever exceeds 10s, ticks keep
> firing and overlapping RSC requests accumulate.

The same review established the other half: **Next dispatches every server
action and every refresh through one strictly serial queue.** So refreshes that
outlast their own interval stack up in that queue, and every RSVP tap, every
navigation and every send queues behind them. The page stays interactive-looking
because the optimistic layer still draws, but nothing reaches the server. A
reload discards the queue, which is why it cured it.

**Confidence: high on the shape, not proven by reproduction.** A frozen queue is
hard to reproduce on demand, and the fix is worth making on the strength of the
predicted-and-then-observed match alone. If it recurs after this, the assumption
to re-examine first is that the queue is what wedged.

## Settled, do not relitigate

1. **Never start a refresh while one is still in flight.** This is the whole
   slice.
2. **A tick that arrives while one is in flight is DROPPED, not queued.** No
   catch-up burst. A tab that slept through fifty ticks owes exactly one
   refresh, not fifty. This is the half that matters for the reported case.
3. **Everything else stays**: visible-only polling, the tab-return refresh, the
   coalescing window, and `paused` during a send. None of those are the bug and
   all are already reviewed.

## Non-goals

Reverting the chat-sync slice. Changing the ten-second interval. The
standalone-web-app blank screen, queued separately.

## How this is verified

**Tested in vitest:** a tick that lands while a refresh is in flight fires no
second refresh; once the in-flight one settles, the next tick does fire; a long
gap produces exactly one refresh rather than one per missed tick. Each proven by
mutation, not by a green run.

**Deliberately not tested:** that the real queue actually unblocks on a real
phone. That is the owner's QA, and it is the only place the fix can really be
confirmed, because the failure it prevents is a browser-level queue this suite
cannot construct.

## Debt

The suite still cannot reproduce the failure this slice exists to prevent, only
the guard against it. That limit is the same one the chat-sync slice carried and
it is not closed here.

---

# Tasks

## Task 1 — in-flight backpressure

`src/app/groups/[id]/LiveRefresh.tsx`. Read its whole header first; it is long
and every paragraph in it is load-bearing.

Add one property: **at most one refresh in flight at a time.** A trigger that
arrives while one is outstanding does nothing at all — it does not queue, and it
does not schedule a catch-up.

**On the mechanism, and this is the part to think about rather than reach for.**
`router.refresh()` returns `void`, so there is no promise to await. The obvious
way to observe completion is React's `useTransition`, whose pending flag covers
the RSC fetch. **Before using it, check two things and report on both:**

- `GroupHome.tsx`'s header carries a standing warning not to re-add a
  `useTransition` believing it fixes a timing problem. That warning is about the
  SEND path in that file, not about this component, so it probably does not
  bind here — but say explicitly why it does not, rather than ignoring it.
- The chat-sync slice established that `useOptimistic` holds an optimistic
  entry until **all** router-level transitions settle, which is the whole reason
  `paused` exists. Confirm that wrapping the refresh in a transition here does
  not lengthen that hold and reintroduce a member's own message being drawn as
  unsent — the exact regression a previous slice measured down from 6.2s to
  1.3s. If it does, use a different mechanism.

If you find a simpler correct mechanism than a transition, take it and say why.

**Do not** change the interval, the visibility gating, the focus handler, the
coalescing window, or `paused`. **Do not** touch `GroupHome.tsx`.

Tests: extend `src/app/groups/[id]/__tests__/LiveRefresh.test.tsx`. Model a
refresh that does not settle immediately and prove a tick during it fires
nothing; prove the next tick after it settles does fire; prove a long stall
yields one refresh, not a burst. For each, break the guard, confirm red,
restore, confirm green, and report what you saw.

Run only the tests reaching what you touch, not the full suite.
