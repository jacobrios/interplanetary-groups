# The .ics add-to-calendar button, design (11 Aug 2026)

Slice 3 of the pre-MVP triage order (10 Aug 2026, do not relitigate the
order). Build-notes §6 makes this button the MVP's only reminder mechanism:
there is no web push, so the one-way calendar snapshot is how the product
demonstrates "Orbit remembers for you." It was deliberately deferred from the
event-detail slice ("a dead button is worse than none"); this slice is the
real export coming back. No design handoff exists for this slice; the visual
source is the `.ed-cal` rules already present in the prior handoffs'
`walkthrough.css`, plus the decisions below.

## Decisions already settled (do not relitigate)

Carried from the record:

- The one-way ICS snapshot is the decided MVP shape; the subscribable
  auto-updating per-group feed is its recorded post-MVP successor (§6, §8).
- No surface is membership-gated; that is standing state owned by the
  access-control slice, and this endpoint follows it.
- Emails and member names never appear in anything this slice produces.

Settled with the owner in this slice's brainstorm (11 Aug 2026):

- **Event detail only.** The home event card keeps its two-button footer and
  stays the gist; calendar-adding is a completeness action and lives on the
  completeness screen. The type-rules line imagining a compact in-card
  add-to-calendar button is superseded on this point.
- **Teal, its own region.** A full-width teal pill below the details card
  (44px, label-size text, per the handoffs' `.ed-cal` refinement). This
  resolves the handoff files' internal contradiction (one file called it the
  event screen's single teal primary, another grouped it under outlined
  secondaries): the primary treatment wins, because the product's only
  reminder mechanism should not read as an afterthought. Legal under the
  amended per-element teal rule; the details card keeps its own teal "I'm
  in."
- **One-hour fallback duration.** An event with a stored end keeps it; an
  event with only a start blocks one hour on the member's calendar. Owner's
  call, chosen over the agent's two-hour recommendation as the calendar
  convention people already expect.
- **Composed fresh at tap time, on the server.** The button is a plain link
  to a GET endpoint; the file is generated per request, so a tap after a
  group time-change vote carries the moved time. Client-side file generation
  was rejected (phone browsers handle it unreliably, and phones are where
  this product lives); per-vendor "Add to Google Calendar" links were
  rejected (the record already chose one ICS snapshot).
- **Personal calendars show the member's local time, and that is correct,
  not drift.** The everything-renders-in-group-time rule governs the app's
  shared surfaces, where one stored string serves every viewer. A calendar
  entry is the member's own device telling them when to show up; the event
  is one absolute moment and their calendar renders it wherever they are.
  Recorded here so a future reader does not "fix" it.
- **Location uses the stored address for the first time.** LOCATION is the
  venue's short label or name, with the street address appended when one is
  stored, because a calendar location's whole job is letting the phone offer
  directions. The address remains unrendered everywhere else in the app.
- **Stable entry identity.** Each event's UID is derived from its id and
  never changes, so a member who taps again after a change gets a corrected
  entry that replaces the old one in most calendar apps instead of a
  duplicate.
- **Visible to every viewer**, session or not, member or not, matching the
  ungated standing state; the file contains nothing personal.

## The design

On `/events/[id]`, below the details card and above the roster, the teal
"Add to calendar" pill. It is an anchor to the calendar endpoint, not a
button with client logic: `/events/[id]/calendar.ics` (App Router route
handler; the literal segment gives the download its natural filename). On
phones the tap opens the calendar add flow; on desktop it downloads.

The endpoint composes one VEVENT deterministically from stored rows, no
model involved:

- SUMMARY: the event title.
- DTSTART/DTEND: the stored UTC instants (end = stored `endsAt`, else start
  plus one hour), written as UTC so every calendar client converts correctly
  and daylight-saving math never enters the codebase.
- LOCATION: `displayLabel ?? name`, `", " + address` appended when stored;
  omitted entirely when the event has no venue (venue never gates).
- DESCRIPTION: one plain line pointing back to the event page for details
  and RSVPs, the URL derived from the request's own origin (no base-URL
  environment variable exists, and none is added).
- UID: stable, derived from the event id.
- Unknown event id: the same not-found treatment the event page gives.

Formatting correctness (CRLF line endings, comma/semicolon escaping, long-
line folding) lives in one pure composer module with the tests to pin it;
the route handler is a thin shell around it, following the repo's one
existing route-handler pattern minus the cron secret (this endpoint is
public by design).

## Not in this slice (each names its home)

- Subscribable per-group calendar feed, and saved entries that update
  themselves: post-MVP (§8).
- A calendar button on the home event card: declined today (placement
  decision above).
- Built-in reminder alarms (VALARM): declined; the member's own calendar
  defaults govern, and overriding them is clutter in their pocket.
- Recurring-series export (RRULE): each Event row is one occurrence; the
  series lives in Orbit's rhythm, and a series export belongs to the
  post-MVP feed.
- Membership gating of the endpoint: the access-control slice.
- Extraction and merge eval benches: **not triggered.** No prompt is touched
  and no model call is added; this slice's per-unit model cost is zero.

## How the slice will be verified (written before any code)

Test-first units, each shown failing before the code that passes it:

- Composer: all fields present and correctly escaped; the one-hour fallback;
  a stored `endsAt` winning; LOCATION variants (label, name, appended
  address, absent venue); UID stability across two compositions; UTC
  rendering of DTSTART/DTEND; CRLF and folding correctness.
- Route: 200 with the calendar MIME type and a parseable body for a seeded
  event (integration test against the dev-test database, repo idiom); 404
  for an unknown id.
- Suite baseline recorded at slice start, cross-checked against the
  joining-arc slice's finishing number in the decision record.

Browser walkthrough, evidence attached to the PR: open a seeded event's
detail page, see the teal pill below the details card, download the file,
show its text contents, and import it into a desktop calendar app if one is
available on the machine. Named gaps, stated up front: the phone add-flow
cannot be exercised from a desktop browser, and real Apple/Google/Outlook
import behavior beyond a desktop import is unverifiable here; the QA script
offers the owner an optional phone step (open the event on a phone, tap the
button) as the honest close of that gap.

## Debt this slice expects to open

- A saved entry goes stale when the group later moves the event; the feed
  announcement is the correction channel and a re-tap replaces the entry.
  Standing §6 limitation restated, not new.
- The stored venue address gains its first surface with no edit path behind
  it: a wrong address saved at creation can now mislead a phone's
  directions, and fixing it still has no route until venue correction gets
  its slice (the standing venue-correction gap, already recorded).
- No new migration, environment variable, or model call; nothing joins the
  pre-deploy checklist.
