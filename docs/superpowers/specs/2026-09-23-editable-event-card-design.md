# The editable event card

A plan created from a floated idea can never get a place, and nothing in the product can
correct any existing plan's place, title, day or time. This slice gives every plan an
Edit control on its own page.

## Settled, do not relitigate (owner, 23 Sept 2026)

- **Anyone in the group edits; Orbit names who.** The cancel precedent.
- **Place and title save directly. Day and time open the existing group vote**, with the
  editor counted as a yes; the vote gains the ability to move the day.
- **One Orbit line per save**, naming the person and the old and new values. Revert is
  another edit. A rename also changes what Orbit calls the plan.
- **Place and title leave RSVPs untouched**; day and time keep the vote's reset.
- **Saved calendar entries stay stale**; re-adding hands out a newer version.
- **The edit lives on the plan's page**, not the home card.
- **The onboarding required-venue revert moves to the group-details slice**, because an
  edit fixes one occurrence and the rhythm would recreate the missing venue weekly.

## Non-goals

- Editing the rhythm: the parked group-details slice.
- Changing day or place by chat: verbal group two (queue item 5).
- Onboarding asking for place alongside time: queued, below.

## Verified by

Tests for every save, refusal, announcement and the vote's day change, plus the hourly
job meeting a moved day. Not tested: the screen's look (browser walkthrough plus real
phone). One paid bench case for the changed refusal copy.

## Debt it opens

See "Debt" at the end.

---

## Design detail (for the executing agents)

### Where it lives

`src/app/events/[id]/page.tsx`. A quiet text control, "Edit", on the details card (never
teal: a secondary action). It reveals an inline form in the details card, not a modal and
not a new route. The form is built from the field language the onboarding playback card
already uses (the group-name input and the 4 Sept venue field): 16px inputs so iOS does
not zoom, hairline borders, token colours mapped by value. No design handoff exists;
this is a form in an existing visual language, recorded as a declared choice.

Fields, prefilled from the stored plan: **Title**, **Place** (optional), **Day**,
**Time**. Buttons: "Save" (teal, it is the form's one real action) and "Never mind"
(text link).

Shown only to a member, only while the plan is SCHEDULED and has not started. A
called-off plan shows no Edit (put it back on first). A started plan shows no Edit.

### Place and title: the direct path

A new module `src/lib/events/edit-details.ts` (this is the write path the parked
group-details slice reuses; keep it free of anything card-specific). One transaction:

1. Re-read the event. Refuse `no_event`, `cancelled`, `already_started`, and `noop`
   (nothing actually changed after trimming).
2. Title: trimmed, 1-50 characters. Writes `title` and sets `activityLabel` to the new
   title lowercased, so Orbit's copy and the duplicate-idea guard key off the new name.
3. Place: trimmed, 0-80 characters. Empty clears it. Update the existing first Venue row
   **in place** (never delete-and-recreate: that nulls any `Rsvp.venueId`). If none
   exists, create one. Clearing deletes the row. A place change also clears that row's
   `address` and `displayLabel`, so the calendar can never pair a new name with an old
   street address.
4. **Always touch `Event.updatedAt`** in the same transaction, even for a place-only
   edit, because the calendar file's SEQUENCE is derived from it
   (`src/lib/events/ics.ts`). Without this, re-adding hands out a file that looks like the
   old version.
5. RSVPs are not touched. `scheduledKey` and `gaugeId` are never touched.
6. Write exactly one Orbit message, composed by the caller (the cancel pattern), naming
   the editor.

Copy, in a new `src/lib/orbit/edit-copy.ts` (plain voice, no em dashes, three-letter
weekdays, `whenPhrase` as cancel uses it):

- Place changed: "Sam changed the spot for Beers this Fri, from Rusty Anchor to Sam's
  place. Anyone can change it back on the plan's page."
- Place added: "Sam set the spot for Beers this Fri: Sam's place."
- Place cleared: "Sam removed the spot for Beers this Fri (it was Rusty Anchor). Anyone
  can change it back on the plan's page."
- Renamed: "Sam renamed Beers this Fri to Pool at Sam's. Anyone can change it back on
  the plan's page."
- Both: one message, rename first, then the spot clause.

The name in the message is the person's stored name at write time, the same as cancel's
announcements (and the same deletion debt).

Server action: `src/app/actions/edit-event.ts`, modelled on
`src/app/actions/cancel-event.ts`'s `resolveActor` (member check server-side, a removed
member's stale tab refused), per-reason error strings, `revalidatePath` for the event
and the group home.

### Day and time: the vote path

If Day or Time differ from the stored plan, Save opens a GROUP proposal through
`createGroupProposal` (`src/lib/proposals/create.ts`) with the editor as asker (their
yes is seeded there already). Everything downstream exists: tally, consensus bar,
promotion through `moveEventCoreInTx` (RSVP reset, yes voters carried as IN), LAPSED and
SUPERSEDED endings, the per-viewer "your vote counted" line.

What must change:

- **No source message.** `ChangeProposal.sourceMessageId` is required and points at the
  member's chat message; a card edit has none. Make it nullable (a migration; see the
  deploy obligation). Do not point it at the Orbit message: it would claim the member
  said something they did not.
- **The vote's words must carry the day when it changes.** Every place that renders a
  proposal's times (`src/lib/orbit/change-copy.ts` including the chips at `:221-222`,
  the consensus announcement, the LAPSED line, the digest's time-change block) shows the
  weekday when proposed and prior fall on different days in the group's timezone: "Move
  to Thu 8pm" / "Keep Tue 7pm". Unchanged when the day is the same.
- **Refusals:** a time in the past, and, for a plan made by the rhythm (`gaugeId` null),
  a day on or after that rhythm's next regular occurrence. Moving past it would make the
  hourly job skip that week silently, because its guard sees an upcoming plan.
  Refusal copy names the limit plainly.
- If both place/title and day/time changed in one save: the direct fields save first
  (their announcement posts), then the vote opens (its ask posts). Two messages, in that
  order, is correct: they are two different kinds of change.

After Save, the editor is back on the plan's page, where the vote already renders with
their yes checked.

### Orbit's chat refusals become pointers

`buildCantDoReply` (`src/lib/orbit/change-copy.ts:139-153`) carries a DEBT note naming
this slice. The spot and day lines become pointers: "I can't change the spot from chat,
but anyone can on the plan's page." Keep the word "spot": `evals/detect/cases.ts:232`
asserts it. Run that one bench case (`npm run eval:detect -- 5 <case>`); it costs money
and hits the network.

### The hourly job and a moved day

`hasUpcomingScheduledEvent` ignores status and gauge plans; `scheduledKey` never changes.
Tests must pin: a rhythm plan moved earlier is not recreated at its old slot after it
passes (key collision skip); a rhythm plan moved later within the week produces no
duplicate and no missing week; the refusal above prevents the skipped-week case.

### Records to update in this slice

- CLAUDE.md: the "venue stopped hiding" paragraph's "it reverts when the editable event
  card ships" gets a dated amendment moving the trigger to the group-details slice; and
  the current-state section at the end.
- `Step2Playback.tsx`'s comment naming this slice as the revert trigger, amended to match.
- build-notes §11 entry, with the baseline: **1928 passing across 162 files** at
  291ead3, run 23 Sept 2026 at slice start, matching the previous slice's finish.
- Queued in build-notes: (1) onboarding's follow-up question should show the place field
  alongside the time, and stop saying "One question"; (2) whether venue stays required at
  onboarding permanently, owner leaning yes, settled in the group-details slice; (3) going
  back from step 2 regenerates the suggested group name, recommended decline unless an
  edited name is ever lost.

### Debt

- **An edit fixes one occurrence, never the rhythm.** Next week's plan returns to the
  rhythm's values. The group-details slice is the fix.
- **Saved calendar entries go stale**; the subscribable calendar (queue item 6) is the fix.
- **More stored messages name a member**; person deletion cannot reach them (cancel's
  existing debt, widened).
- **Renaming a rhythm plan lets a duplicate idea for its old name through** the
  duplicate-idea guard until that plan passes.
- **Deploy obligation:** the `sourceMessageId` migration goes on the pre-deploy
  checklist in this PR and must reach production before the merge.
- Real calendar apps replacing rather than duplicating a re-added entry: unverified.
