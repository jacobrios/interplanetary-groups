# Pre-deploy fixes (slice A of the deploy pair)

**Branch `feat/pre-deploy-fixes`, cut from `main` at `d6e4ecb`, 23 Aug 2026.**
Item 6 of the pre-MVP triage order: the audit's three `fix-before-deploy` findings,
the two postscript items nobody owned, and the doc corrections the audit was
read-only and therefore left standing.

*Front section runs long (about 650 words against the 200-word target) because
seven decisions were settled with the owner in one sitting rather than one.*

---

## Settled, do not relitigate (owner, 23 Aug 2026)

1. **Two slices.** A is code, proven locally, merges to main. B is the deploy, no
   code, run against main. The seam exists so the first production build is cut
   from main, not from a branch waiting on a deploy that has not happened.
2. **Free `*.vercel.app` host.** Custom domain deferred; switching later breaks
   every shared invite link, and that cost is accepted.
3. **Link preview names the group over one static image.** Rejected: generic (does
   not earn the tap) and per-group rendered (more surface, no gain). Accepted cost:
   unfurling services read the group's name with nobody tapping. Consistent with
   polish slice three, where the join screen shows the group to anyone holding the
   link, because the link is the credential.
4. **`next` 16.2.9 to 16.3.2 lands here.** Twelve shipping-dependency advisories
   resolve through it, including an unauthenticated Server Function endpoint
   disclosure that only becomes reachable when the URL is public.
5. **Migrations are proven against production itself, in slice B**, because it
   starts empty and it is checklist item 5 regardless. All 14 files are read here.
6. **Front door indexable, group/event/join routes not.** Unfurling unaffected.
   Spend is already bounded by the prepaid cap (checklist item 9), which converts
   cost risk into downtime.
7. **Audit finding 4 moves into this slice** and out of the triage list.

**Premise corrected before work began:** the token fix needs no migration.
`prisma/migrations/20260619003631_init/migration.sql:37` declares the column with
no `DEFAULT`, so `@default(cuid())` is a Prisma client generator, never Postgres.

## Not in this slice

- **The other 45 findings** (triage session, already scheduled).
- **The deploy** (slice B).
- **Email sign-in and the duplicate-member bug**, corrected in the docs here only;
  it belongs to the slice immediately after the deploy, because it cannot be tested
  without a live site.
- **The second-viewer problem**: registered in build-notes §8 here so it can be
  sequenced, built in its own slice.
- **Eval bench runs** (cost money, hit the network, and the audit recorded fidelity
  problems in the benches themselves; their own slice).
- **A per-group rendered preview image** (wherever the product next earns a
  dynamic-image route).
- **Fixing anything task 9's migration read turns up**: it reports; a finding
  becomes its own decision.

## How this is verified, written before any code

**Baseline on this branch: 92 files / 935 tests green, 71.4s**, with
`npm run db:which` printing the dev-test ref on all three sources first. No
pre-existing failure to carry.

Full suite green per task. Task 2 additionally needs `npm run build` exit 0, since
a framework bump can pass every unit test and still fail to compile a route. Tasks
3 and 4 each need a test shown failing first. Tasks 5, 6 and 7 need rendered
evidence, on the owner's phone over the LAN address, because they are visual claims.

**What slice A cannot prove, and will not claim:** the text-message preview.
Unfurlers cannot reach a laptop on a home network, so task 6 is written here and
proven in slice B. Unchanged by either slice: that a second person's screen updates.

## Debt this slice opens

One preview image for every group, title varying only. The preview's base URL
pinned to the Vercel host, so a later custom domain leaves cached previews behind.
Nine audit findings still turn on model behaviour nothing measures, now live rather
than merely unmeasured. And a first dependency check is not a habit: nothing here
establishes who watches for the next advisory.

# Tasks

Nine tasks. Task 1 first by standing rule (the always-loaded file must stop
asserting things this audit disproved before any other work uses it). Task 2
second so every later task is written and tested against the version that ships.

---

## Task 1 — Correct CLAUDE.md, and register the second-viewer gap

**Why first:** CLAUDE.md loads into every session. A wrong claim in it works
against every slice that follows, including the rest of this one.

**Five corrections in `CLAUDE.md`.** Each is an amendment in the file's own
append-only house style (dated inline note, strikethrough where text is
superseded), never a silent rewrite.

1. **`CLAUDE.md:153`** — "a member who loses their session meets the wall until
   email sign-in exists, and the invite link is their way back." This is wrong,
   and wrong in the kindest possible direction. Per the audit's 23 Aug postscript:
   they still have the link, they tap it, they have no session, so they join as a
   *second* member. The group holds two of them, their earlier answers belong to
   an identity nobody can reach, and every count is quietly wrong, in the one
   product whose whole claim is accurate attendance. Nobody sees an error. One
   cache clear, or one switch from phone to laptop, is enough. Replace the "known
   cost" clause with this, and name email sign-in as the immediate post-deploy
   slice.
2. **`CLAUDE.md:41`** — "every count and tally already reads current members only,
   so removal self-heals with no extra write." Contradicted by the audit's own
   findings 10, and by lane-1 findings F-1-16 and F-1-17: removal deletes only the
   membership row, so old RSVPs and gauge votes survive, and a rejoin makes them
   count again. Lane 2 verified the claim for `proposals/promote.ts` alone. Strike
   the general claim, keep what is actually true, and point at audit finding 10.
3. **`CLAUDE.md:153`** — "Every write path refuses a non-member server-side through
   the shared check in `src/lib/auth/membership.ts`." The conclusion holds; the
   mechanism clause does not. Per the audit's A-2-6, `proposal-vote.ts:82` uses the
   pre-write form, outside the transaction it protects. Amend the mechanism clause,
   do not delete the boundary claim.
4. **`CLAUDE.md:31`** — the bench readings ("80/80 ... 65/65 ... 10/20"). The numbers
   are real and stay. What is missing is their scope: audit findings F-3-20, F-3-2
   and F-3-27 together show the bench does not cover the product's core spark
   behaviour, that four day-comment cases stop short of the deciding code, and that
   the flagship regression case rebuilds its failure with words Orbit no longer
   says. Add one dated sentence saying the numbers measure less than the sentence
   around them implies, pointing at those three findings.
5. **`CLAUDE.md:17`** — "the founder heads into the group home carrying their first
   scheduled event." True on the happy path (`create-group.ts:97`) and the failure
   branch is deliberately fail-soft. Nobody ever asked what the founder sees when it
   fires: an empty group home for up to an hour, on the first screen after creation,
   with no notice. Add that, dated.

**One addition to `docs/build-notes.md` §8.** The second-viewer problem is
registered nowhere: every state change is delivered by `revalidatePath`, which
refreshes only the browser that fired the action. There is no `setInterval`, no
`EventSource`, no `WebSocket` and no `visibilitychange` anywhere in `src/`. A
second member sees nothing (not a message, not Orbit's reply, not a vote landing,
not the third yes creating a plan) until they navigate or reload. In a group-chat
product that is the shape of the product. Write it as a §8 entry so it can be
sequenced; do not propose a solution.

**Verification:** no code, no tests. The evidence is the diff itself plus a read
of each cited audit finding. Do not claim any of the five were re-verified against
running code; they are relayed from the audit, which was read-only, and the entry
should say so.

**Out of lane:** do not touch the current-state section's measured visual claims
(the pixel and contrast numbers). The critic flagged that class as unverifiable by
static read, which is not the same as wrong, and re-measuring belongs to whoever
next opens that screen.

---

## Task 2 — Bump `next` 16.2.9 to 16.3.2

**Why second:** every later task should be written and tested against the version
that actually ships.

**Do:** bump `next` and `eslint-config-next` to 16.3.2 in `package.json`, install,
and re-run everything. Do not run `npm audit fix --force`, which is free to pick
other majors; change the two pinned versions by hand.

**Expect to remain after the bump:** the moderate findings in the Prisma CLI's own
dependency tree (`@prisma/dev`, `hono`, `valibot`, `deepmerge-ts`). Those are dev
dependencies and never ship. Record the before and after counts of
`npm audit --omit=dev` in the PR body; do not chase the dev-tree ones in this slice.

**Verification:** the full suite green (baseline 935), and `npm run build` exit 0.
Both are required, and the build is the one that matters: a framework bump can pass
every unit test and still fail to compile a route. If either goes red, stop and
report rather than working around it; the bump is the owner's call to keep or drop.

---

## Task 3 — Mint the invite token with the same generator the reset path uses

**The defect (audit finding 3):** `prisma/schema.prisma:52` is
`inviteToken String @unique @default(cuid())`, while `src/lib/groups/reset-invite.ts:34`
correctly uses `randomUUID()`. The invite link is the entire credential to a group:
name, roster, schedule, meeting address, and one tap into the feed. A cuid is mostly
a timestamp plus a machine fingerprint with a short ordinary-random tail. This is a
missing guarantee rather than an open door, and it rates fix-now purely on timing:
it is small now and means rotating every group's link out from under its members
later. The repo's own two files also disagree in writing, in a codebase an investor
may read.

**Do:** make group creation mint the token cryptographically, matching
`reset-invite.ts`. Two shapes are acceptable and the implementer picks:
- change the schema default to `@default(uuid(4))` (Prisma's client generator uses
  `crypto.randomUUID`), or
- drop the default and mint with `randomUUID()` in `src/lib/groups/provision.ts`,
  where the group row is written.

Prefer whichever leaves one obvious answer to "where does an invite token come
from." Note that `provision.ts` currently sets no `inviteToken` at all and relies
on the schema default, so the second shape is a real code change, not a rename.

**No migration.** Confirmed against `prisma/migrations/20260619003631_init/migration.sql:37`:
the column has no `DEFAULT` clause, so this generator lives in the Prisma client
only. If `prisma migrate dev` offers to create an empty migration, decline it and
say so in the PR. Do run `prisma generate`.

**Existing rows keep their old tokens.** Production has none. Dev-test's demo groups
are not worth rotating and rotating them would break any link already pasted into a
QA note. Do not write a backfill.

**Verification:** a test that a newly created group's token is not cuid-shaped and
matches the shape the reset path produces. Show it failing against the current
default first; a test that passes on its first run has proven nothing here, because
cuid and uuid are both opaque strings and a lazy assertion would pass on either.

---

## Task 4 — One bad group must not stop Orbit's hourly work for every group

**The defect (audit finding 4, lanes 1, 3 and 6):** `src/lib/orbit/reconcile.ts:130`
re-throws any non-P2002 error. The cron handler
(`src/app/api/cron/orbit/route.ts:49-55`) runs three sweeps in sequence and
`reconcileScheduledEvents` is first, so one unexpected database error in one group
kills that group's recurring plan, every group after it in the same run, and the
other two sweeps entirely (last calls, idea goodbyes, stalled time-change closures).
A one-off glitch costs an hour and heals. A fault that repeats on the same group
keeps Orbit's whole scheduled half switched off until somebody notices, with only a
failed cron run to show for it.

**Do:** give the per-group work the same treatment its two sibling sweeps already
use. `src/lib/orbit/endgame.ts:148` is the pattern: `console.error` with an
identifying id, then carry on. Concretely, replace the `throw err` at
`reconcile.ts:130` with a logged failure result and `continue`, widening the result
union with a `failed` status so the cron response still reports it. Do not swallow
it silently, and do not touch the P2002 branch above it, which is a deliberate and
tested skip.

**Verification:** a test in which the first group's reconcile throws a non-P2002
error and a later group still gets its event created, plus an assertion that the
failure appears in the returned results. Show it failing first: against today's code
the later group gets nothing, so the test genuinely can fail.

---

## Task 5 — Ship the product's own artwork

**The defect (audit postscript item 2):** `public/` still holds five create-next-app
SVGs (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`), all dated
17 June, and `src/app/favicon.ico` is still Next's default 25,931-byte icon. None
were in the audit's file ledger and no lane was pointed at them.

**Do:**
1. Delete all five SVGs. Confirm by search that nothing references them first; the
   audit's own coverage says nobody read `public/`, so nobody has checked.
2. Replace the browser-tab icon with Orbit's mark. The source of truth is
   `src/components/OrbitMark.tsx`, itself ported from
   `docs/design/design-polish-rd-2/orbit-mark.js`. Do not redraw it and do not
   approximate it: the component overflows its slot deliberately (156% width and
   height, transparent slot), so a naive crop loses the moon.
3. Add a home-screen icon. The product's own front door tells people "No app to
   download," which means adding to a home screen is the closest thing to installing
   it, and the icon is what they get. Unlike the tab icon this one is composited on
   an opaque tile, so it needs a deliberate background rather than transparency;
   use the design system's `--surface-base` value.

**Verification:** rendered, not read. Screenshot the tab icon, and the owner
confirms the home-screen icon on his own phone over the LAN address. This is a
visual claim, so per standing rule it is not verified until somebody has looked
at it.

---

## Task 6 — The invite link gets a preview

**The defect (audit postscript item 3):** `src/app/layout.tsx:15` declares `title`
and `description` and no `openGraph`. `generateMetadata` appears nowhere in `src/`.
The invite link is this product's entire distribution mechanism and it previews in
a group text as a bare URL.

**Do:**
1. Add Open Graph and Twitter card metadata to the root layout, with a
   `metadataBase` so relative image paths resolve. Derive the base from Vercel's own
   production URL environment variable with a localhost fallback, so nothing has to
   be edited by hand at deploy time and slice B gains no extra step.
2. Add `generateMetadata` to `src/app/join/[inviteToken]/page.tsx` so the shared
   link's title names the group. It already fetches the group row by token; the
   metadata function is a second lookup by the same unique field.
   - **Title when the token resolves:** name the group.
   - **Title when it does not:** the generic product title. Never leak that a token
     is invalid versus valid through the preview, and never error the page from the
     metadata path.
   - Voice is Orbit's, per the product-voice rules: plain, warm, no em-dashes.
3. One static preview image, Orbit's mark on the design system's base surface, sized
   1200x630. Same image for every group; only the title varies.

**Do not:** add a per-group rendered image, and do not add an `APP_URL` environment
variable. The `.ics` route already solves the same problem by reading the origin off
the request (`src/app/events/[id]/calendar.ics/route.ts:47`); a new env var would be
a second, driftable answer to "what host are we."

**Verification, and the honest limit.** Assert the metadata objects in tests, which
proves the values and nothing about how a phone renders them. The preview itself
cannot be verified in slice A at all: Apple, WhatsApp and Slack cannot fetch a
laptop on a home network. The PR body must say the preview is written and unproven,
and slice B proves it by the owner texting himself the live link. Do not write
"matches" or "works" about this task.

---

## Task 7 — Search engines see the front door and nothing else

**Do:** add a `robots` route or file allowing `/` and disallowing `/groups`,
`/events` and `/join`. Group, event and join URLs are credentials or contain them,
and none of them should ever appear in a search result.

**Note, so nobody later reads this as protection:** `robots.txt` is a request that
well-behaved crawlers honour. It is not access control, and the membership wall
(`src/lib/auth/membership.ts`) is what actually keeps non-members out. Link
unfurlers ignore robots by design, which is why task 6 still works.

**Verification:** a test asserting the generated rules, and a fetch of the route in
the dev server.

---

## Task 8 — Add the two missing pre-deploy checklist items

**The defect (audit findings 1 and 2):** the checklist at `docs/build-notes.md:342`
reads as complete and omits two things, either of which takes the whole site down
on its first request.

**Do:** append two items in the checklist's existing house style (what it is, why it
blocks deploy, detail), and add the append-only correction line noting the new count,
as every previous addition to this list has done.

1. **`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the
   Vercel dashboard.** `src/lib/supabase/env.ts:4` throws by name when either is
   missing, so every page fails on the first request. The item must carry the note
   that these two are inlined at build time, so they must be set in Vercel *before
   the build runs*, not merely before the first visitor. That distinction is the
   whole reason this is a checklist item rather than a fix-it-when-it-breaks.
2. **Turn on anonymous sign-ins in the production Supabase project.** Every identity
   in the product starts as an anonymous session and both doors mint one
   (`src/app/actions/create-group.ts:70`, `src/app/actions/join-group.ts:38`).
   Production is a different Supabase project from the one everything was built
   against, and this is a dashboard switch that does not carry over. If it is off,
   the founder finishes the entire wizard and gets "Could not create a session.
   Please try again." forever, and so does everyone who opens the invite link. The
   message points at nothing, which is what makes this expensive to diagnose and
   cheap to prevent.

**Verification:** the diff. No code.

---

## Task 9 — Read all 14 migration files and report

**The gap:** the audit's own completeness critic found that not one of the 14
`prisma/migrations/*/migration.sql` files was opened by any lane, and 13 of 14 are
not mentioned anywhere in any lane file. Lane 7 audited the *checklist's list of*
migrations without opening one. The critic ran a cheap drift check (every schema
column appears in the SQL, enums intact) and said plainly that nobody proved the
production database can be built from this history alone. That question is answered
for real in slice B, against the empty production database; this task is the read
that makes going in there informed rather than hopeful.

**Do:** read all 14 in order. Look for, and report on:
- Anything destructive or non-idempotent that would behave differently against an
  empty database than against the dev-test one it was authored on.
- Enum values added or renamed, and whether any migration depends on rows existing.
- The `migration_lock.toml` provider matching the production database.
- Any migration that was hand-edited after being generated.
- Whether the checklist's named migrations (items 5, 7, 8, 10) are the complete set
  of what production needs, or whether the list has fallen behind the directory.
  There are 14 directories and the checklist names four; establish whether that gap
  is expected (the checklist calls out only the ones with a stated failure mode) or
  a drift.

**Do not fix anything.** This task reports. Findings go in the PR body and, if any
is load-bearing for the deploy, into the checklist as its own item.

**Verification:** the written report. State explicitly that nothing was executed,
because the run is slice B's, and a read is not a run.

---

## Closing the slice

- Full suite green, before and after numbers in the PR body.
- `npm run build` exit 0.
- An independent read-only reviewer, whose report goes in the PR body.
- A build-notes §11 entry recording what this slice decided, including the two
  corrections it made to its own premises (no migration for the token; the cron
  fix being three lines rather than one).
- A five-minute manual QA script in the chat message, phone-first, with the dev
  server command in a fenced block for the owner to start himself and the LAN
  address read fresh.
- The next slice proposed unprompted. It is slice B, and the one after it is
  email sign-in, both already settled with the owner.
