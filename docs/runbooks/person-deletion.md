# Deleting somebody's data

Someone emailed asking to be forgotten. This is everything you do, in order, from
the reply to the last click in the Supabase dashboard. Read the whole thing once
before you start. Nothing here needs you to read code.

---

## 1. Reply to the email first

Before anything else, send something back so they know it landed. This is what
the privacy notice already promised them, so don't promise anything different:

> Got it, thanks for letting me know. I'll delete your account and everything
> tied to it by hand within the next seven days, and I'll reply again once it's
> done.
>
> If you started a group that other people are still using, I'll need to check
> with you first about who should take it over there, so the group doesn't
> disappear along with your account. I'll follow up separately if that's the
> case.

That second paragraph only turns out to matter sometimes. Section 6 below is what
you do if it does. You won't know until you run the script.

---

## 2. Confirm which database you're on, before touching anything

```bash
npm run db:which
```

It must print `DEV-TEST`. Do this now, even if you're about to point things at
production on purpose in a minute. This is the plain habitual check, done with no
overrides in place, so you know for certain the checkout was resting on dev-test
before you started changing anything. The deletion script checks this again on
its own every time it runs, but that check comes second. Yours comes first.

---

## 3. Pointing this at production

Everything runs against dev-test by default, which is safe to rehearse on but
does nothing for the person who actually asked to be deleted. To reach
production, set three connection details on the very same command line that
runs the script, never in `.env`. That's the same rule the migration runbook
uses and for the same reason: a `.env` left pointing at production means the
next ordinary `npm test`, or the next time anyone forgets and just runs the
script plain, quietly touches real people's data instead of the test database.

Two of the three come from the Supabase dashboard for the production project,
and one from the same 1Password item the migration runbook already uses.

- **`NEXT_PUBLIC_SUPABASE_URL`** isn't actually secret: it's just the
  project's own address, with no password or key riding along inside it, the
  same thing you'd see in the Supabase dashboard's own address bar. (Despite
  the name, this app never actually sends it to a visitor's browser: only two
  server-side files ever read it, so the `NEXT_PUBLIC_` prefix doesn't do
  here what it usually means. That's a fact about this codebase, not the
  reason it's safe to type; it's safe because of what the value itself is.)
  Copy it from the production project's Settings > API page in the Supabase
  dashboard. It looks like `https://xxxxxxxx.supabase.co`.
- **`DATABASE_URL`** and **`DIRECT_URL`** both use the one connection string
  already saved in 1Password for migrations, the session pooler on port 5432:

  ```bash
  op read 'op://Personal/Supabase IPG production/session pooler 5432'
  ```

  *Why the same value goes in both, worth knowing rather than taking on faith:
  the live app in production normally uses a different connection for
  `DATABASE_URL` (the transaction pooler), which isn't saved anywhere in this
  project's 1Password vault. This script only ever runs a handful of queries
  and one transaction, by hand, from a laptop, nothing like the live app's
  ongoing traffic. The session-pooler connection the migration runbook already
  proves safe for exactly this kind of careful, one-off, terminal-driven work
  covers this too. This is a judgment call made while writing this document,
  not something an actual production run has confirmed.*

Put all three on the one line that runs the script:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://PASTE_FROM_SUPABASE_DASHBOARD.supabase.co" DATABASE_URL="$(op read 'op://Personal/Supabase IPG production/session pooler 5432')" DIRECT_URL="$(op read 'op://Personal/Supabase IPG production/session pooler 5432')" npm run person:delete -- --email jesse@example.com --i-know-this-is-production
```

The `--i-know-this-is-production` flag is required. Without it, the script
refuses outright the moment it notices the checkout isn't dev-test, rather than
guess what you meant. With it, it prints a WARNING naming the project ref it
found and proceeds. Read that warning before doing anything else: check the ref
it names against the ref shown in the production project's own Supabase
dashboard URL. If anything about the three values is missing or the three
disagree with each other, it refuses outright regardless of the flag; that's
by design, not a bug to work around.

---

## 4. Running the deletion script

Everything below happens through one command, `npm run person:delete`. It talks
to whichever database your terminal is pointed at. Read this section fully
before you touch production with it: try it once against dev-test first if
you've never used it, using a name from the QA data instead of a real person,
so the first time you see all of this is not the one time it's for real.

### Finding the person

If they gave you an email address, use it:

```bash
npm run person:delete -- --email jesse@example.com
```

If they never gave one (the privacy notice says giving one is always optional),
you'll need their name and which group they're in instead:

```bash
npm run person:delete -- --name "Jesse Rivera" --group "Climbing Crew"
```

If more than one person matches, either because two people share that exact
name, or because two different accounts have the same email address on file
(the product doesn't currently stop that from happening, and a few duplicate
accounts already exist for other reasons), the script won't guess. It prints
all of them, each with an id, when they joined, and which groups they're in,
and stops. Re-run the same command with `--user-id` set to the one you mean,
copied from that list:

```bash
npm run person:delete -- --email jesse@example.com --user-id cabc123xyz
```

That id is a random internal id, not their email address. It's fine to have it
on screen.

### Reading the plan

Once it finds exactly one person, it prints a plain-English readout of what
deleting them would do, before it does anything. Read all of it. It covers:

- **What goes with them:** their spot in every group, their RSVPs, their votes
  on ideas and on time-change requests, any time-change request they made
  themselves, and their email address if they had one on file.
- **What stays behind:** their chat messages stay in the group, just with their
  name replaced by "Former member." Any idea they floated stays too, same
  treatment. This is on purpose (the privacy notice says so): pulling a message
  out entirely would leave everyone else's replies not making sense.
- **Whole groups going with them:** if they started a group and nobody else is
  in it, that group is named here and it goes too, automatically, no extra
  confirmation beyond the one at the end of this section.
- **An open time-change vote, if they have one:** if they asked to move a plan
  and the group hasn't finished deciding, you'll see a note about it. Deleting
  them doesn't undo votes already cast, but nobody can finish deciding it once
  the person who asked is gone. Read the note; it may be worth letting the group
  settle that first.

If instead it says **"This person cannot be deleted yet,"** stop here and go to
section 6. That's the founder-with-members case, and it isn't handled by this
script.

### The "joined" line questions

If the plan is clear to proceed, before you get to the final confirmation, it
walks you through every "\<name\> joined" line in the product that might belong to
this person, one at a time, and asks whether to delete each one. These are the
quiet centered lines a group's chat shows the moment somebody first joins
through the invite link. The product can't always be sure which ones are really
this person's, so it shows you every candidate and asks.

Each one is labeled with how sure it is:

- **"definitely them,"** they're still a member of that group right now. Safe
  to say yes; the default is yes if you just press Enter.
- **"probably them,"** they're not a member anymore, but they left some other
  trace there: a message, an RSVP, a vote. Also defaults to yes.
- **"doubtful, could be a different person,"** nothing else ties them to that
  group at all. This is the one to slow down on. It could genuinely be them
  (someone who joined, never said anything, and left leaves no other trace), or
  it could be a total stranger who happens to share their name. **The default
  here is no.** Only say yes if you have some real reason to believe it's
  actually them, something you know that the product doesn't. When in doubt,
  press Enter and leave it alone: leaving a real match untouched costs nothing
  you can't fix later by hand, but deleting a stranger's join line is itself a
  small privacy mistake against somebody who never asked for anything.

### Confirming for real

After the join-line questions, it says "This cannot be undone" and asks you to
**type the person's name exactly**, not "y" or "yes." Use the spelling shown
earlier in the "Found: ..." line, including capitalization. If it doesn't match
character for character (extra or missing spaces at the ends are the only thing
it forgives), it prints "That didn't match. Nothing was deleted." and stops.
Nothing you did up to that point is undone or lost; just run the whole command
again from the top.

This is the one deliberate piece of friction in the whole script. There's no
button, no checkbox, no "y" that does it. You have to type the name.

### What you'll see when it's done

A short receipt: confirmation that they're deleted, which groups (if any) were
deleted along with them, a summary of everything else removed, and how many
"joined" lines were deleted. Then, immediately after, the Supabase step below.

If instead of a receipt you see a message about somebody having joined one of
their groups "since this plan was built," that's not an error. Read section 7.

**If you see any other error, one this document doesn't name** (a dropped
connection, a slow network, a Prisma error you don't recognize, anything
that isn't the two things named above): nothing was deleted. The whole
deletion, from the join lines to the account itself, runs as one database
transaction, and a transaction is all-or-nothing by construction: if any part
of it fails, the database rolls back everything in it, not just the part that
failed. This is the same guarantee the "somebody joined since the plan was
built" case above relies on, just triggered by something else instead. It's
always safe to just run the same command again from the top. (Confident about
this: it's how a database transaction works, and this repo's own tests
confirm a failed run leaves every row exactly where it started. What hasn't
been tested is a transaction failing on a *slow connection* specifically,
since that would mean actually waiting out the transaction's own 30-second
clock in a test.)

**Once you're done running production commands for this person** (a receipt,
or a trip through section 6 and back), run `npm run db:which` one more time,
plain, with nothing set on the line. It must print `DEV-TEST` again. The
migration runbook treats this same check as its own closing step, because a
production pointer left sitting in `.env` quietly corrupts the next ordinary
`npm test`. The risk is smaller here, since nothing above ever set a
production value anywhere but on the single command line that used it, so
there's nothing sitting in this terminal to revert. It's the same cheap
insurance anyway, in case something got typed differently than shown (an
`export` instead of the inline prefix, say) and left this terminal quietly
pointed at production without you noticing.

---

## 5. The Supabase dashboard step

The script cannot finish this part on its own: the app has no key that's allowed
to delete a login, only to read and write the group data. Almost every real
person has a Supabase login on file (everyone gets one automatically the moment
they first open the app, before they've even joined a group), so expect to see
this step almost every time.

Right after the receipt, the script prints one of two things.

If it says **"No Supabase login was on file"**, you're done. Nothing further to
do.

Otherwise it prints something like:

```
One more step, outside this script: Jesse's login is still on file with Supabase.
Supabase auth id: 3f9a2c10-...
Open the Supabase dashboard (Authentication > Users), find that id, and delete it there.
```

Do exactly that: open the production project in the Supabase dashboard, go to
Authentication, then Users, search for that id, and delete the row.

**If you skip this step:** nobody else is harmed, and their group data is
genuinely gone from our own database. But their email address, if they ever
gave one, is not gone: it's still sitting on that orphaned Supabase login,
because that's the row `requestEmailAttach` and `confirmEmailAttach` wrote it
to in the first place (`src/lib/auth/email.ts:172` and `:237`). The privacy
notice promises their email address is deleted. Skipping this step leaves
that promise unkept, not just untidy, for as long as the login sits there. It
can be done later and nothing about our own data depends on the timing, but
don't reply "done" to the person who asked, and don't treat the script's
receipt as the finish line, until this step is actually done.

---

## 6. The founder-with-members case

This is the one situation the script refuses to touch, on purpose. It comes up
rarely (only when the person you're deleting started a group that other people
are still actively part of), and rare is exactly when a written set of steps
earns its keep, so read this slowly the first time you actually hit it.

### How you'll know

The script's own printout says it plainly: **"This person cannot be deleted
yet,"** followed by each group they founded that still has other people in it.
For each one, it also prints the group's own id and every other member's user
id, one per line, right under the sentence naming them, each line ending in
the id itself so you can select straight from the end of the line and paste.
It looks like this:

```
This person cannot be deleted yet.

They started the group "Climbing Crew", and 2 other people are still in it: Sam Rivera, Alex Kim.
  Group id: cgrp7k2n1abcxyz
  Sam Rivera's user id: cusr4m9p2xyzabc
  Alex Kim's user id: cusr8q1w3defghi

What to do next:
  1. Ask the group who should take over as the founder of that group.
  2. Hand the group over by hand, following docs/runbooks/person-deletion.md. There is no in-app way to do this yet.
  3. Run this script again. Once they are no longer the sole founder of a group with other people in it, it will be ready to delete them.
```

It then tells you, in its own words, to follow this exact document. Nothing
was deleted. Nothing needs undoing.

**If it lists more than one group,** the person founded more than one group
that still has other people in it. Everything below has to be done once for
each group listed, since each is a separate decision (the group might not
want the same person taking over each time), before the script will let this
person be deleted at all.

### What to do

**Email the founder** (that's the person you're trying to delete, since
they're still the founder). Tell them their account can't be removed while
they're still the only one who can run the group they started, and ask who
among the group's current members should take over. Wait for a real answer;
don't guess. If more than one group is listed, ask about all of them in the
same email.

**Copy the two ids you need.** They're already on your screen: the group's own
id, printed right under the sentence naming that group, and every other
member's user id, printed right below that. Once you know from the founder's
reply which person is taking over, use that person's line. You don't need to
open a database tool or look anything up anywhere else; both ids the next
step needs were already sitting in the script's own output the moment it
refused. If that's gone by the time you hear back (a reply to an email can
take days, and the terminal is often closed by then), just run the exact
same lookup command again: it changes nothing on this path, so it's safe to
run as many times as you need, and it will print the same ids again as long
as the group's membership hasn't changed in the meantime.

**Run the reassignment.** This is the one and only line that actually changes
anything. Paste the group id and the chosen person's user id into the
placeholders before running it:

```bash
DIRECT_URL="$(op read 'op://Personal/Supabase IPG production/session pooler 5432')" npx prisma db execute --stdin <<'SQL'
UPDATE "Group" SET "founderId" = 'PASTE_NEW_FOUNDERS_USER_ID_HERE' WHERE id = 'PASTE_GROUP_ID_HERE';
SQL
```

This single field, `founderId` on the group's own row, is the entire thing that
makes someone the founder. Nothing else in the product needs to change alongside
it: every place that checks who the founder is (leaving a group, resetting the
invite link, removing a member) reads this same field fresh, every time, rather
than remembering it anywhere else. It carries no separate confirmation step of
its own, because it's a direct database statement rather than something the app
runs, so type it carefully and double-check both ids before pressing Enter.
There is no dry run for this one line; the SQL migration runbook's caution about
running things carefully in a terminal, outside the Claude Code app, applies
here too.

**If more than one group was listed, repeat the last two steps for each one**
(its own ids are already printed further up, right under that group's own
name) before moving on. The script checks every group this person founded,
not just the first, so it will keep refusing until all of them are resolved.

**Re-run the deletion script**, with the exact same command you used to find
the person the first time (section 4). With the founder role moved off every
group that needed it, none of them should block anything anymore, and you
should now see the ordinary "here's what deleting them will do" plan instead
of the refusal.

*A note on how sure this document is about that last line: reading the code that
checks "who is the founder" everywhere it appears in the product confirms this
one field is the only thing that decides it, and nothing else needs to move with
it. But nobody has actually run this reassignment against a real production
group yet. If re-running the script still refuses after this, stop and don't
guess further; something about the situation doesn't match what's described
here.*

---

## 7. If it stops partway through and says somebody "joined since the plan was built"

This is the script protecting a stranger, not failing. It happens if somebody
taps a still-live invite link and joins one of this person's solo-founded groups
in the exact window between the plan being shown to you and you typing the
name to confirm. If that happened and the script deleted the group anyway, it
would take a brand new, unrelated person's membership down with it, without
either of you ever knowing.

Nothing was deleted when you see this. The right response is simply to run the
same command again. It builds a fresh plan against the database as it actually
is right now, and this time it'll account for whoever just joined. Don't look
for a way around it; there isn't meant to be one.
