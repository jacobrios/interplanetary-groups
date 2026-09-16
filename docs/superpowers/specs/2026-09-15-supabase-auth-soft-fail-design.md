# The Supabase auth soft-fail

`getCurrentUser()` reads only the `data` half of `supabase.auth.getUser()` and drops the
`error` half, so a failing auth call is indistinguishable from "nobody is signed in". A
member is silently logged out onto the front door or the members-only wall, nothing
throws, and no probe touches Supabase. A green light over a product broken for every
member: the same shape as the four-day invisible outage of 28-31 August 2026.

## Settled, do not relitigate

- **The member sees the existing `src/app/error.tsx`.** `getCurrentUser()` throws; that
  screen already says "Something broke on our end... Try again", its retry is real, and
  its copy already fits a transient blip. Owner's call, 15 Sept 2026.
- **`unavailable` means `AuthRetryableFetchError` and nothing else** (network failure,
  Supabase 5xx). A 401 stays `signed-out`, because a rotated signing key and one
  member's legitimately expired cookie are byte-identical at the call site, and throwing
  an error screen at everyone whose session aged out is worse than the bug being fixed.
  **So a rotated key is not covered.** The headline claim is narrowed, not faked.
- **The classifier is its own seam**, shared by the product and the probe, so the two
  can never disagree about what "down" means.

## Non-goals

- ~~**The other thirteen `auth.getUser()` call sites.**~~ (Corrected 15 Sept 2026, final-fix
  pass: it is twelve, not thirteen, verified by `grep -rn "auth\.getUser(" src`. Eleven sit
  in `src/app/actions`: `remove-member.ts`, `rsvp.ts`, `leave-group.ts`,
  `reset-invite-link.ts`, `proposal-answer.ts`, `proposal-vote.ts`, `send-message.ts`,
  `gauge-vote.ts`, `create-group.ts`, `cancel-event.ts`, `join-group.ts`. The twelfth is
  `src/lib/supabase/proxy-session.ts`.) **The other twelve `auth.getUser()` call sites.**
  Real, and they wait; they belong in their own slice. `send-message.ts` is the one worth
  naming: its own call soft-fails first, so during an outage the composer says "You need
  to be signed in to send messages" rather than reaching `getCurrentUser()` at all.
  Misleading, visible, out of scope.
- **A dedicated degraded screen.** Weighed and declined: it needs a result type through
  eight pages and four actions to tell the member about a mechanism they do not care
  about.
- **A Supabase probe on any screen's render path.** The health check runs hourly; adding
  a per-render auth reachability check is a latency decision, not this slice's.

## How this is verified, written before the code

The load-bearing assumption is that the real library returns `AuthRetryableFetchError`
for a real network failure. **No mock carries it.** `scripts/qa-health.ts --break-auth`
points the Supabase URL at a closed port and gets a real error from the real client, the
same trick `--break` already uses for Prisma.

- **Tested:** the classifier's three outcomes, against error instances constructed from
  `@supabase/auth-js` itself rather than hand-rolled shapes; that `getCurrentUser()`
  throws on `unavailable` and returns null on `signed-out`.
- **Deliberately not tested:** the probe itself, following `realProbes()`'s own recorded
  rule. Mocking the Supabase client removes the only thing being checked. Its evidence
  is the script, both ways: failing under `--break-auth` and passing without it, which
  together prove it is not vacuous.
- **Seen in a browser:** a dev server with a broken Supabase URL, signed in, rendering
  the real error screen. CLAUDE.md's "a dev server cannot verify offline behaviour" rule
  does not bite here; that is the *browser* losing connectivity, this is the *server's*
  outbound call failing, which a dev server reproduces exactly.

## Debt this opens

- **One more alarm source.** A transient Supabase blip at the top of the hour raises an
  incident email. Same bargain the database probes already made, now with a dependency
  whose uptime we do not control.
- **The probe's throwaway JWT is a magic string.** It exists only to force a real network
  request, and a future reader may mistake it for a credential.
- ~~**The thirteen other call sites now diverge from this one.**~~ (Corrected 15 Sept
  2026: twelve, see the Non-goals correction above.) **The twelve other call sites now
  diverge from this one.** Until they are done, the product's answer to "is auth down"
  depends on which door you came through.

---

# Tasks

## Task 0: baseline

Recorded before anything landed: **1885 passing across 158 files** on `main` at `d5d93c8`,
zero failures. Cross-checked against the CI slice's finishing number in build-notes §11,
which is the same figure. No pre-existing failure to carry.

## Task 1: the classifier seam

New file `src/lib/auth/availability.ts`.

Export a type and a function:

```ts
export type AuthOutcome =
  | { kind: "signed-in"; user: SupabaseUser }
  | { kind: "signed-out" }
  | { kind: "unavailable"; detail: string }

export function classifyAuthReply(reply: {
  data: { user: SupabaseUser | null }
  error: AuthError | null
}): AuthOutcome
```

Rules, in order:

1. `reply.data.user` present → `signed-in`.
2. `isAuthRetryableFetchError(reply.error)` → `unavailable`. Import that predicate from
   `@supabase/auth-js`; do not re-implement it by checking `error.name`, because the
   library owns that string and we do not.
3. Anything else, including `AuthSessionMissingError`, `AuthApiError` 401/403, and a null
   error with a null user → `signed-out`. Today's behaviour, unchanged.

`detail` on `unavailable` carries the error's class name and message for the log line.
Reuse `describeError` from `src/lib/health/check.ts` rather than writing a second
truncator; it is already the project's privacy boundary for error text and its comment
explains why it trims the middle. If importing health into auth reads wrong to the
implementer, say so in the report rather than quietly duplicating it.

Also export `class AuthUnavailableError extends Error`, named so a future reader and the
log drain can both recognise it.

**Why a separate module rather than a helper inside `current-user.ts`:** the health probe
needs the same classification, and a probe that disagrees with the product about what
"down" means is worse than no probe. This is the same species as `src/lib/auth/email.ts`,
which CLAUDE.md already calls the stronger of the project's two claim-to-fact boundaries.
Say so in the file header, and point at it.

**Tests** (`src/lib/auth/__tests__/availability.test.ts`): one case per outcome.
Construct the errors from `@supabase/auth-js`'s own exports (`AuthRetryableFetchError`,
`AuthSessionMissingError`, `AuthApiError`), never as object literals with a `name` field.
A hand-rolled shape would pass while the real one failed, which is the exact class of
mistake this slice exists to stop. Prove each test can fail before you rely on it.

## Task 2: `current-user.ts` throws

Rewrite the body of `getCurrentUser()` to pass the whole reply through
`classifyAuthReply`.

- `signed-in` → the existing `prisma.user.findUnique` call, unchanged.
- `signed-out` → `return null`, unchanged.
- `unavailable` → `console.error("[auth] the auth service did not answer", detail)` then
  `throw new AuthUnavailableError(detail)`.

The log line matters as much as the throw: the Vercel log drain (after-launch item 16) is
what turns this into something anyone can see, and an unnamed stack is harder to grep than
a prefixed line. Match the `[group-seen]` / `[orbit-reconcile]` prefix style already used.

Update the function's doc comment. The current one says "or null if there is no active
session or no matching User row" and that is about to be only half true.

**Two things to state in the comment, because both will otherwise be re-derived:**

- **A visitor with no session cookie never touches the network.** `_getUser` short-circuits
  to `AuthSessionMissingError` before any request. So during a Supabase outage a stranger
  sees a normal site and only people who actually have a session see the error screen,
  which is the correct population.
- **The session is not destroyed.** Middleware writes cookies only when Supabase hands it
  refreshed ones, and `_removeSession()` fires only for a genuinely missing session, so a
  network failure clears nothing. "Try again" genuinely works once Supabase is back, with
  no re-login. This is what makes the chosen screen honest.

**Tests** (`src/lib/auth/__tests__/current-user.test.ts`, new): mock
`@/lib/supabase/server` so `auth.getUser()` returns each of the three shapes; assert the
user row, the null, and the throw. Mocking is legitimate here and it is worth saying why
in a comment: we are testing our own branch on a shape the library documents, not whether
a query still matches a database. The library's real behaviour is proven by task 4's
script instead.

## Task 3: the health probe

In `src/lib/health/check.ts`:

- Add `"supabase_auth"` to `HealthStep`.
- Add the probe to `realProbes()`, **last**. Order is load-bearing and already documented
  there: `user_row` stays first so a schema break names itself rather than surfacing
  behind a network blip.
- Make it injectable the way `client` already is, so task 4 can point it at a closed port.
  Follow the existing signature style; add a second optional parameter rather than
  restructuring the function.

The probe calls `supabase.auth.getUser(<a throwaway JWT string>)` and passes the reply
through `classifyAuthReply`. `unavailable` throws with its detail; **anything else passes**,
including the 401 the throwaway token will normally earn, because a rejection proves the
service is up and answering.

**This is the whole reason for the JWT and it must be in a comment.** Calling
`getUser()` with no argument, which is what the cron's cookie-less context would do,
short-circuits to `AuthSessionMissingError` without a single network request. That probe
would read green with Supabase completely down. Passing a JWT forces the real request.

Extend the `realProbes()` header comment's "DELIBERATELY UNTESTED" reasoning to cover this
probe too, and name `--break-auth` as its evidence.

Note in the file: the `@param client` comment already warns that the Prisma injection is
partial because `--break` fails at the first probe. This probe is last, so `--break-auth`
must reach it through healthy earlier probes; that is fine and intended, but do not let
the existing warning read as though it covers this one.

## Task 4: `--break-auth`

Add the flag to `scripts/qa-health.ts`, alongside `--break`, and document it in the file
header and in `package.json` if `--break` is documented there.

It runs the full probe list with the Supabase client pointed at a valid-shaped URL on a
closed port (`http://127.0.0.1:1`, matching `UNREACHABLE`'s reasoning for Prisma) and
prints the verdict. Expected: `ok: false`, `failedStep: "supabase_auth"`, with a detail
naming a fetch failure.

Keep `requireDevTest()` and `warnHeartbeatDestination()` applying exactly as they do to
the other flags. This flag must never combine with `--ping` without that warning.

**Run it both ways and put both outputs in the report**: with the flag (probe fails) and
without (probe passes against real dev-test Supabase). Neither run alone is evidence.
A probe that fails when broken but has never been seen passing might be failing for an
unrelated reason, and one that passes but has never been seen failing is the vacuous
probe this design exists to avoid.

## Task 5: the browser pass

Not a code task. Start a dev server with `NEXT_PUBLIC_SUPABASE_URL` pointed at
`http://127.0.0.1:1`, sign-in state already in the browser, and load a group home.

Expected: the `error.tsx` screen, "Something broke on our end." Confirm the front door
still renders normally in a fresh private window with no cookie, which is the finding that
a stranger is unaffected.

Restore the env and stop the dev server afterwards, per CLAUDE.md's standing rule about
stray servers.

Report what was seen. If the screen that appears is not `error.tsx`, stop and say so
rather than adjusting anything; that would mean the throw is being caught somewhere this
design did not find.

---

## Postscript, 15 Sept 2026 (final-fix pass)

This document is append-only; the following corrects rather than rewrites what is above.

**The port in Task 4 and Task 5 is wrong as written, and the build did not use it.**
Both tasks say `http://127.0.0.1:1`. The actual closed port used, under a ruling made
during the build and recorded in `scripts/qa-health.ts`'s own header comment, is
`127.0.0.1:65535`, not `:1`. Port 1 is on Node/undici's Fetch-spec "bad port" blocklist,
so `fetch('http://127.0.0.1:1')` is refused by the client itself before any TCP
connection is attempted; it still gets wrapped into `AuthRetryableFetchError` by
auth-js's generic catch, so `--break-auth` would still report `ok: false`, but it would
be proving only that "any fetch exception gets wrapped," not that a real network
failure does. An independent reviewer caught this during a fix round; it was not found
by writing the script. This section is the corresponding correction for this document's
own two `127.0.0.1:1` references above, left in place per the project's append-only rule
rather than silently edited to `:65535`.
