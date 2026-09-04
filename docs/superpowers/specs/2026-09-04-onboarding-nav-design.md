# Onboarding's exit lies, and it asks a returning founder for a name it already has

*Micro-slice document. Written 4 September 2026, before any code. Both defects
reported by the owner from production, with screenshots.*

## Settled, do not relitigate

**1. The exit goes to `/groups`.** `Step1Describe.tsx`'s "Never mind, take me
back" is hardcoded to `/`, and `/` is the session-aware front door: a member of
exactly one group is redirected straight into that group (`resolveFrontDoor`).
So the exit guesses, and for a member of one group it guesses wrong: they came
from the group list and are dumped into their existing group. `/groups` is
correct in every reachable case, because `/create` is reachable only from
`/groups` (a member) or from `/` (nobody with a group), and `/groups` redirects
a zero-group visitor to `/` on its own.

**2. The name field is prefilled and read-only for a founder we already know.**
Today it is an editable input, it gates the Continue button, and for a returning
user the typed value is **silently discarded**: `provisionFounderGroup` reuses
the existing `User` row and only writes `name` on the create branch. Worse, the
playback card renders the typed name back as "YOUR NAME", so a founder can type
Bob, watch Orbit confirm Bob, and create a group as Jacob.

Editable-and-saved was considered and declined by the owner. `name` lives on
`User`, not `Membership`, so an edit here would rename the person in every group
they belong to, retroactively, on every past message, from inside a screen about
starting a *different* group. Widest possible blast radius, no confirmation, in
a product already bitten once by identity going quietly wrong. A first-time
founder still gets the editable field; nothing changes for them.

## Non-goals

Name editing anywhere. It exists nowhere in the product and belongs on the group
info page or in the queued "founder can fix group details after creation" slice.
Accepted knowingly: a returning founder whose stored name is wrong sees it and
cannot fix it here.

## How this is verified

**Tested in vitest:** `resolveFrontDoor` is already tested and unchanged. Step 1
renders a read-only name for a known founder and an editable input for a new
one; Continue is gated on the description alone when the name is already known.
Each proven by mutation, not by a green run.

**Proven in a browser:** the exit from `/create` lands on `/groups` for a member
of one group, which is the reported bug and fails today.

**Deliberately not tested:** that the read-only treatment looks right. Nobody
drew this screen; it is invented, declared, and the owner's to judge.

## Debt

The name is fetched in the `/create` server shell and threaded through the
wizard purely to display it. If the wizard ever gains a second thing it needs
from the session, that thread wants a small viewer object rather than a second
scalar prop.

---

# Tasks

## Task 1 — the exit, and the prefilled read-only name

One task, because the two share the same file and the same browser pass.

**The exit.** In `src/app/create/Step1Describe.tsx`, the `Link` at the bottom
goes to `/groups` instead of `/`. Update the comment above it: it currently
explains why the exit is on step 1 only, which stays true, but says nothing
about where it goes or why. State that `/groups` is the fixed parent rather
than the session-aware front door, and that `/` would guess and guess wrong for
the member who actually got here.

**The name.** `src/app/create/page.tsx` is a server component. Read the session
with `getCurrentUser()` from `@/lib/auth/current-user` (returns the Prisma
`User` row or null) and pass `knownName={viewer?.name ?? null}` into
`OnboardingWizard`. Thread it to `Step1Describe`.

When `knownName` is non-null:
- Seed the wizard's `founderName` state with it, so every downstream consumer
  (the playback card's YOUR NAME row, the gap-ask, `createGroupAction`) keeps
  working unchanged and shows the true name.
- Render it as **text, not an input**, under the same "YOUR NAME" field label,
  in the field's own visual language. Nobody drew this; match the surrounding
  type scale and colors rather than inventing a new treatment.
- Do **not** render a disabled `<input>`. A disabled input reads as "editable
  but not right now" and invites a member to hunt for how to enable it.
- Continue must gate on the description alone.

When `knownName` is null, everything is exactly as it is today.

**Do not touch `provisionFounderGroup` or `createGroupAction`.** The discard is
correct behaviour once the field stops inviting an edit; the defect was the UI
promising something the write throws away.

Tests: extend the existing `src/app/create/__tests__/` tests. Cover the
read-only render, the editable render, and the Continue gate in both cases.
Mutation-prove each.

Run only the tests reaching what you touch, not the full suite.
