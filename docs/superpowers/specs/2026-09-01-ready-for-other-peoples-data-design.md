# Ready for other people's data

*Slice document. The front section was written 1 September 2026, before any code,
after the owner settled six product questions. The task-by-task half was written
the same day.*

*Why this slice exists: the owner is about to share the product with a friend's
tennis group, the first real users other than himself, and is holding that until
this slice and the group-editing slice after it are both done. Today the product
collects names, email addresses, chat messages and venue street addresses, and
there is no privacy notice, no terms, and no way for anyone to be deleted.*

---

## Settled, do not relitigate

The owner settled all six questions on 1 September 2026.

**A deleted person's messages stay in the conversation and stop carrying their
name.** The label is **"Former member"**, not "Deleted Member": the owner asked
for a label so nobody reads a nameless bubble as a quiet active member, and
"former" states what happened *to the group*, which is what a reader needs, while
"deleted" states what happened to a database row. Their **"Jesse joined" line is
deleted too**, because it exists solely to name them and would otherwise sit
three lines above a bubble reading "Former member".

**Their answers go with them**: every RSVP, gauge vote and time-change vote, on
past plans as well as future ones. The visible cost is accepted: a past event that
read "4 in" will afterwards read "3 in".

**Deletion is by request, not self-service.** The deciding fact is not effort: the
app holds no key able to delete a Supabase login, so a self-service button would
wipe someone from our database and leave their login alive, and the next tap on an
invite link would recreate them as a brand-new person. The owner finishes the job
in the Supabase dashboard, which code here cannot reach.

**A founder asking to be deleted is asked who takes the group over.** If they are
alone in it, the group is deleted with them.

**The mechanism is a script the owner runs**, not dashboard surgery. Deleting a
person correctly touches nine places across two systems; the script exists so the
deletion promised in the notice is the deletion that actually happens.

**The contact address is `privacy@interplanetarygroups.com`**, forwarded to the
owner's inbox. Setting up that forwarding is the owner's and is not this slice's
work; the notice names the address regardless.

---

## Non-goals

- **A self-service delete button in the app.** Decided against above. It belongs
  behind a service-role key the product deliberately does not hold (build-notes
  §8); revisit only if the audience grows past a handful.
- **A group-transfer script.** Cut by the owner on 1 September 2026 as the rarest
  case. A founder leaving a group that still has members is handled by hand, with
  the runbook section written in task 8 as its guide.
- **Data export.** Nobody has asked, and the population is two people. It belongs
  with self-service deletion if that ever lands.
- **A cookie banner.** There is nothing to consent to: one session cookie, no
  analytics, no tracking, no ads. Naming it in the privacy notice is the honest
  treatment.
- **Sign-in rate limiting.** Task 9 measures whether Supabase already stops a
  guessing attack. If it does not, that is reported and stops there; building a
  limiter is a separate decision the owner has not been asked for, and it would
  have to cover **two** doors (`signin.ts` and `join-signin.ts`).
- **Unsubscribe token rotation.** Real and recorded, not this slice's. The
  "turn them back on" path in task 7 is the part that closes an actual dead end.
- **Deleting `Group.description`.** The founder's original free text is stored
  forever and nothing reads it (`prisma/schema.prisma:60`). Named in the notice;
  removing it is queued, not built here.
- **Merging duplicate identities.** Still audit finding 10, untouched.

---

## How this will be verified, written before any code

- **Unit tests on the deletion rule engine**, which is where the real behaviour
  lives and where an error is unrecoverable. Each shown failing first: a plain
  member's rows go and their messages survive; a founder of a group with other
  members is refused; a founder alone in a group takes the group with them; the
  join announcement is found and removed; an open change proposal is warned about.
  The engine is pure planning logic, separable from the script that prints and
  confirms, and that separation is the point.
- **A unit test on the "Former member" label** at each of the three fallbacks that
  currently disagree ("Member", "A former member", "Someone"). The test must be
  shown failing by restoring the old string, not merely passing.
- **A component test on the shared legal footer**, scoped honestly: this repo can
  test shared components and cannot test server-rendered screens.
- **Route tests that both pages resolve**, which is the cheap guard against a
  privacy notice that 404s on the day someone reads it.
- **Deliberately NOT tested: the wording of the legal copy.** A test asserting a
  sentence is a copy-lock, not a behaviour check, and it would fail every time the
  owner improves a line. The one exception is the contact address, which is pinned
  by a test, because a notice promising deletion at an address that is wrong or
  missing is the single failure that makes the whole page a lie.
- **Deliberately NOT tested: the script's interactive confirmation prompt.** It is
  I/O around a tested engine; the engine is what must be right.
- **A browser pass at 375x812** on both new pages and all four link placements.
- **A real-phone pass on the LAN before the QA script is written**, required by the
  standing rule: two new screens is new layout.
- **The sign-in guessing attack is hand-run against dev-test and its number
  reported.** It is a measurement, not a test; it costs real Supabase requests and
  belongs outside the runner for the same reason the eval benches do.

---

## Debt this slice is expected to open

- **The deletion script is never exercised end to end against a real database by
  anything automatic.** The engine is tested; the script's actual `delete` call is
  proven once by hand against dev-test and never again. This is deliberate (the
  alternative is a test that deletes real rows) and it is the thing to re-prove by
  hand if the schema changes.
- **The privacy notice will go stale silently.** It lists what is collected and
  which outside services see it; nothing enforces that a future slice adding a
  field or a vendor updates the page. Task 10 mitigates by pointing at it from
  CLAUDE.md, which is the strongest available guard and is not a strong one.
- **The "Former member" fallback fires on a null author, and `authorType` stays
  `MEMBER` while `authorId` goes null**, a pair that `createMessage` forbids on
  write (`src/lib/messages/create.ts:44-45`) but read paths tolerate. Deletion is
  the only thing that produces it. Left as is; noted so a future reader does not
  read it as corruption.
- **Deleting a person cascades away any `ChangeProposal` they asked**, taking
  everyone else's votes on it. The script warns; the schema is not changed,
  because `ChangeProposal.asker` is read widely enough that making it nullable is
  its own piece of work.

---

# Tasks

Each task is a vertical piece with its own test-first step. Tasks 1-3 are the
deletion engine and are the riskiest work in the slice; 4-6 are the pages; 7-9
are the verification items; 10 is the record.

---

## Task 1: the deletion plan engine

**File:** `src/lib/people/deletion-plan.ts` (new), with
`src/lib/people/__tests__/deletion-plan.test.ts`.

A pure function that takes a person and the state of their groups and returns a
*plan*: what will be deleted, what will survive, what blocks, and what the owner
must be warned about. It performs no writes. This separation is the whole safety
argument of the slice: the dangerous decision is *what to delete*, and it is made
somewhere testable, away from the code that prints and confirms.

The plan's shape:

```
type DeletionPlan =
  | { kind: "blocked"; reason: "founder-with-members"; groups: BlockedGroup[] }
  | { kind: "ready"; person: {...}; groupsToDelete: {...}[]; removals: {...};
      survivals: {...}; warnings: Warning[]; supabaseAuthId: string | null }
```

**Rules the tests must pin, each written failing first:**

1. A person who founded a group that still has **other** members produces
   `blocked`, naming every such group and its other members. Nothing is deleted.
   This mirrors the database's own `ON DELETE RESTRICT` on `Group.founderId`
   (`prisma/schema.prisma:68`), but the point is to fail with an explanation
   rather than a foreign-key error.
2. A person who founded a group where they are the **only** member produces
   `ready`, with that group in `groupsToDelete`. Deleting the group cascades its
   events, messages, gauges and proposals; the plan says so.
3. A plain member produces `ready` with no group deletions.
4. `removals` names what the cascade takes: memberships, contact methods, RSVPs,
   gauge votes, proposal votes, and change proposals they asked. The test asserts
   the counts against seeded rows, so a future schema change that stops cascading
   one of these breaks the test rather than the promise.
5. `survivals` names their messages (count) and any gauges they suggested. The
   test asserts a message they wrote is still present after the plan is applied.
6. `warnings` contains one entry per **open** `ChangeProposal` they asked, naming
   the group and how many other people have voted on it. An already-closed
   proposal produces no warning.
7. The join-announcement lookup: the plan lists SYSTEM messages in their groups
   whose body is exactly `"<name> joined"` (`src/lib/groups/join.ts:69`). The test
   covers the awkward case: **two members with the same name** yields two
   candidate rows, and both are listed for the operator to confirm rather than one
   being guessed at.

**Do not** put the Supabase deletion in here. The plan reports `supabaseAuthId`
so the script can print it; the app has no key that can act on it
(`src/lib/supabase/env.ts` carries only the URL and publishable key).

---

## Task 2: applying the plan

**File:** `src/lib/people/delete-person.ts` (new), tests alongside.

One function that takes a `ready` plan and executes it inside a transaction:
delete the named join-announcement messages, delete the solo-founded groups, then
delete the `User` row and let the cascades run.

Order matters and the test must pin it: the groups go **before** the user,
because `Group.founderId` is `RESTRICT` and the delete is otherwise rejected.

It refuses a `blocked` plan. Test that.

It returns a receipt: what was actually removed, with counts, so the script can
print what happened rather than what it intended. Re-reading counts after the
fact rather than trusting the plan is the point.

---

## Task 3: the script

**File:** `scripts/delete-person.ts`, wired as `npm run person:delete`.

Behaviour, in order:

1. Print which database it is pointed at, in the shape `scripts/db-which.ts`
   already uses. **It must refuse to run at all unless an explicit
   `--i-know-this-is-production` flag is passed when the ref is not dev-test.**
   This is the one script in the repo that destroys data by design.
2. Find the person by `--email` (through `ContactMethod`) or `--name` plus
   `--group`. If the lookup matches more than one person, print all of them with
   enough detail to tell them apart and stop.
3. Build the plan and print it in plain language: what goes, what stays, what is
   warned about. Not a JSON dump; the owner reads this and decides.
4. Require the operator to type the person's name to confirm. Not `y`.
5. Apply, print the receipt, and then print the Supabase auth id with a one-line
   instruction to finish the job in the dashboard.

Follow the existing `scripts/qa-*.ts` conventions for env loading and output.

---

## Task 4: the "Former member" label

**Files:** `src/app/groups/[id]/MessageFeed.tsx:271` ("Member"),
`src/lib/orbit/window.ts:40` ("A former member"),
`src/lib/digest/compose.ts:195` ("Someone").

All three become **"Former member"**. Write the test first and show it failing by
restoring the old string in each place; a label test that never could have failed
is the exact trap this project has been caught by before.

`src/lib/orbit/window.ts` is what Orbit is *told*, not what a member reads, so it
is a prompt string rather than product copy. Unify it anyway: three fallbacks
disagreeing about one concept is how the 29 July recognition bug happened.

---

## Task 5: the privacy notice and terms pages

**Files:** `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` (both new).

Product voice: plain, warm, readable by a teenager or an eighty-year-old, **no em
dashes**. These are user-facing copy and the copy rules apply in full.

The privacy notice covers, in this order:

- **What is collected**: your name; your email address if you give one; what you
  write in the group chat; your answers to plans (in, out, and votes); the group's
  meeting spot including its street address if the founder gave one; the group's
  timezone; the description the founder first wrote about the group; and when you
  last opened the group.
- **Why**, tied to each: running the group, signing you back in, sending reminders.
- **Who can see it**: the people in your group see your name, your messages and
  your answers. Your email address is never shown to your group. **And the person
  who built this can read the database**, stated plainly, because that is true of
  every app and saying so is the honest version.
- **Outside services that handle it**: Anthropic, because your messages and your
  name are sent there for Orbit to read; Resend, which sends the email; Supabase
  and Vercel, which store and host it; and a monitoring service that receives
  error messages rather than your data.
- **Cookies**: one, to keep you signed in. No analytics, no tracking, no ads.
- **Getting deleted**: the address, a seven-day promise, what happens (account,
  email, and every answer you gave), and **what survives** (your messages, no
  longer carrying your name, and your name where Orbit or another member wrote it
  into a sentence). Do not overclaim here; this section is the reason the page
  exists.
- **A line that this is not built for children under 13.**
- **A line that the notice can change**, with no promise of individual notice.

Terms, short:

- A personal project by one person, offered as-is.
- No warranty, no guarantee it works or stays up, and it can go away.
- Do not rely on it for anything that matters.
- Do not abuse it: no harassment, no spam, nothing illegal.
- Content or accounts can be removed.
- You own what you write and give permission to show it to your group.

Both pages carry a way back, per the no-dead-ends rule that the navigation slice
established app-wide.

---

## Task 6: the four link placements

**A shared component**, `src/components/LegalFooter.tsx`, because four
placements of the same pair of links is exactly the case `src/components/` exists
for. It owns the links and nothing about its surroundings.

- **Front door** (`src/app/page.tsx`): a quiet footer, below the existing "Been
  here before?" note. It must not become a third thing competing with the one teal
  action; `--text-faint`, eyebrow size.
- **Group info** (`src/app/groups/[id]/info/page.tsx`): the same quiet footer.
- **Join screen** (`src/app/join/[inviteToken]/JoinForm.tsx`): a consent line
  reading that joining means agreeing, with both links in it. This is one of the
  two moments a person actually hands something over, so it sits next to the
  action, not in a footer.
- **Create step 1** (`src/app/create/`): the same consent line next to Continue.
  The founder is also creating an account and the join screen is not their path.

The component test covers the footer. The four placements are proven by the
browser pass, since server-rendered screens are not testable here.

---

## Task 7: the unsubscribe way back

**Files:** `src/lib/email/unsubscribe.ts`, `src/app/actions/unsubscribe.ts`, and
the confirmation screen at `src/app/unsubscribe/[token]/`.

Today `digestOptOutAt` is set once and **nothing anywhere ever sets it back to
null**, so someone who unsubscribes by accident, or whose forwarded digest let
somebody else do it, has no way back without a hand-written database change.

Add a resubscribe path using the same token as its capability, and put "Didn't
mean to? Turn them back on" on the confirmation screen. Test the round trip:
opt out, opt back in, opt out again.

Keep the existing silence on the endpoint: the response must stay identical for a
valid token, an unknown token and an error, so it never becomes an oracle.

---

## Task 8: the deletion runbook

**File:** `docs/runbooks/person-deletion.md` (new), matching
`docs/runbooks/production-migration.md`'s shape.

What it carries that the script cannot: how to answer the email, the seven-day
promise, the Supabase dashboard step, and **the founder-with-members case that was
deliberately not scripted** (ask who takes it over, change `Group.founderId` by
hand, then re-run the script). Name the exact query, because the whole reason
this case is unscripted is that it is rare, and rare is when a runbook earns out.

---

## Task 9: the three verification checks

**9a, sign-in code guessing.** A hand-run script, `scripts/probe-signin-rate.ts`,
outside the test runner. Against **dev-test only**: request a code for a throwaway
address, then submit wrong codes in a loop through the real
`confirmSignInCode` seam until something refuses, recording how many attempts got
through and how long it took. Report the number. **If nothing stops it, report
that and stop.** Do not build a limiter; that is a decision the owner has not been
asked for, and it would have to cover both `src/app/actions/signin.ts` and
`src/app/actions/join-signin.ts`.

**9b, unsubscribe.** Already verified by reading: one stolen token opts exactly
one person out of digests, cannot be guessed or enumerated, and touches nothing in
sign-in or membership. Task 7 closes the one real dead end. Write the finding up;
no further work.

**9c, dependencies.** Already run: 14 advisories, all in build and CLI tooling,
none in the deployed runtime. Run the safe `npm audit fix`, re-run the suite, and
**decline the forced fix**, which would downgrade Prisma 7 to 6 to patch a MySQL
driver this product never loads. Record the decline with its reasoning.

---

## Task 10: the record

- **CLAUDE.md**: a "Where the build is" paragraph, and the deletion rules where
  the identity and data-model sections already carry the neighbouring rules. The
  privacy notice's staleness is the debt to name.
- **build-notes §11**: the slice entry, 400-600 words, covering the six settled
  questions and why, the "Former member" reasoning, the self-service refusal
  turning on the missing Supabase key rather than on effort, and the measured
  sign-in number.
- **The pre-deploy checklist**: no migration in this slice, so no deploy
  obligation. Confirm that by looking rather than by assuming, and say so.
- **The after-launch list**: the owner's mail forwarding for
  `privacy@interplanetarygroups.com`, since the notice names an address that does
  not receive mail until he sets it up.
