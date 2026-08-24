# Slice B: the deploy (24 August 2026)

Slice A was the code, proven locally, merged as PR #80. This is the deploy: the
product reaches a public URL for the first time. Almost every step is the owner's
hands on a keyboard in a browser, not an agent's.

---

## Front section (for the owner)

**Settled, do not relitigate.** Vercel Pro at $20/mo (hourly cron, cold start
prevention, $20 usage credit). Ship on the free `*.vercel.app` host; a custom
domain is deferred and is available on either plan. `prisma generate` goes in via
a `package.json` line, not a dashboard field. The inert pooling item gets a real
code fix. Preview deploys stay unconfigured. Migrations are proven against
production itself, which starts empty.

**Not in this slice.** Email sign-in (the very next slice; it is why nobody gets a
link yet). Web push versus a native shell (a decision after email). A custom
domain (a small follow-up before any real sharing). The recognition-bench repairs
from the audit (their own slice). The remaining audit findings (the triage list).

**How it is verified.** Migrations: `prisma migrate status` clean against
production, then `db:which` proving the checkout never moved. The site: the
front-door render, a group created end to end, and that group joined from a
private window as a second person. The link preview: texted to the owner's own
phone. The cron: registered hourly in Vercel and returning 200 to a real
invocation.

**Debt it is expected to open.** A production database nobody can inspect without
a second checkout. One environment holding secrets that exist nowhere else. A
`CRON_SECRET` with no rotation path. And, surfaced by this slice's own review: when
the database pool is saturated, an ordinary query waits forever (no acquisition
timeout is set) while a write inside a transaction gives up after two seconds and
fails. Nobody chose either number. Queued, not fixed here: it needs traffic we do
not have to know which way to tune it, and guessing now would be the same mistake
this slice just corrected. And whatever the day teaches.

---

## The one thing that is not on the 16-item checklist

**Supabase's Data API may be switched on in the new production project, and if it
is, every table in the product is potentially readable by anyone, using a key that
ships inside the browser.**

The reasoning, in order:

1. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is a `NEXT_PUBLIC_` variable, which
   means it is baked into the JavaScript every visitor downloads. That is correct
   and by design; it is a public key.
2. Supabase's Data API (PostgREST) exposes the `public` schema over HTTP to
   holders of that key. Access is then governed by row-level security.
3. This project's tables were created by Prisma, not by Supabase. Build-notes'
   data-foundation entry states the consequence plainly: "ORM-created tables do
   not get row-level security automatically."
4. So if the Data API is on and the `public` schema is exposed, the members-only
   wall built in the share-readiness slice is bypassable. Not by breaking it, but
   by going around the app entirely.

The dev-test project does not have this problem: the data-foundation entry records
that the Data API and the auto-expose grant were both turned off at project
creation. The production project was created separately, and nothing on the
checklist says to repeat that step, which is exactly the shape of a setting that
gets missed.

**This is a dashboard switch, not code**, so it fits this slice cleanly. It is
Task 6 below and it runs before any production data exists.

**Confidence.** I am confident about points 1, 3 and 4, which come from this
repo's own records and its own code. Point 2 is Supabase platform behaviour and I
have not verified it against a live project in this session. The task is written
as "look, then decide," not as "assume the worst and act."

---

## Two pull requests, not one, and why

Slice A's decision 1 requires the first production build to be cut from **main**.
This slice needs two lines of code in the build itself. So:

- **PR 1** carries this document plus the two code changes. It merges to main
  *before* anything is clicked. The production build then comes from main, exactly
  as decision 1 intended.
- **PR 2** carries the decision record, the CLAUDE.md current-state rewrite, and
  the dated checklist annotations, written *after* the deploy is proven.

This is a deliberate departure from one-document-one-PR. The alternative is
deploying from a branch, which is the specific thing slice A split itself in two
to avoid.

---

## Phase 0: before anything is clicked

### Task 0 — slice-start gates (DONE)

- `main` at `6f8c243`, identical to `origin/main`, working tree clean.
- No stale merged local branches.
- `npm run db:which` → dev-test (`pxbewardwvoyqqcvogel`), all three sources agree.
- Safety-net drift check: clean, no output.
- **Test baseline: 97 files, 955 tests, green, zero skipped.** Cross-checked
  against PR #80's finishing number ("after 97 / 955"): exact match. No
  pre-existing failure to carry.

### Task 1 — `prisma generate` on the build machine

**File:** `package.json`

Add a `postinstall` script running `prisma generate`.

**Why:** Prisma 7 does not generate its client on install (data-foundation slice).
Vercel's build machine has never generated it. Without this, the build fails or,
worse, builds against a stale client. Checklist item 2.

**Depends on** `DIRECT_URL` being set in Vercel before the build runs, because
`prisma.config.ts:13` resolves `env("DIRECT_URL")` eagerly and every Prisma CLI
command, `generate` included, fails to start without it. Checklist item 15. This
is why item 15 is done before item 2 despite the numbering, and why the env vars
in Task 10 go in before the first build.

**Verify:** `rm -rf node_modules/.prisma && npm install` regenerates the client
with no manual step, and `npm test` still reads 97 / 955.

### Task 2 — the pooling fix that actually does something

**File:** `src/lib/prisma.ts:13`

Change `new PrismaPg({ connectionString: process.env.DATABASE_URL })` to pass a
pool ceiling alongside the connection string.

**Why:** audit finding F-6-9. Checklist item 3 tells the owner to put
`connection_limit=1` on the URL. That parameter was for Prisma's old query engine.
This project moved to the `pg` driver adapter in its first slice, and that driver
never reads it: `pg-connection-string` copies unknown query parameters onto the
config verbatim, where they are ignored, and `pg-pool` falls back to its default
maximum of 10. Following item 3 as written produces a tick mark and no protection.

**The number is 10, and getting there took two tries.** *(Amended after review, 24
Aug 2026. The first attempt set 3, on the premise that this app makes many
sequential round trips per write, so a ceiling of 1 would serialize them. The
review checked the premise against the hottest path instead of the write paths and
it does not hold there: `src/app/groups/[id]/page.tsx:82` issues up to
`CARD_REGION_CAP` (5, `src/lib/cards/region.ts:8`) concurrent rsvp lookups in one
`Promise.all`, so a single group-home render wants five connections at once. Any
ceiling below six throttles the most-viewed screen in the product on every render,
and Fluid Compute lets one instance serve several such renders concurrently. The
review also established what saturation actually costs: `pg-pool` sets no
acquisition timeout by default, so plain queries queue indefinitely, while an
interactive transaction aborts at Prisma's 2000ms `maxWait` and throws P2028.
Cutting the ceiling to 3 would have shrunk the margin before that by 3.3x on the
write paths F-6-13 already flags as the longest.)*

So the honest conclusion is close to a decline: **no cap below the pg default of 10
is warranted for this product.** Capping lower buys headroom only in a spike large
enough to need many simultaneous instances, which the audit graded low risk, and
charges for it on every ordinary render. The line is still written explicitly rather
than left to the default, because the value of this change was never the number. It
is that the next reader finds the real knob, and the reason both URL parameters are
not it, in the file where they will look.

**Type-safety already confirmed:** `@prisma/adapter-pg/dist/index.d.ts:42` types
the first constructor argument as `pg.Pool | pg.PoolConfig | string`, and `max` is
a `PoolConfig` field. This compiles.

**Verify:** `npx tsc --noEmit` clean, `npm test` at 97 / 955. There is no honest
test for this: the value's effect only appears under genuine concurrent production
traffic, which no unit test creates. That is stated rather than papered over with a
test that asserts the constant equals itself.

### Task 3 — set `connection_limit=1` on the URL anyway, and record that it is inert

Per the owner's decision, the parameter still goes on the production
`DATABASE_URL` (Task 10). It is harmless.

***Amended after review, 24 Aug 2026: `pgbouncer=true` is inert too, and this
document originally said the opposite.*** The first draft repeated checklist item
3's detail line, that `pgbouncer=true` "is genuinely required" because it stops
Prisma using prepared statements. The review checked it the same way F-6-9 checked
`connection_limit`, and got the same answer: `pgbouncer` appears nowhere in
`@prisma/adapter-pg`, nowhere in the Prisma client runtime, and nowhere in `pg`,
`pg-pool` or `pg-connection-string`. Verified independently before this amendment
was written.

**The safety it was supposed to buy is real, and comes from somewhere else.**
`@prisma/adapter-pg/dist/index.js:655` sets a statement's `name` only from
`pgOptions?.statementNameGenerator?.(query)`. `src/lib/prisma.ts` supplies no
options object, so every statement goes out unnamed, which is exactly what
transaction-mode pooling requires. Nothing about that depends on the URL.

**Why this correction matters more than the first one.** Task 3's stated purpose is
to stop a future reader inheriting a false belief, and the first draft corrected one
false belief while installing a second of the same shape into the permanent record.
The thing that must reach build-notes in PR 2 is therefore all three parts: neither
URL parameter does anything; `max` in `src/lib/prisma.ts` is the pool ceiling; and
the absence of a `statementNameGenerator` is what makes pooling safe, so adding one
later would break pooling no matter what the URL says.

### Task 4 — review, then merge PR 1

Independent read-only review before merge, per standing rule. **Open question for
the owner, raised in chat rather than decided here:** this session's harness
forbids spawning subagents unless the owner asks for one, and the reviewer is a
subagent. Either the owner authorises it, or the review is skipped for a two-line
config change and the skip is recorded as a declared deviation. Recommendation:
authorise it. It costs a few minutes and the file being touched is the database
client, on the day of the first production deploy.

After merge: `git checkout main && git pull`, confirm local matches origin, delete
the merged branch. **Nothing in Phase 1 onward starts until main carries these two
lines.**

---

## Phase 1: the accounts

### Task 5 — upgrade Vercel to Pro

Owner's hands. Confirmed on Hobby today.

**Why first:** hourly cron (`vercel.json` already asks for `0 * * * *`) is a Pro
capability. Doing it before the project exists means nothing has to be redone.

**If a free trial is taken instead of paying immediately:** put the trial end date
in a calendar the same day. A lapsed trial drops the project to Hobby, and hourly
cron stops being honoured, silently. That is precisely the failure mode the Pro
decision was made to avoid, on a delay.

**Verify:** the account or team scope shows Pro.

### Task 6 — the production Supabase project: three settings, in one visit

Owner's hands, guided one step at a time.

**6a. Note the region.** Needed in Task 9 so Vercel's functions run next to the
database rather than across an ocean. Audit F-6-13: every write makes many
sequential round trips, so region mismatch multiplies.

**6b. Note the project ref.** The string in the project URL. Needed in Task 8 to
prove the migration command is pointed at production and not anywhere else, and to
prove afterwards that the checkout came home to dev-test.

**6c. Turn on anonymous sign-ins** (Authentication → Sign In / Providers →
Anonymous sign-ins). Checklist item 13. Every identity in the product starts as an
anonymous session and both doors mint one. With this off, the founder completes the
entire wizard and gets "Could not create a session. Please try again." forever, and
so does everyone opening an invite link. The message points at nothing.

**6d. Check the Data API,** per the section at the top of this document
(Settings → API → Data API, exposed schemas). If the `public` schema is exposed,
turn the Data API off, matching what dev-test already does. If turning it off is
not offered, remove `public` from the exposed schemas. Report what is actually on
screen before changing anything; if the dashboard shows something this document did
not anticipate, stop and describe it rather than guessing.

### Task 7 — confirm the model spending ceiling

Owner's hands, read-only. Checklist item 9, satisfied per the 11 Aug amendment by
the provider-side hard cap: prepaid credit with auto-reload **off**. Confirm in the
Anthropic Console that auto-reload is still off before the URL is public.

**Why it matters here specifically:** every model call in the product is reachable
by an anonymous stranger with no sign-in, because identity is anonymous-first by
design. The cap converts unbounded spend risk into downtime risk, which was
accepted knowingly, and the out-of-credit screen built in the hardening slice is
the face of that downtime.

---

## Phase 2: the migrations, and the one genuinely dangerous step

### Task 8 — apply all 14 migrations to production

**This is the single most dangerous step in the slice.** It is the one moment where
a command on this machine points at production. The rule it can break, "two
databases, never crossed," is the only rule in this project with no undo.

**Who runs it:** the owner, because the command carries a production credential and
that credential is never pasted into this conversation.

**The exact procedure, in order, with nothing skipped:**

1. `npm run db:which` → must print dev-test. If it prints anything else, stop.
2. The owner copies the production **session pooler** connection string (port
   **5432**, not 6543) from the Supabase dashboard.
2b. **Pre-flight eyeball, added after review.** Before running anything, confirm the
   copied string contains the **production** project ref from Task 6b and `:5432`.
   Task 6b asked for that ref precisely so it could be checked here, and the first
   draft then never used it. The asymmetry means this is robustness rather than
   rescue (pasting the dev-test string by mistake is a harmless no-op, and step 5
   would expose it as 14 still pending), but a step with no undo should not rely on
   its own mistakes being the survivable kind.
3. The owner runs, in this checkout, with the real string in place of the
   placeholder:
   `DIRECT_URL="<production session pooler URL>" npx prisma migrate deploy`
4. `npm run db:which` **immediately**, before anything else at all → must print
   dev-test. This is what proves `.env` was never touched.
5. `DIRECT_URL="<same URL>" npx prisma migrate status` → 14 applied, none pending.

**Why the method matters more than the command name** (checklist item 14's
amendment): the Prisma CLI reads `DIRECT_URL` out of `.env`, and `.env` is also
what the test suite reads. These are integration tests that create and delete real
records. An `.env` edited to production and not reverted means the next `npm test`
writes rows into the production database and deletes them again. The inline
one-off override cannot leave that residue, because nothing persists past the
command.

**`migrate deploy`, never `migrate dev`.** `migrate dev` is the local development
command and can prompt to reset, meaning wipe, whatever database it is pointed at.
This project's daily habit is typing `migrate dev` against dev-test, which is what
makes the wrong command a muscle-memory risk rather than a theoretical one.

**What we expect:** the migration read (`docs/audits/findings/2026-08-23-migration-read.md`)
traced all 14 files and found no `DROP TABLE`, no `DROP COLUMN`, no backfill, no
enum value used in the same transaction that adds it, and a `migration_lock.toml`
matching Postgres. It also cross-checked the history against `schema.prisma` with
`prisma migrate diff` and found them in agreement. Strong reason to expect a clean
run. Not proof. This command is the proof, and it runs against a database with
zero rows, so the cost of being wrong is a failed command and a fix.

**Shell-history note:** the production URL will sit in shell history. Minor, worth
knowing. Prefixing the command with a single space skips history in zsh when
`HIST_IGNORE_SPACE` is set.

---

## Phase 3: the Vercel project

### Task 9 — import the repo, with the variables in place before the first build

The checklist's "read this first" block warns that importing starts a build on its
own, which is true and is why the ordering matters. Vercel's import screen has an
Environment Variables section **before** the Deploy button. Use it. That avoids the
failed-build-then-redeploy dance entirely.

If a build has already run without them: nothing is broken and nothing is lost.
Add the variables, then redeploy so a fresh build picks them up. Checklist item 16.

Also on this screen or immediately after: set the function region to match Task 6a.
Confirm Vercel detected Next.js and did not need a build command override; the
`postinstall` from Task 1 is what carries `prisma generate`.

**Preview deploys now fail earlier than they used to, and that is fine but should
be said out loud** *(added after review, 24 Aug 2026)*. With Preview scope left
empty by the owner's decision, `DIRECT_URL` is unset there, `prisma.config.ts`
resolves it eagerly, and so `npm install` itself fails on every future branch push,
rather than the build failing later or the site being broken. Cheaper and louder
than the alternative, so no change of course. Two consequences worth knowing: every
future PR will carry a red Vercel check that means nothing, and if that becomes
annoying, preview deployments can be switched off entirely in the project's Git
settings. Offer that to the owner once he has seen one.

### Task 10 — the six environment variables, Production scope only

All six go to **Production** only. Preview and Development stay empty, per the
owner's decision, which keeps production credentials in exactly one place.

| Variable | Value | Checklist item |
|---|---|---|
| `DATABASE_URL` | production **transaction** pooler, port **6543**, with `?pgbouncer=true&connection_limit=1` | 3 |
| `DIRECT_URL` | production **session** pooler, port **5432** | 15 |
| `NEXT_PUBLIC_SUPABASE_URL` | production project URL | 12 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production publishable key | 12 |
| `ANTHROPIC_API_KEY` | the owner's key | 4 |
| `CRON_SECRET` | freshly generated, never committed | 1 |

**Two ports, two different jobs, and swapping them is a real hazard**: 6543 is the
transaction pooler the running app uses; 5432 is the session pooler the Prisma CLI
uses for migrations. The literal `db.[ref].supabase.co` host is deliberately not
used for either: it is IPv6-only and fails on IPv4 networks (data-foundation
slice).

**The `NEXT_PUBLIC_` pair is baked into the site at build time.** Setting them
after a green build changes nothing until the next build. This is the single most
likely way to end up with a green deploy and a dead site.

**`CRON_SECRET` is generated by the owner**, not read out in chat, with
`openssl rand -hex 32`. Vercel sends it automatically as
`Authorization: Bearer <CRON_SECRET>` on cron invocations, and
`src/app/api/cron/orbit/route.ts:32` verifies it. With the secret absent in
production the route returns 401 by design, so Orbit's hourly job would exist and
do nothing.

### Task 11 — deploy, and confirm the cron registered hourly

After the deploy goes green, check Vercel's Cron Jobs tab: the schedule read from
`vercel.json` should be hourly, not rejected or downgraded. If it was rejected, the
Pro upgrade did not take effect and Task 5 needs revisiting before anything else.

---

## Phase 4: proving it actually works

**A green deploy and a working site are not the same thing.** Vercel reports
success when the code compiled. Every failure this document warns about is
invisible from that dashboard.

### Task 12 — the walk (checklist item 16)

Owner's hands, on his phone where it says phone.

1. Open the site's front door. It should render the designed screen: the 104px
   Orbit mark, the pitch, one teal "Start your group" pinned at the bottom.
2. Take "Start your group" all the way through to a real created group. This
   exercises the database, the anonymous session, the model call, and the invite
   token in one pass, which is most of items 1 through 15.
3. From the group, open group info and copy the invite link.
4. Open that link in a **private window**, which is a different person as far as
   the product is concerned, and join. Confirm the "joined" line appears in the
   feed.
5. Confirm the group home renders in the group's timezone.

Anything that fails names itself in the Vercel function logs for that request.

### Task 13 — the link preview, on a real phone

Owner texts himself the live invite link. Expected: a card naming the group, with
the shared static image, not a bare URL. This is written but unproven; it cannot be
tested locally, which is why it is verified here. Slice A's own hardest bug was in
exactly this code and was found by rendering rather than by testing.

### Task 14 — the favicon, in production

`/favicon.ico` must return 200. Slice A shipped a real `.ico` on 24 Aug after
discovering Chrome requests it on every page load regardless of what the icon tag
says, and that the 404 had been recorded too generously as a rare edge case. Worth
one check in production because that is where "every visitor's first load" is real.

### Task 15 — the cron, actually invoked

Confirm a real invocation returns 200 in Vercel's logs, rather than assuming the
schedule implies the endpoint works. A 401 here means `CRON_SECRET` is missing or
mismatched.

### Task 16 — final `db:which`

`npm run db:which` → dev-test. The last word of the day belongs to the rule that
matters most.

---

## Phase 5: the record

### Task 17 — PR 2

- **build-notes §11:** the slice's decision record entry, 400 to 600 words,
  including the Data API finding and what was actually found on screen, the pool
  number and its reasoning, and the fact that `connection_limit` is inert.
- **Dated checklist annotations**, append-only: what was ticked, and item 3's
  correction so nobody re-derives the wrong belief.
- **CLAUDE.md current-state:** rewritten to say the product is deployed, at what
  address, and that email sign-in is next.
- **A queued reminder** that web push versus a native notification shell is the
  decision after email, at the owner's explicit request.
- **The pre-deploy checklist's own closure**, since after today it describes
  something that has happened.

---

## Open questions for the owner

1. **The reviewer subagent for PR 1** (Task 4). Authorise, or record a declared
   deviation for a two-line change?
2. **What the Supabase Data API screen actually shows** (Task 6d). Cannot be known
   until it is looked at; the response may change what Task 6d does.
