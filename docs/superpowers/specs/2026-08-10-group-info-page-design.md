# The full group-info page (design)

Date: 10 Aug 2026 · Branch: `feat/group-info-page` · Decided as the next slice at the pre-MVP triage pass (build-notes §11, "Pre-MVP triage pass").

Design source: `docs/design/group-info-handoff/wireframes/group-info.html`, the Claude Design handoff pulled 10 Aug 2026 at the owner's direction (its README names the places the dark-identity override pass and the recorded decisions override what the base wireframe styles say). Product requirements: build-notes §4 (membership & governance) and the §8 register's four sub-items. Reference only, never a build input: `docs/design/walkthrough-screens/screens-09-10.png`.

## What this slice is

The group's reference page, grown in place from the `/groups/[id]/info` stub. One screen answers "who is in this group, when do we meet and where, and how do I bring someone in", and carries the group's only self-service actions: share the invite link, leave, and (founder only) remove a member or reset the link. Everything else about the group changes by telling Orbit in the chat, and the page says so.

## Settled decisions, do-not-relitigate

Each was decided with the owner during the 10 Aug 2026 brainstorm unless a different home is named.

1. **The Claude Design handoff is the visual source.** Committed at `docs/design/group-info-handoff/`. Four wireframe details are deliberately not followed, per recorded-decisions-win: the vanity URL (we render the real `/join/{inviteToken}` URL), the hand-written rhythm copy (the formatter composes it), the wireframe's own back-link chrome (the app's shared `PageHeader` + `BackLink` own that), and the wireframe's raw pixel sizes where they fall below the locked type scale (its 9.5px row labels sit under the product's 13px eyebrow floor; every text role maps to the `--type-*` tokens instead, so the handoff supplies layout and hierarchy while the tokens supply size).
2. **Departures are silent, both kinds.** No feed message for leaving or for removal. The WHO list is the record. This also keeps the joining arc's system-message plumbing out of this slice.
3. **The founder cannot leave in this slice.** The founder's view renders no Leave button. A real founder exit (transfer or dissolve) is its own future decision, queued as debt.
4. **Founder powers surface as a manage toggle plus a quiet link.** The founder's page looks identical to everyone else's, plus "Manage members" on the WHO card (flips it into a stacked list with a per-member remove affordance) and "Reset link" under the invite pill. Both are text affordances, never teal.
5. **The invite link is visible to members, not to everyone.** Triage decided members see it (not just the founder). This spec's addition, approved in Section 1: a non-member session viewing the page gets no invite pill, no share button, and no Leave. Showing the link to any session holding the URL would turn every group page into a public invite, which is more than triage decided.
6. **Viewing stays ungated; every mutation is gated server-side.** The page renders for any session (the standing ungated-by-design state; its fix lives in the access-control slice). Leave requires being a member and not the founder; remove and reset require being the founder; the remove target must be a member and must not be the founder. The server re-resolves the caller from the session; client-supplied identity is never trusted.
7. **Removal and leaving are one membership-row delete, and the product self-heals.** Every tally, roster, consensus bar, and the goodbye already count current members only (the ratified current-members-only reading), so no other write is needed. The departed member's history (messages, old RSVPs) remains visible, as a group would expect.
8. **Removal is not a lock, and this slice does not pretend otherwise.** Until the access-control slice, a removed or departed member holding the URL can still view the group and post in chat. Removal takes them out of every count, roster, this page, and front-door routing. Accepted standing state, named in the PR.
9. **Reset is the keep-them-out mechanism.** Reset issues a fresh token; the old link dies everywhere immediately. Remove-then-reset is the designed answer to removing someone who has the link.
10. **Share is one button, two behaviors.** Native share sheet where the browser has one; clipboard copy with the existing "Copied!" feedback where it does not. No new UI.
11. **Emblem initials are deterministic code.** First letters of the first two words of the group name, uppercased ("Climbing Crew" → CC; a one-word name uses its first two letters). Composed at render, never stored, never model-generated.
12. **WHO ordering is founder first, then join order.** Names only, never emails (standing §3 rule). The viewer's own name renders plain, no "You" treatment on this page.
13. **Rhythm rows are formatter-composed.** `formatRhythmRow(r).label` / `.value`, with ` · {venueName}` appended when the rhythm has a venue. The formatter is not modified.
14. **No schema change, no migration, no model calls.** Zero AI cost, zero new pre-deploy obligations.

## The page

Built on the app's real chrome and tokens (`PageHeader`, `BackLink`, the `--type-*` scale, the standard card recipe), with the handoff supplying layout, proportions, and the identity block's look. Top to bottom:

- Header bar: `‹ [group name]` back link to the group home (unchanged from the stub).
- Identity block, centered: lime circle emblem with dark-ink initials; group name at display type; "N members" subline at meta type.
- "GROUP INVITE LINK" eyebrow; bordered pill with globe icon and the real join URL (ellipsized, one line); teal "Share invite link" button. Members and founder only (decision 5).
- The card: WHO row (dot-separated names per decision 12, wrapping, separator dots per the standing dot rule), then one row per stored rhythm in stored order (position 0 first), label uppercase at the eyebrow floor, value at body-adjacent size per the handoff, venue appended per decision 13.
- Hint line, centered, meta type: "Want to change something? Just tell Orbit in the chat."
- "Leave group": outlined full-width button at the bottom. Members only (decisions 3 and 5).

Founder additions (decision 4): "Manage members" as a quiet text link on the WHO card; tapping flips the card to a stacked list (one row per member, founder's own row has no remove affordance) with a "Done" link to flip back. "Reset link" as a quiet text link under the invite block.

Non-member view: header, identity block, the card, and the hint only.

Layout grows with content (min-height plus padding, buttons stack, nothing clips at enlarged text), per the standing sizing rules.

## The actions

Amendment (11 Aug 2026, whole-branch review): the shipped destructive confirm labels are "Yes, remove" and "Yes, reset it" rather than the bracketed "Remove" and "Reset link" drafted here; an affirmative label naming the act reads clearer on a destructive button. The Leave confirm shipped exactly as drafted.

All four follow the repo's server-action conventions (session re-resolved server-side, `revalidatePath` outside the try/catch, errors surfaced as `errors.general`).

**Share invite link.** Client island. `navigator.share` with the absolute join URL when available; otherwise the existing copy-with-"Copied!" behavior. No server action needed.

**Leave group.** Tap opens a warm confirm, destructive-styled at high fidelity, never buried:
> **Leave Climbing Crew?**
> You can always rejoin with the invite link.
> [Leave group] [Never mind]

Confirm calls the leave action: verifies membership and non-founder, deletes the membership row, redirects to `/` (the front door routes them to their other group or the pitch). Silent in the feed.

**Remove member** (inside Manage members). Per-row affordance opens:
> **Remove Maya from the group?**
> They can rejoin with the invite link.
> [Remove] [Never mind]

Confirm calls the remove action: verifies the caller is the founder, the target is a member and not the founder, deletes the target's membership row. Silent in the feed. The page revalidates; counts and rosters self-heal (decision 7).

**Reset link.** The quiet link opens:
> **Reset the invite link?**
> The old link will stop working everywhere it's been shared.
> [Reset link] [Never mind]

Confirm calls the reset action: verifies the caller is the founder, assigns a fresh token to the group, revalidates; the pill shows the new URL. The old token 404s into the existing bad-invite screen (already built, already warm).

Confirm copy follows Orbit's voice rules: plain and warm, no em dashes, soft declines ("Never mind", never a bare "No").

## Engineering shape

- The page stays one server component: one Prisma read (group, memberships with user names ordered per decision 12, rhythms parsed via `parseStoredRhythms`), `getCurrentUser()`, then three derived booleans (isMember, isFounder) picking the view.
- Client islands, smallest possible: the share button (exists, gains the share-sheet path), the leave confirm, the manage-members card state, the reset confirm. Pattern: `RsvpControls` (useTransition, await the action, surface `errors.general`).
- New server actions, one file per verb in `src/app/actions/`: leave-group, remove-member, reset-invite-link. Data-layer writes live in `src/lib/groups/` beside `join.ts`.
- New pure helpers with tests: emblem initials; member ordering (if it needs logic beyond the query's orderBy, it probably does not).
- The membership-gate precedent to copy is `proposal-vote.ts`'s `userId_groupId` lookup.

## Verification plan (written before any code)

- **Unit and action tests, failing first, then green:** non-member cannot leave; founder cannot leave; member leave deletes exactly their membership row; non-founder cannot remove or reset; founder cannot be removed; remove deletes exactly the target's row; reset rotates the token (old value gone, new value valid, group id unchanged); initials derivation (two-word, one-word, casing). Suite stays green from an empty database.
- **Baseline, already recorded in §11:** 47 files, 692 tests, all green. The PR reports before and after.
- **Staged browser walkthrough** on dev-test via a `scripts/qa-stage-groupinfo.ts` script following the existing qa-stage pattern (dev-test guard, `[QA]` naming, printed links): a seeded group with several members, two rhythms (one with venue, one without), founder session and member session. Walk: founder view (manage, remove someone, reset link, old link proven dead, new link proven live), member view (invite visible, share fallback on desktop, leave with confirm, lands on front door), non-member view (no invite, no leave). Tally self-heal shown by removing a member who had a yes on a live gauge.
- **Visual claim** only with the rendered screen next to the handoff render, side by side.
- **No model behavior changes**, so no bench run is owed; the recognition bench is untouched by this slice.

## Debt this slice opens or leaves standing

- **Founder exit has no path** (queued, future slice; also keeps founder account deletion blocked, a known schema constraint).
- **Removal is not a lock** until the access-control slice (standing state, restated in the PR).
- **The Manage-members state is our design, not Claude Design's.** The handoff does not draw it. The end-of-build polish pass may want a design round on that one state.

## Not in this slice, each with a home

- Membership gating of any surface → the access-control slice.
- "Jesse joined" announcements and the share moment → the joining arc, next slice.
- Founder transfer or dissolve → its own future decision.
- Editing group details here → never; changes go through Orbit in chat (the page says so).
- Email display → never, standing §3 rule.
