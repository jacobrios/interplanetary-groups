# Cancelling one occurrence of a recurring event

Slice design, 2 September 2026. Branch `cancel-one-occurrence`, cut off `1cebfd4`.

---

## Front section

**Settled before this slice, do not relitigate.** The seven decisions in build-notes §11
("Cancelling one occurrence: decided in planning, before the slice"): anyone can cancel; no group
vote; two-tap confirm, never type-to-confirm; undoable by anyone; a button on event detail, never on
the group home card; feed announcement only; cancel sets a status and never deletes the row.
Settled in this session and equally closed: Orbit's announcement **names the person who cancelled**,
and the digest's "you missed" block **carries cancellations**, derived from event rows rather than by
widening its MEMBER message filter.

**Non-goals.** Proposing a cancellation for the group to vote on, and the immediate cancellation
email: both queued in build-notes §11 with reasoning, both genuinely different features. Orbit
hearing "rained out" in chat: declined there, because recognition is the expensive half. The founder
editing group details: parked, spec at
`docs/superpowers/specs/2026-09-02-founder-fixes-group-details-design.md`.

**How this is verified.** Test-suite baseline, run at slice start rather than copied: **1581 passed
across 140 files, zero failures**. Every behaviour below gets a test written failing first. The one
that matters most is the decision-7 pin: `hasUpcomingScheduledEvent` must still see a cancelled row,
and reconcile must not recreate the occurrence. Deliberately **not** tested: no model call and no
eval bench anywhere in this slice; reaching for one means the design has crossed into the declined
chat-recognition scope. The card and detail treatments get component tests, and additionally a
browser pass at 375x812 and a real-phone pass, because the card region's height budget is in play.

**Debt this slice expects to open.** The product's first stored Orbit message body containing a
member's name, which person-deletion cannot reach. And a member who already saved the plan to their
own calendar still gets buzzed, with no path to a corrected `.ics`. Both detailed in "Debt" below.

---

## 1. Why this exists

The product's first real outside users are a 16-20 person tennis group whose organizer just retired,
which is the pitch. Asked directly what makes tennis get cancelled, the organizer said: weather.

Nothing in this product can represent a cancelled plan. There is no status field, no code path
cancels or deletes an event, and on a rained-out Tuesday the card sits there saying tennis is on
while every member knows it is off. That is the product's own claim, accurate attendance, failing in
front of its first real group.

---

## 2. Data model

One migration. A new enum and two columns on `Event`:

```prisma
enum EventStatus {
  SCHEDULED
  CANCELLED
}
```

```prisma
  status       EventStatus @default(SCHEDULED)
  cancelledAt  DateTime?
```

**No backfill.** Every existing row takes the default.

**No new index.** `status` is a low-cardinality filter applied to result sets already narrowed by
the existing `@@index([groupId, startsAt])`.

**`cancelledAt` is load-bearing, not decorative.** It is the only thing that lets the digest ask
"cancelled since this member last looked" (section 7). It is cleared on restore so the field can
never claim a cancellation that was undone.

**No `cancelledByUserId`.** Nothing reads it. Orbit's announcement is the record of who, in the same
way `previousStartsAt` stores only what "put it back" needs and lets the feed carry the rest of the
history.

### Why the status flag rather than a delete, verified rather than assumed

`hasUpcomingScheduledEvent` (`src/lib/events/upcoming-list.ts:38`) asks exactly one question:
`{ groupId, startsAt: { gte: now }, gaugeId: null }`. Read the file before touching this slice.

If cancelling deleted the row, the hourly cron would recreate the cancelled plan within the hour with
a fresh announcement: the guard would see nothing upcoming, `computeNextOccurrence` would return the
same slot, and the unique `scheduledKey` freed by the delete would be available again. With a status
flag the row stays, the guard still sees it, and **the cancelled row is its own tombstone. Reconcile
needs no change at all.**

Second correct behaviour that falls out for free: no new occurrence appears until the cancelled one's
start passes, after which reconcile schedules next week's as normal. That is what the group wants.

---

## 3. The mechanism

New module `src/lib/events/cancel.ts`, modelled directly on `src/lib/events/move.ts`. Two exported
functions, `cancelEvent` and `restoreEvent`, each one transaction. No boolean direction parameter.

### `cancelEvent`

Inside `prisma.$transaction`:

1. **Re-read the event.** Refuse with a skip if it is missing (`no_event`), already cancelled
   (`already_cancelled`), or `startsAt <= now` (`already_started`). Cancelling a game that already
   happened means nothing, and the detail page is reachable by URL for a past event.
2. **Conditional write.**
   `tx.event.updateMany({ where: { id, status: SCHEDULED }, data: { status: CANCELLED, cancelledAt: now } })`.
   A count of 0 means a concurrent caller won; return a `stale` skip rather than overwriting. This is
   the race-proof shape `move.ts` already uses, and the pre-read above is a fast path, not the guard:
   at READ COMMITTED two callers can both pass it.
3. **Supersede any live GROUP proposal on this event**, setting `answer: SUPERSEDED`,
   `answeredAt: now`, conditional on `answer: null`. Silent, with nothing posted: this reuses the
   rule already settled in the time-change-ending slice, that a vote made moot because the plan
   changed some other way records SUPERSEDED and says nothing. Without it the group keeps being asked
   to move a game that is off.
4. **Write Orbit's announcement** as a `MessageAuthor.ORBIT` message with a null author, per the
   standing rule that Orbit is never a User or Membership row.

Everything lands together for the same reason `move.ts` gives: half of this visible mid-write would
be Orbit announcing a cancellation against a card that still offers an RSVP.

### `restoreEvent`

The mirror. Guard on `status: CANCELLED`, conditional write back to `SCHEDULED` with `cancelledAt`
nulled, announcement written.

**It does not revive the superseded vote.** That vote is dead; anyone who still wants the time moved
can ask again, and reopening a vote nobody is currently having is worse than silence.

### Server action

`src/app/actions/cancel-event.ts`, holding two exported actions. Each one:

- resolves the current user and applies the existing membership wall (`src/lib/auth/membership.ts`),
  because a removed member's stale tab still holds live buttons;
- calls the lib function;
- revalidates both `/events/[id]` and `/groups/[id]`, matching how `rsvpAction` already revalidates
  the home so a member tapping back does not meet a stale render;
- returns the same `{ errors: { general } }` shape the other actions use, so a skip surfaces as one
  plain sentence rather than a blank screen.

---

## 4. What it looks like

Status is never carried by hue in this product, and neither new control is teal (teal marks an action
that genuinely matters, and cancelling is not something to encourage) nor red (the owner is
red/green colourblind, and the status ladder is hue-free by rule).

### Event detail, cancelled

- A `CANCELLED` eyebrow in the need-label slot above the title, rendered grey. It is not a need, so
  it must not be teal; teal in that slot means "this needs you".
- The details card's content steps down to `--text-secondary`. Brightness carrying state is the same
  device the roster already uses for IN / HAVEN'T REPLIED / OUT, so this is an existing grammar
  rather than a new one.
- The RSVP footer band is replaced by one quiet outlined control, **"Put this back on"**.
- **"Add to calendar" is hidden.** See Debt 2.
- **The roster stays.** The detail screen carries completeness, and those answers still exist
  (section 5).

### Event detail, live

The same footer region gains a quiet outlined **"Call this off"**, placed *below* the RSVP pair, so
the screen's primary ask remains the RSVP.

### The two-tap confirm

Inline, not a modal. The product's only modal precedent is the email bottom sheet, whose focus
handling, scroll lock, back gesture and ARIA semantics are deliberately heavy; an inline two-step
matches the chip and RSVP grammar already on this screen.

First tap replaces the button in place with one line of consequence and two controls:

> This tells the group tennis is off. Anyone can undo it.
> [ Never mind ] [ Yes, call it off ]

**"Never mind" sits on the left, where the original button was**, so an accidental double-tap lands
on the safe control. The same two-step wraps "Put this back on".

### Group home card, cancelled

- The `CANCELLED` eyebrow in the need-label slot.
- The same brightness step-down.
- **The RSVP pair and the counts line are both removed.** A counts line under a cancelled game reads
  as attendance for something that is not happening.
- **No cancel control**, per decision 5: the card region's height budget was won by a whole slice
  (47.7% of the screen down to 34%) and a new control there spends it.

### The deliberate disagreement between the two surfaces

The card drops the counts and detail keeps the roster. That is not an inconsistency to fix later: the
preview card shows the gist and the gist is that it is off, while the detail screen carries
completeness. Write that reasoning into both files so a future reader does not "correct" one of them.

---

## 5. RSVPs survive, untouched

**A cancel does not touch a single RSVP row, and a restore returns the plan with every RSVP intact.**

The contrast with `move.ts` is the whole argument. A move deletes every RSVP because the plan
changed, and an 8am yes displayed against a 6pm plan misrepresents who is coming. A cancel does not
change the plan, it removes it; if it comes back, it is the identical plan at the identical time, and
the people who said they were coming still mean it. Deleting their answers would be destructive with
no truth behind it.

This is what actually makes decision 4 safe rather than merely permitted: cancelling is fully
reversible with zero data loss.

---

## 6. Copy

Composed deterministically in `src/lib/orbit/cancel-copy.ts`, reusing `whenPhrase` and `cap` from
`change-copy.ts` so the date phrasing matches every other Orbit line. No em dashes, plain and warm,
7th-to-8th grade reading level.

**Cancel:**

> Sam called off tennis this Tuesday. If that's not right, anyone can put it back on the plan's page.

**Restore:**

> Jordan put tennis this Tuesday back on. Everyone's RSVPs are the same as before.

Each second sentence earns its place. The first is the only place the group ever learns that undo
exists. The second answers the question a member will actually have, and it is answerable only
because of section 5.

### Why the announcement names a person, when no other Orbit announcement does

`buildChangeAnnouncement` and `buildConsensusAnnouncement` are both impersonal, and the ask copy is
impersonal by an explicitly recorded rule: naming a person's constraint turns "what time works?" into
"how do we accommodate Sam?".

That rule is about preferences, and this is not one. A time change goes through a group vote, so it
is nobody's individual call. **A cancellation has no vote and no permission gate**, which means the
social check is the only check there is. An anonymous cancellation in a 16-20 person group leaves
nobody to ask why. Naming the person is what makes decision 1 answerable in practice.

Settled with the owner in this session, 2 September 2026.

---

## 7. Every read site, decided

The full inventory was taken with `git grep` rather than a shell glob, because this repo's bracketed
route directories make a bare glob silently skip files and a false-clean scan looks identical to a
real one.

### Filter to SCHEDULED

| Site | Why it is a real defect otherwise |
|---|---|
| `src/app/actions/detect-intent.ts:163` and `:246` | The "already on calendar" spark suppression. Rain out Tuesday tennis, someone says "tennis Thursday?", and **Orbit stays silent**, because a cancelled tennis event is still on the calendar. The worst of the set: the group loses the ability to reschedule what they just cancelled. |
| `src/app/actions/detect-intent.ts:90` | The numbered plan list handed to the model, and the same array that resolves a change request's target. A cancelled plan must not be offered as a thing to move. When it empties, the existing `NO_PLANS_REPLY` path answers correctly with no further change. |
| `src/lib/digest/run.ts:212` | Otherwise a Thursday cancellation produces a Friday digest telling the group to RSVP to a game that is not happening. |
| `scripts/send-test-digest.ts:216` | Mirrors the digest query. It moves with it or the hand-run script quietly stops matching production. |
| `src/lib/proposals/read.ts:28` (`findLiveProposals`) | Gates only on `event.startsAt > now`, so an open time-change vote survives a cancellation. Belt and braces beside the supersede in section 3, since a proposal could be opened in the same second. |

### Refuse server-side

A stale tab holds live buttons; this is the membership-wall precedent exactly.

- `src/lib/events/rsvp.ts`: no RSVP on a cancelled plan.
- `src/lib/events/move.ts`: no move of a cancelled plan.
- `src/lib/proposals/create.ts:108`: no new time-change vote on a cancelled plan. This file already
  has a `StaleEventInTx` guard of precisely this class; extend it.
- The new cancel action itself, for the already-cancelled and already-started cases.

### Deliberately NOT filtered

Each gets a comment saying so, and the first gets a test.

- **`hasUpcomingScheduledEvent`**: decision 7's entire mechanism. A cancelled row must keep
  satisfying this guard. Filtering it here would recreate the plan the group just cancelled, within
  the hour, with a fresh announcement.
- **`findUpcomingEvents`**: the card must still show the cancelled plan, which is the point of the
  slice. Filtering happens per caller, never here.
- **`src/app/actions/gauge-vote.ts:94` and `findLiveGauges`**: a gauge that produced an event is
  finished, and cancelling that event does not reopen the question. Accepted: the "That one's already
  set. It's up top." message is slightly off for a cancelled event, in an edge case nobody will
  reach.
- **The `.ics` route** and `findSoonestUpcomingEvent` (which has no production caller at all).
- **`src/lib/health/check.ts:267`**: the probe asks whether the query runs, not what it returns.

---

## 8. Digest

Two changes. The widening **does not touch the MEMBER filter** at `src/lib/digest/run.ts:244`.

**Needs-you:** filter cancelled events out, so the block stops nagging people to RSVP to a game that
is off.

**You missed:** the digest gains a cancellations signal derived from **event rows, not messages**.
Events currently `CANCELLED` whose `cancelledAt` is later than the member's watermark (the later of
their last visit and our last email), capped at three, newest first, rendered above the member
quotes because a cancellation outranks chat.

Deriving it from rows rather than from Orbit's prose is what keeps the block's own rule intact,
avoids reopening "which Orbit messages qualify", and matches the product's structured-extract-then-
format discipline.

A cancellation alone opens the block and therefore sends a digest. That is the point.

A cancellation undone before 8pm produces no line at all, automatically, because the row is
`SCHEDULED` again.

**Honest limit, worth recording rather than discovering:** the digest fires at 8pm group-local, so a
Tuesday-morning cancellation of a Tuesday-evening game reaches the inbox after the game. The digest
is not a cancellation alert. The queued immediate email is the thing that would be.

**Accepted edge:** a member who has not opened the group in a month has an old watermark, so a long
run of cancellations could in principle queue up. The cap of three bounds what is printed, and the
digest's own once-a-day cadence bounds it in practice.

---

## 9. Verification plan

**No model call and no eval bench anywhere in this slice.** If an implementer reaches for either,
that is the signal the design has crossed into the declined chat-recognition scope. Stop and raise
it rather than building it.

Every test below is written failing first, and shown failing, before the code that makes it pass.

**Mechanism**
- Cancel sets `status` and `cancelledAt`, and writes exactly one message.
- Cancel supersedes a live GROUP proposal on that event, silently, posting nothing.
- Cancel is idempotent: a second call returns `already_cancelled`, writes no second message.
- The conditional write loses honestly under a concurrent cancel (`stale`), rather than overwriting.
- Cancel refuses an event whose start has passed.
- Restore reverses status and nulls `cancelledAt`, writes exactly one message, and does **not**
  revive the superseded vote.

**The decision-7 pin, the most important test in the slice**
- `hasUpcomingScheduledEvent` returns true for a group whose only upcoming event is cancelled.
- `reconcile` does not create a second occurrence for that group, and posts nothing.

**RSVPs**
- The RSVP rows for an event are identical before a cancel, after a cancel, and after a restore.

**Read sites**
- The spark suppression opens a gauge for an activity whose only upcoming event is cancelled.
- The numbered plan list excludes a cancelled event, and an all-cancelled group falls through to the
  "I don't see any plans" reply.
- The digest's needs-you block excludes a cancelled event.
- The digest's you-missed block carries a cancellation line, and does not carry one for a
  cancellation that was undone.
- `setRsvp`, `moveEventTime` and `createGroupProposal` each refuse a cancelled event.

**Rendering**
- `EventCard` on a cancelled event: renders the CANCELLED label, renders no RSVP controls, renders no
  counts line.
- The detail treatment: CANCELLED label present, "Add to calendar" absent, restore control present,
  roster still present.
- The two-tap confirm: the first tap does not cancel anything; the second does; "Never mind" returns
  to the resting state.

**By hand, because no test in this repo can hold it**
- A browser pass at 375x812 covering live card, cancelled card, live detail, cancelled detail, and
  both confirm steps.
- A real-phone pass, triggered by rule: both card faces change and the card region's height budget is
  in play. Serve on the LAN address, look, fold what it surfaces into the QA script, and stop the dev
  server afterwards.

---

## 10. Debt this slice opens

**1. The product's first stored Orbit message body containing a member's name.** Verified rather than
assumed: `buildTallyLine` is called from `src/app/groups/[id]/page.tsx:175`, so today every Orbit
line that names people is rendered live from vote rows, never stored. Person-deletion works by
nulling `authorId` on a person's own messages, so it cannot reach a name sitting inside Orbit's
prose: a deleted person's name survives in that one line. This is the same class as the already
accepted hand-judged name matching in the deletion script's join-line lookup. Registered, not built
for.

**2. A member who already saved the plan to their own calendar still gets buzzed.** "Add to calendar"
is hidden on a cancelled plan, so there is no path to re-fetch an `.ics` carrying `STATUS:CANCELLED`,
and `composeEventIcs` has no such property today. Doug's group will actually feel this: they save the
game, it rains, their phone reminds them anyway. It is the strongest argument yet for the
subscribable feed already recorded as the real fix in build-notes §6.

**3. The card and detail disagree about counts by design** (section 4). Not a defect, but it will
read as one to a future reader unless both files say why.

---

## 11. Deploy obligation

**One migration must reach production before this merges.** Append it to build-notes' "After launch"
list in this same PR, per the standing rule that the only session which reliably knows about an
obligation is the one that created it.

Nothing else: no new environment variable, no dashboard setting, no third-party configuration.

---

## 12. Timing

The owner wants to hand the tennis group its invite link around Friday 4 September 2026. This slice
is the last thing before that.
