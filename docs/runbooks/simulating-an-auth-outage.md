# Simulating a Supabase auth outage

Written 15 September 2026, supabase-auth-soft-fail slice. It exists because the
obvious way to do this reads green while proving nothing, and somebody will
reach for the obvious way again.

## The trap, first, because it is the whole point

Pointing `NEXT_PUBLIC_SUPABASE_URL` at an arbitrary dead host does **not**
simulate an outage. Supabase derives its cookie storage key from the URL's first
hostname label, so the client goes looking for `sb-<that-label>-auth-token`.
Move the URL to a different host and the cookie it wants is a cookie nobody ever
wrote. It finds no session, short-circuits with **no network call at all**, and
reports "signed out".

What you see then is the members-only wall, which is the exact symptom of the bug
this slice fixed. It looks like the fix failed. It did not; the test never reached
the code.

This slice's first browser pass produced precisely that, and it is the same trap
the health probe's throwaway JWT exists to avoid, hit twice by different routes.

## The working form

Keep the first hostname label equal to the real project ref, so the cookie name
still matches, and point it somewhere nothing is listening.

    http://pxbewardwvoyqqcvogel.localhost:65535

`pxbewardwvoyqqcvogel` is the dev-test project ref, the one `npm run db:which`
prints. `*.localhost` resolves to the loopback address, and 65535 is closed, so
the connection is refused instantly.

**Port 65535 rather than a low port.** Node's fetch refuses the blocklisted low
ports itself, before dialling anything, which proves only that any fetch
exception is handled rather than that a real network failure is. If something is
ever listening on 65535, the run reports healthy where it should report broken,
which is loud rather than silent.

The launch config entry `dev-broken-auth-devtest` in `.claude/launch.json` starts
a dev server this way on port 3000.

## What to expect

- A member with a session gets `src/app/error.tsx`, "Something broke on our end."
- The server logs `[auth] the auth service did not answer AuthRetryableFetchError`
  followed by a thrown `AuthUnavailableError` from `getCurrentUser`.
- A visitor with **no** session cookie sees a completely normal front door. That is
  correct: with no cookie there is no network call, so nothing can fail.
- The session is not destroyed. Restore the real URL, tap "Try again", and the
  member is back in without signing in again.

## The other half, without a browser

`npm run qa:health -- --break-auth` runs the health check's probes with the
Supabase client pointed at the same closed port, and must fail at `supabase_auth`.
`npm run qa:health` with no flag must pass all four probes. Run both: a probe
seen failing but never passing may be failing for an unrelated reason, and a probe
seen passing but never failing is the vacuous probe this design exists to avoid.
