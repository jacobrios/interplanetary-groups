# Running a migration against production

Two commands. Neither contains a secret, so both are safe to save, paste, and read
aloud: the credential is fetched at the moment the command runs and never touches the
clipboard, the screen, or shell history.

```bash
cd ~/code/interplanetary-groups
```

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

**Run it in a terminal outside the Claude Code app.** A terminal-reading tool exists in that
session. The `op read` form removes the exposure anyway, which is most of why it exists.

---

## Traps, each of which has actually happened

**Port 6543 hangs instead of failing.** 6543 is the transaction pooler and cannot grant the
advisory lock Prisma takes before migrating, so `migrate deploy` sits forever with no error
and no cursor. **5432, the session pooler, is the one.** Ctrl-C is safe and applies nothing;
re-run `migrate status` to confirm. This looks like a network problem and is not.

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

## Setup, if `op` is ever gone

```bash
brew install --cask 1password-cli
```

Then in the 1Password app: Settings, Developer, "Integrate with 1Password CLI". Then
`op signin`, with the app running and unlocked. `op whoami` should name the account.
