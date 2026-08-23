# Migration read, 23 Aug 2026

**Nothing was executed.** No command in this pass touched a database, live or
otherwise: no `migrate deploy`, no `migrate dev`, no `db push`, no seed script.
This is a read. The one command run (`prisma migrate diff`) compares two files
on disk and never opens a connection. Applying anything to the production
database is slice B's job, not this one's.

## What was read

- All 14 files under `prisma/migrations/*/migration.sql`, in chronological
  (folder-timestamp) order, start to finish.
- `prisma/migrations/migration_lock.toml`.
- `prisma/schema.prisma` in full, including the datasource block.
- The pre-deploy checklist in `docs/build-notes.md` §11 (items 1 through 13),
  read in full, with particular attention to items 5, 7, 8, 10 and 11, the
  ones that name a specific migration.
- The output of `npx prisma migrate diff --from-empty --to-schema
  prisma/schema.prisma --script`, a read-only, no-database comparison that
  prints the SQL needed to build today's `schema.prisma` from nothing. This
  was used as a second, mechanical check against my own manual trace of the
  14 files, not as a replacement for reading them.

## The six answers

**1. Nothing destructive, and nothing order-dependent in a way that would
behave differently on an empty database.** There is no `DROP TABLE`, no
`DROP COLUMN`, and no backfill `UPDATE` or `INSERT` anywhere in the 14 files.
Every `ALTER COLUMN` either adds a default (`Rsvp.respondedAt`) or loosens a
constraint (`Gauge.sourceMessageId` goes from required to optional in the
wrong-day-retry migration), never the reverse, so there is no
`SET NOT NULL` that could fail against rows that do not exist yet. A few
migrations do drop an index and recreate it under new rules (the group
timezone migration, and the spark-event-creation migration right after it),
but in each case the index being dropped was created by an earlier migration
in this same history, so applying all 14 in order poses no risk. The
"Warnings" comments Prisma prints above several migrations, about a unique
constraint failing if duplicate values already exist, are boilerplate the
generator always writes when it adds a uniqueness rule. They are not a live
risk here, because the production database starts with zero rows in every
table.

**2. Two enum values were added, none renamed, and both additions are safe.**
`ProposalAnswer` gained `SUPERSEDED` (28 Jul) and later `LAPSED` (18 Aug).
`MessageAuthor` gained `SYSTEM` (11 Aug). Postgres will not let you use a
brand-new enum value inside the same transaction that added it, and Prisma
runs each migration file as one transaction. I checked each of these three
additions for exactly that trap: in every case, the `ALTER TYPE ... ADD
VALUE` statement is either the only statement in its file, or the rest of
that file only references enum values that already existed before the
addition. None of the three is used in the same file that adds it, so this
restriction cannot bite during deploy. No migration assumes rows already
exist; there is no `INSERT`, `UPDATE`, or `DELETE` anywhere in the 14 files.

**3. `migration_lock.toml` says `provider = "postgresql"`, and so does
`schema.prisma`'s datasource block.** Both match the production database,
which is Postgres (Supabase). No mismatch.

**4. No sign of hand-editing in any of the 14 files.** I checked every file
for anything Prisma's generator would not have written on its own: raw `DO
$$` blocks, `IF NOT EXISTS` guards, unexplained comments, out-of-order
statements. Every comment in every file is one of Prisma's own standard
markers (`-- CreateEnum`, `-- CreateTable`, `-- AlterTable`, `-- CreateIndex`,
`-- AddForeignKey`, `-- DropIndex`, `-- AlterEnum`) or its standard
auto-generated `/* Warnings: ... */` block. Nothing reads as a manual
patch.

**5. The four-versus-fourteen gap is expected, not drift, with one piece of
its own wording now stale.** Item 5 is a general instruction ("apply pending
migrations to the production database") that covers all of them; `migrate
deploy` cannot selectively apply some migrations and skip others; it walks
the whole history in order. Items 7, 8, 10 and 11 are call-outs, not a
separate to-do list: each names a migration whose specific failure mode is
worth stating out loud (a silent Orbit failure, a broken first join, a sweep
that quietly never closes) precisely because those failures would be
confusing to trace back to a missing column. The other nine migrations
(everything from `add_spark_gauge` through `gauge_endgame_markers`) were
judged not to need their own line, and I found nothing in them that changes
that judgment: none introduces a distinctive silent-failure shape the way
the four named ones do. Separately, and worth flagging on its own: item 5's
own parenthetical, "(currently `add_group_description` and everything
before it)," was accurate on 21 July and has been stale since, since nine
more migrations have landed on top of it without the note being touched.
The instruction itself, "apply pending migrations," still reads correctly
and still covers all 14. I have not rewritten item 5's text, per the
project's append-only rule for this document; the new item below states the
actual command and names the true count, which supersedes the risk of
someone reading item 5's example literally and stopping early.

**6. `migrate deploy` is the right command, not `migrate dev`, including for
a database that has no `_prisma_migrations` table yet.** `migrate deploy` is
built for exactly this: point it at a database with no migration history at
all, and it creates that bookkeeping table itself and applies every
migration file in order, without asking any questions. `migrate dev` is the
local development command. It can prompt to reset (wipe) the target database
when it sees anything it reads as drift, and that prompt is meant for a
disposable dev database, never a production one. This project's own build
notes describe using `migrate dev` routinely against the dev-test database
during normal development, which is exactly the habit that makes it worth
stating plainly here: the production run must be `migrate deploy`, never
`migrate dev`, no exceptions.

## What this adds to the checklist

One new item. The existing checklist tells the reader to "apply pending
migrations" but never names the exact command, and this project's own
day-to-day habit is typing `migrate dev`. That gap is exactly the kind of
thing that causes the wrong command to get typed once, out of muscle memory,
against the one database where it must never run. Added as item 14 in
`docs/build-notes.md` §11, in the checklist's own house style, with its own
correction line.
