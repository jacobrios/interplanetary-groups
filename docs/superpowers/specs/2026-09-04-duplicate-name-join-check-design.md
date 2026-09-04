# The join-time duplicate-name check

*Slice document. Front section is for the owner; the task-by-task half below it is for the agents that execute it.*

## Settled, do not relitigate

The owner settled these before this document existed (build-notes, "Queue notes, 4 September 2026"):

1. **Join-only.** Not at group creation; there is nobody to collide with when you create a group.
2. **Case-insensitive and whitespace-trimmed**, so "mike" and "Mike " both collide with "Mike".
3. **They cannot decline.** If the name still collides, they cannot join. Two Mikes forever is worse for the group than one moment of friction.
4. **The copy offers both doors**, because a collision is the strongest signal in this product that somebody is a returning member who lost their session: *"There's already a Mike in this group. If that's you, sign in instead. If not, add a last initial so people can tell you apart."* Short: vertical space on that screen is contested.
5. **At the door, not on the screens.** Ten render sites share no seam, and join announcements and cancellation lines bake a name into stored text at write time, which no display fix can repair. Catching it at join means every stored string is correct from birth.
6. Enforced **server-side** as well as in the UI. A client-only check is not a check.

## Non-goals

- **Rewiring render sites.** Explicitly out. The roster, group info, and Orbit's tallies are untouched.
- **Per-name avatar hue.** It was deliberately removed in polish slice three and must not come back; colour cannot carry identity on a screen where status must not be read from hue.
- **`deletion-plan.ts`'s literal `"Mike joined"` body match.** A real wrong-write bug, already recorded at build-notes 6852. Its own item.
- **Name editing anywhere.** `name` lives on `User`, so an edit renames a person in every group retroactively; the owner declined that on 4 Sept for the onboarding screen. It belongs to the parked "founder fixes group details" slice.
- **A per-membership display name.** Would need a migration and every render site; that is the thing decision 5 exists to avoid.

## One thing the settled decisions do not cover, and the assumption taken

**A joiner who already has a session cannot be given this friction, because the product has no way for them to resolve it.** Two populations tap an invite link:

- **No session** (the case the copy was written for, and the case a returning member who lost their session lands in). The name field is on screen, the name they type creates their `User` row, and the check gates it. Fully covered.
- **An existing session**, i.e. somebody already in the product joining a second group. The join screen shows them a read-only "Joining as Jacob"; `joinGroupByInvite` deliberately never overwrites a stored name. If a Jacob is already in that group, the only ways to enforce the block are (a) let them edit the name, which renames them in every group retroactively, the blast radius the owner declined on 4 Sept, or (b) refuse the join with no remedy anywhere in the product.

**Assumption taken, and it is the owner's to overturn: the check gates the name at the moment it enters the product, which is `User` creation.** An existing session joins as before. That also keeps the sign-in path open by construction, which decision 4's copy depends on: `confirmJoinSignInAction` joins with `memberName: ""` on an existing `User`, so a member recovering their session can never be blocked by the very check that told them to sign in. Named as an open question in the PR.

## How this will be verified, written before any code

- **Server enforcement gets tests** at the lib layer, against the real dev-test database: a collision writes no `User`, no `Membership`, and no announcement; case and whitespace both collide; a non-colliding name joins normally; an existing `User` is never blocked; a re-tap of one's own link is still a silent no-op.
- **The action's mapping gets tests**: the lib's duplicate error becomes a field-anchored error carrying the existing member's stored name, and the pre-existing empty-name error still works. Mocked, following `join-signin.test.ts`.
- **The screen gets tests**: the duplicate error renders the owner's copy with the name interpolated, and its inline "sign in" control opens the existing sign-in panel.
- **Every test is mutation-proven**: break the thing it guards, watch it go red, restore. Five tests that could not fail were found in this repo this week.
- **Deliberately not tested**: the race between two simultaneous same-name joins (see debt), and the rendered layout, which gets a browser pass at 375x812 instead.
- **A production build (`npx next build --webpack`) runs before the PR**, not just the suite. Three deploys failed on 4 Sept while four suites stayed green.

## Debt this opens

- **The check is read-then-write inside a transaction, not a database constraint**, so two people with the same name tapping join in the same instant can both get in. A real constraint would need `name` denormalised onto `Membership` with a unique index on `(groupId, lower(name))`: a migration, a second source of truth for a person's name, and a deploy obligation. Declined against a race that needs two same-named strangers within one transaction's width.
- **A session-bearing joiner can still collide**, per the assumption above.
- **The copy names a person's name back to a stranger before they have joined.** The invite link is already the credential and the join screen already shows the group name, member count and rhythms, so this discloses nothing the screen does not; recorded because it is a disclosure decision, not because it is a leak.

---

# Tasks

Each task is implemented by a fresh subagent and reviewed by an independent read-only reviewer. The coordinator writes no product code.

**Standing rules for every task in this slice:**

- Run everything from the worktree at `.claude/worktrees/duplicate-name-join-check-473e4c`. Never `cd` to the main repo root.
- Vitest runs with `globals: false`. Import `describe`/`it`/`expect` from `"vitest"` by name. Component test files need `// @vitest-environment jsdom` on line 1.
- Database tests hit the real dev-test database. Follow `src/lib/groups/__tests__/join.test.ts` exactly: seed inline with a `[TEST]` name prefix and a `${Date.now()}`-suffixed `supabaseAuthId`, collect created ids in local arrays, and in `afterAll` delete groups before users (`Group.founderId` is `Restrict`), each `.catch(() => {})`, then `prisma.$disconnect()`.
- **Another session shares this dev-test database and the suite lock does not span worktrees.** If a run goes red in files you did not touch, especially with Prisma transaction timeouts or stray `[TEST]` rows, re-run that file alone before believing it.
- **Every test must be mutation-proven.** For each test you add: break the code it guards, run it, paste the failure, restore, run it again. A test you cannot show failing is not evidence. Report the mutation and its output in your task summary.
- Do not touch `src/lib/people/deletion-plan.ts`, the roster, group info, or Orbit's tallies.

---

## Task 1 — the server-side check, in the transaction

**File:** `src/lib/groups/join.ts` (and a new error type; put it in the same file, since nothing else needs it yet).

`joinGroupByInvite` today resolves the group inside a `prisma.$transaction`, then reuses an existing `User` by `supabaseAuthId` or creates one with the submitted `memberName`, then `createMany(skipDuplicates)` for the `Membership`, then writes the `"{name} joined"` announcement when `count === 1`.

**Add the check on exactly one branch: the `User`-creation branch.** That is the moment a name enters the product, and it is the only branch where a caller supplied a name at all.

Concretely, inside the transaction, before `tx.user.create`:

1. Read the group's current member names: `tx.membership.findMany({ where: { groupId: group.id }, select: { user: { select: { name: true } } } })`. `Membership` has `@@index([groupId])`, so this is indexed. Use the narrow `select` form — `src/lib/people/deletion-plan.ts:169` and `src/lib/proposals/promote.ts:50-53` are the precedents for a scoped read like this inside a transaction.
2. Compare `memberName.trim().toLowerCase()` against each stored name's `.trim().toLowerCase()`.
3. On a match, `throw` a `DuplicateNameError` carrying **the existing member's stored name**, verbatim, casing included. The stored casing is what the roster shows, so it is what the copy must say. Export the class and a type guard or `instanceof` check the action can use.

Because the throw happens inside the interactive transaction, the whole transaction rolls back: no `User`, no `Membership`, no announcement. Do not add a compensating delete; let the transaction do its job.

**Do not gate the existing-`User` branch.** Two reasons, and the second is load-bearing: the product has no way for a person with a stored name to change it (see the front section), and `confirmJoinSignInAction` calls this function with `memberName: ""` on an existing `User`, so gating that branch would block the sign-in recovery the collision copy points people at.

Follow the existing `throw new Error("INVALID_INVITE")` idiom's spirit, but use a real class rather than a message string, because this error carries data.

Write a comment block on the check explaining *why* it sits on this branch only, in the register of the comments already in that file. A future reader will otherwise "fix" the apparent asymmetry.

**Tests** — add to `src/lib/groups/__tests__/join.test.ts`:

1. A brand-new visitor submitting a name that exactly matches an existing member is rejected; assert `DuplicateNameError` and that its carried name is the stored one.
2. After that rejection, assert directly against the database that no `User` with that `supabaseAuthId` exists, that the group's membership count is unchanged, and that no new `SYSTEM` message was written. This is the test that proves the rollback rather than assuming it.
3. `"  mike  "` collides with a stored `"Mike"` — case and whitespace in one case, since decision 2 names them together.
4. The carried name is the stored casing (`"Mike"`), not the submitted casing (`"mike"`).
5. A non-colliding name joins normally: `User`, `Membership` and announcement all written, exactly as the existing happy-path tests assert.
6. An existing `User` whose stored name matches a member of the target group **is not blocked** — this is the sign-in path, and it is the test that stops a future session from "fixing" the asymmetry.
7. The existing re-tap idempotency test still passes untouched.

Mutation-prove each: for 1-4, delete the check; for 5, make the check always throw; for 6, extend the check to the existing-`User` branch and watch 6 go red.

---

## Task 2 — the action maps it to a field-anchored error

**Files:** `src/app/actions/join-group.ts`, and its new test file `src/app/actions/__tests__/join-group.test.ts` (none exists today).

`JoinGroupState.errors.memberName` is a free string today, written by the server and rendered verbatim by the client. The collision copy needs a real sign-in control inside it, which means the client has to own the wording. **Change `memberName` from a string to a discriminated union**, following the mechanism CLAUDE.md names as the stronger of the product's two error patterns (`src/lib/auth/email.ts`, whose result variants are exhaustively mapped so a new one is a compile error at every call site):

```ts
export type JoinNameError =
  | { kind: "required" }
  | { kind: "duplicate"; existingName: string }

export interface JoinGroupState {
  errors?: {
    memberName?: JoinNameError
    general?: string
  }
}
```

Leave `general` a string; nothing about it changes.

In the action:

- The existing empty-name guard returns `{ errors: { memberName: { kind: "required" } } }`.
- Wrap the `joinGroupByInvite` call so a `DuplicateNameError` returns `{ errors: { memberName: { kind: "duplicate", existingName: e.existingName } } }`, and every other throw keeps returning today's generic `general` string. Do not widen or narrow what `general` catches.
- **`redirect()` still must be called outside and after the try/catch.** It throws `NEXT_REDIRECT` internally; the existing comment in that file says so and it is correct.

**Tests** (`src/app/actions/__tests__/join-group.test.ts`, following `src/app/actions/__tests__/join-signin.test.ts` for structure — mock `@/lib/supabase/server` and `@/lib/groups/join`, and use its `RedirectSignal extends Error` stand-in so code after the redirect is caught):

1. An empty name with no session returns `{ kind: "required" }`.
2. A `DuplicateNameError` from the lib becomes `{ kind: "duplicate", existingName: "Mike" }`, carrying the stored name through unchanged.
3. Any other throw still returns the generic `general` string and **not** a `memberName` error — this is what stops a database outage from telling somebody their name is taken.
4. A successful join still redirects to `/groups/{id}`.

Mutation-prove each.

---

## Task 3 — the screen renders both doors

**Files:** `src/app/join/[inviteToken]/JoinForm.tsx`, and its test file.

The field error already renders in the right place: `fieldErrorStyle`, directly under the input. Only its content changes.

Map the union to copy on the client. Use a shape that makes a new variant a compile error — an exhaustive `switch` returning `ReactNode`, or a `Record<JoinNameError["kind"], …>`; the `REQUEST_ERROR`/`CONFIRM_ERROR` maps at `JoinSignIn.tsx:60-81` are the precedent, and they are `Record<Union, string>` because their variants carry no data. This one carries a name and a control, so a `switch` in a small local function is the better fit. Do not silently fall back to a generic string for an unhandled kind; that is the compile error's whole point.

- `required` → `"Your name is required."`, unchanged from today.
- `duplicate` → the owner's copy, verbatim, with the stored name interpolated:

  > There's already a **{existingName}** in this group. If that's you, sign in instead. If not, add a last initial so people can tell you apart.

  **"sign in" is a real control**, not prose. Make it an inline `<button type="button">` inside the sentence that calls `setSigningIn(true)` — the same state the "I've been here before" link at the bottom of the form already flips, which unmounts the join form and mounts `<JoinSignIn>`. Reuse that state; do not add a second mechanism, and do not add a separate full-width button, because vertical space on this screen is contested and the owner asked for brevity. Style it as an inline text link in `--danger` with an underline so it reads as part of the sentence it sits in; it must not be teal (teal is a weight, and the weight on this screen belongs to joining).

  Do not bold or otherwise decorate the name beyond what the sentence needs; three lines of `--type-meta` is already the tallest this error has ever been.

While you are in this element, and only because the error is now a first-class state rather than a stray string: give the input `aria-invalid` when there is a `memberName` error and `aria-describedby` pointing at the error paragraph, and give the paragraph an `id` and `role="alert"`. No component in `src/` does this today; this is the first, and the screen where somebody is being told they cannot proceed is the right place to start. Keep it to this one input — do not sweep the codebase.

**Tests** — add to `src/app/join/[inviteToken]/__tests__/JoinForm.test.tsx` (actions are already mocked there; drive `useActionState` by mocking the action's return the way the file already does):

1. A `duplicate` state renders the owner's sentence with the stored name in it.
2. Its "sign in" control opens the sign-in panel — assert the join controls are gone and `JoinSignIn`'s panel is present, the same assertion the existing second-door test makes.
3. A `required` state still renders "Your name is required." under the input.
4. The input carries `aria-invalid` and an `aria-describedby` that resolves to the error paragraph's `id` when an error is present, and carries neither when there is none.

Mutation-prove each. For 2, the mutation to try is pointing the inline control at a no-op rather than `setSigningIn`.

---

## Task 4 — browser pass and production build

No product code unless something is found.

1. Start the dev server on **port 3100 with webpack**: `npm run dev -- --webpack --port 3100`. Turbopack refuses this worktree's symlinked `node_modules`. Another session holds 3000.
2. Seed a group with a member whose name is a known value, get its invite link, and at **375x812** walk: submit the colliding name, read the error, tap "sign in" inside it, confirm the sign-in panel opens, go back with "I'm new here", submit a differentiated name, confirm the join lands in the group and the feed's join line carries the differentiated name.
3. Confirm the three-line error does not push the join button or the consent line off screen at 375x812, and that nothing clips.
4. Take a screenshot of the error state.
5. Stop the dev server when done.
6. Run `npx next build --webpack` and report the result. This is a gate, not a formality: three deploys failed on 4 Sept while four suites stayed green, because vitest does not typecheck and Vercel runs `tsc`.
7. Run the full suite and report the numbers against the recorded baseline of **1814 passing across 153 files** (the 4 Sept run showed 1813/1814, the single failure being another worktree's `[TEST] … joined` rows leaking into `delete-person.test.ts` through its literal-body match; it passes clean in isolation).
