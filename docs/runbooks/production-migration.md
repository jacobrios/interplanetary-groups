# Running a migration against production

Two `op` commands. Neither contains a secret, so both are safe to save, paste, and read
aloud: the credential is fetched at the moment the command runs and never touches the
clipboard, the screen, or shell history.

**0. Go to the checkout that holds the new migration.**

If the slice was built in a worktree, that is the worktree, not the main checkout:

```bash
cd ~/code/interplanetary-groups/.claude/worktrees/<slice-worktree>
```

Only if the migration is already merged to `main` is the main checkout the right place:

```bash
cd ~/code/interplanetary-groups
```

A slice worktree is normally set up with `.env` and `node_modules` symlinked from the main
checkout. Confirm both are there (`ls -la .env node_modules`) before step 1: without the
`.env` link, step 3 cannot print `DEV-TEST`, and without `node_modules`, `npx prisma` may
fetch whatever Prisma version is current, which is the release-candidate trap below.

Why: before the merge, a slice's migration exists only in its worktree. Run from the main
checkout and `migrate status` reports nothing pending, which reads as "already applied"
and is not. Found 24 September 2026 while applying the editable event card's migration.

**1. Rehearse. Read-only, changes nothing.**

```bash
DIRECT_URL="$(op read 'op://Personal/Supabase IPG production/session pooler 5432')" npx prisma migrate status
```

**2. Apply, only if step 1 looked right.**

```bash
DIRECT_URL="$(op read 'op://Personal/Supabase IPG production/session pooler 5432')" npx prisma migrate deploy
```

**3. Confirm the checkout is back on dev-test.**

```bash
npm run db:which
```

It must print `DEV-TEST`. If it does not, stop.

**If any `op` command above errors, do not improvise a workaround.** Jump to
[When `op` errors](#when-op-errors) at the end of this file. It is a two minute fix, and it
has already cost one incident more time than it should have.

---

## Why it is shaped this way

**The URL goes on that one command and never into `.env`.** The Prisma CLI reads `DIRECT_URL`
from `.env`, and so does the test suite, whose tests create and delete real rows. An `.env`
left pointing at production means the next `npm test` writes into production and deletes
again. That is the one mistake in this project with no undo.

**Rehearse first.** `migrate status` is read-only and costs nothing when it fails. On 28
August 2026 it caught two mistakes for free before either could touch the database.

**Run it before the merge, never after.** The columns a migration adds are read the moment
the merged code goes live. Several independent call sites fetch whole rows, so a production
database missing a column takes the entire site down for every signed-in person, not one
feature. The other order is harmless: production briefly carries columns the live code has
never heard of.

~~**Run it in a terminal outside the Claude Code app.**~~ ~~A terminal-reading tool exists in that session.~~
~~The `op read` form removes the exposure anyway, which is most of why it exists.~~
*(Amended 24 September 2026: your own Terminal is still the default, and the Claude desktop
app's terminal pane is now a named fallback, see [When `op` errors](#when-op-errors), and it is safe for the
reason the struck sentence already gave: `op read` never prints the credential, so a
terminal-reading tool has nothing to read.)*

---

## Traps, each of which has actually happened

**Port 6543 hangs instead of failing.** 6543 is the transaction pooler and cannot grant the
advisory lock Prisma takes before migrating, so `migrate deploy` sits forever with no error
and no cursor. **5432, the session pooler, is the one.** Ctrl-C is safe and applies nothing;
re-run `migrate status` to confirm. This looks like a network problem and is not.

**The Prisma CLI offered an upgrade to 8.0.0-rc.12 during the 31 August run. Do not take it,
or any release candidate it offers.** It had nothing to do with the outage, and mid-incident
is the worst possible moment to change the tool doing the migrating. Ignore it and carry on.

**Storing both pooler URLs in one item is how the wrong one gets used.** The `op read`
reference names the field, which is what makes this unrepeatable once the command is saved.

**The field must hold the value, not the assignment.** Store `postgresql://...` alone. A
field containing `DIRECT_URL="postgresql://..."` produces `P1013: the scheme is not
recognized`, because the scheme becomes `DIRECT_URL=`.

**Parentheses break a secret reference.** `op` rejects them outright, which is why the item
is named `Supabase IPG production` and not `Supabase (IPG production)`.

**A renamed item breaks the reference.** It fails loudly and names the path, so it is an
annoyance rather than a hazard. The item ID is rename-proof if that ever becomes worth the
unreadability.

---

## Diagnosing without exposing anything

These print a yes/no and a number. Neither reveals any part of the value.

```bash
op read 'op://Personal/Supabase IPG production/session pooler 5432' | grep -q '^postgresql://' && echo "starts correctly" || echo "does NOT start with postgresql://"
```

```bash
op read 'op://Personal/Supabase IPG production/session pooler 5432' | wc -c
```

A full connection string runs roughly 110 characters. Around 40 means the field holds only
the password. A count about 13 too high means the `DIRECT_URL="` prefix is still in there.

---

## When `op` errors

None of these is a dead end, and each has a known way through below. The
`no account found for filter` case cost real time
on 31 August 2026, because its answer was filed under installing from scratch, and nothing
was gone.

**`account is not signed in`** means you are signed out. That is the whole fix:

```bash
op signin
```

It asks you to authenticate, by fingerprint on this machine. Re-running `op whoami` will not
do it: on 31 August that kept printing the same error with the app open, unlocked and signed
in, and raised no prompt. If `op signin` itself fails, quit and reopen the 1Password app,
unlock it, and try once more before anything else.

**`no account found for filter`** means no account is attached to the CLI at all. Turn the
integration on first, in the 1Password app under Settings, Developer, "Integrate with
1Password CLI", then `op signin` as above.

**`No accounts configured`**, or a plain `op signin` telling you to run
`eval $(op signin)` instead. Try that first:

```bash
eval $(op signin)
```

If it still cannot reach 1Password, run the whole migration from the terminal pane inside
the Claude desktop app instead. On 24 September 2026 the owner's macOS Terminal failed
exactly this way while the app's pane reached 1Password normally, and the migration ran
there. It is safe because `op read` never prints the credential. **The cause is not known.**
A macOS permission for Terminal is the leading guess, and resetting it did not fix it.

Whichever case it was, confirm with the safe check above, which prints `starts correctly` and nothing
else.

### Installing from scratch, if `op` is gone entirely

```bash
brew install --cask 1password-cli
```

Then the integration toggle and `op signin`, both as above. Once a session exists,
`op whoami` names the account.
