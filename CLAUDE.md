# CLAUDE.md · Interplanetary Groups

This file loads every session. It is the standing context and the rules that must hold at all times, including inside any plan that assumes no project context.

**What loads alongside it.** `docs/build-notes.md` is the decision record: the deep reference for the reasoning, the alternatives rejected, and the lineage behind every product decision, with §11 as the per-slice record home (one ADR-style entry per build slice). Consult it during brainstorming and whenever a question is not answered here. Superpowers is in play and owns *process* (TDD, brainstorming, planning, code review, git workflow); do not restate process here.

**The division of labor between the two files, so the overlap does not read as an error worth "fixing".** CLAUDE.md carries the rule in operative form; build-notes carries the reasoning, the rejected alternatives, and the lineage. This is not duplication: CLAUDE.md loads every session, build-notes is consulted, so a rule that must always hold lives here and its story lives there. Where the two disagree, CLAUDE.md is the rule and build-notes explains why the rule exists. Keep this file terse; where it has absorbed a full build-notes rationale, trim to the rule plus a short why, because that is where drift starts.

**How the work is split, and by whom.** One person holds both the product-management role (owning what the product should do) and the engineering role (building it); there is no separate party handing over a framed plan, so this file has to supply the product framing itself rather than assume it arrives from elsewhere. Settle anything that shapes product behavior as a product question first, then build. On pure implementation detail, pick the simplest thing that works and record any notable choice: a line in the PR, and a build-notes §11 entry when it is a lasting decision. §11 is this project's permanent home for "why was it done this way," so a decision made in passing is not done until it is written there.

---

## Where the build is

*Rewritten at each slice boundary. It lives here, not in build-notes, because it churns every slice and must load every session.*

Onboarding is fully built end to end: the founder describes the group in free text, Haiku extracts structured rhythms, the normalize layer turns that claim into stored shape, a gap-ask conversational loop resolves a missing or ambiguous day or time (never a venue, which never gates), the founder can add the group's meeting spot at the playback step, deterministic code composes the playback, and confirm creates the group with its first scheduled event and the founder's detected timezone already on the home screen.

**Spark is complete end to end. Orbit listens, gauges, and creates.** Every member message goes to the model after the send settles (never inside it, so the chat input is never blocked). When someone floats an idea Orbit proposes a specific day and time with three one-tap chips and a tally derived from the vote rows, counting down at one away from the bar. The third yes creates the event in that same tap: the gauge answers carry through as RSVPs with no second tap, the venue is inherited from the group's own rhythm when the activity matches, Orbit announces it naming the day and time, the gauge closes, and the group home carries a second card. Orbit also still runs on a daily Vercel cron that auto-creates the next recurring occurrence, and a sparked event can no longer suppress it.

Where a sparked event's time comes from, since nothing in the product knew: a stated time wins; am/pm is read from the activity ("beers at 8" is 8pm, "breakfast at 8" is 8am); a genuine coin flip keeps the stated hour, lands pm, and is disclosed once; nothing stated falls to Fri 7pm for evening ideas or Sat 9am for morning ones. All four fallbacks are undated placeholders, deliberately in one module, with override-learning (build-notes §5) as their named successor.

**Navigation is built app-wide, and there are no dead ends left.** `/` is a session-aware front door: a session with a group is sent straight in, a session without one gets the product's pitch and one teal "Start your group." Event detail and group info carry `‹ [group name]` pointing at that group's home (a fixed parent link, never browser history, so it is right for someone arriving from a shared link). The group home's Orbit logo is a real home button, `/create` step 1 has a way out (step 1 only, since later steps already go backwards within the flow), a bad invite token gets a note from Orbit plus a way in, and a wrong id or a render error lands on a branded screen with an exit. Under all of it, `src/components/` holds the product's first shared UI: a header bar that owns the bar's rules and nothing about content, so it can never grow an opinion about the group home's title chevron. The whole app was walked screen by screen to prove the claim. The repo can now test a component, scoped honestly to those shared pieces; it still cannot test the screens, which are server-rendered and talk to the database.

**Change request part one is built: Orbit can change a plan's time.** A member asking to change an existing event's time, in plain language, in the group chat, works end to end: a clear request ("can we do 9 instead?") moves it immediately, a probable one gets a concrete ask with one-tap chips visible only to the asker, and every RSVP resets when the time moves because a yes for the old time isn't a yes for the new one, except the requester's, whose message already is their answer. A bare hour inherits the plan's own part of day ("make it 9" on an 8am plan reads 9am), disclosed once when applied, and the same disclosure fires on a bare-hour revert too. "Put it back" is just another change request, not a special mechanism, so it works from anyone, forever. Venue, day, and rhythm changes get an honest decline naming what Orbit can't do yet, never silence and never a half-applied change. Reasoning and the walkthrough evidence in build-notes §11.

**Next slice: the one-bump resurface.** Orbit's "one bump, then let it die" guardrail is written but not built: a stalled-but-viable idea earns at most one resurfacing, no pinning, no banners. Open questions to settle before it can be spec'd:
- **When does an idea count as stalled?** A gauge below the bar with its day still ahead is not obviously stalled, and a gauge whose day has passed is dead rather than stalled. The trigger is a product decision, not a timeout to pick arbitrarily.
- **What does the bump say, and what does it ask for?** It cannot re-propose the same day if that day is what stalled it, and re-proposing a different day is close to the conflict-aware proposing that is explicitly out of scope.

Settled and not open, carried forward: the three-person threshold; below-threshold ideas scrolling away with no residue; **the initiator counted only when they named the day Orbit is proposing** (their message already is that yes, seeded at gauge creation), voting like anyone else when Orbit picked the day; a day counting as named only when exactly one is named; both flavours of no seeding OUT on a created event; the gauge closing at creation so the event card owns answers from then on; and a threshold reached after the proposed start creating nothing. Reasoning in build-notes §11, spark parts one and two.

**Still missing, and known:** A wrong venue guess still has no path to being fixed; Orbit's correction path covers time only, and venue, day, and rhythm changes each get an honest decline rather than an edit, until each gets its own slice. The multi-card carousel shipped as an interim treatment with no active dot, pending a real design handoff. The group home's designed subline ("8 members · group info & invite link") was never built, and Orbit's avatar is still a letter-"O" placeholder rather than its real face everywhere it appears; both are drawn in the mockups and both belong to the end-of-build visual-polish pass. A session belonging to several groups is sent to its most recent one, a placeholder holding a seat for the multi-group home.

---

## What we're building (the why)

Interplanetary Groups is a group-first coordination app for casual recurring groups: climbing crews, friend groups, families. The problem: groups choose between low-effort coordination ("show up if you want," and nobody does) and high-effort coordination (polls, forms, group texts that feel like planning a wedding for a casual Sunday). Because someone always has to be "the organizer," most plans never happen and groups slowly stop doing things together.

The solution is an AI coordinator named **Orbit** that carries the organizing burden so no human has to. People express intent in plain language; Orbit checks in, gauges interest, proposes concrete plans, and produces a clean event page. The thesis in one line: **the group is the persistent thing, events are activations of it, and nobody has to be the organizer.**

This is a portfolio MVP meant to demonstrate production-quality AI product work. Code quality and product judgment both matter: write code a reviewing engineer would accept, production-readable, with no quick hacks left unflagged, because this codebase will be read by engineers evaluating product-and-engineering fluency.

---

## Product north stars

- **Group-first.** The group is the persistent entity; events are activations. The invite link joins people to the group, never to an event.
- **The organizer role dissolves after creation.** Anyone can initiate; Orbit carries coordination. No admin console, no role hierarchy beyond minimal founder powers.
- **One conversation surface.** The group feed is the only chat. No private Orbit DMs in MVP. All change requests and Orbit actions are therefore public by design.
- **Anti-clutter is the brand.** The founding complaint was notification noise. Every nudge, message, and notification must justify itself. When in doubt, stay quiet.
- **Complexity must be justified by the problem.** YAGNI applies to product scope, not just code. Two touchstones settle scope arguments: "Perfection is achieved not when there is nothing left to add, but when there is nothing left to take away," and "fall in love with the problem, not the solution." (Rationale and how they apply in build-notes §1.)

---

## Orbit's behavior (guardrails)

Orbit is an agent: tools (what it can do) + context (what it knows) + guardrails (when it acts, asks, or stays quiet). The guardrails:

- **Nudge sparingly.** Ping the group only when it changes an outcome. Reminders point to the card; chip responses update a tally, they never post a message per response.
- **Concrete-first, override-friendly.** Propose a specific day (at interest-gauge time) and a specific venue (at lock time), then absorb overrides. Don't poll the group with open options on your own initiative. The exception: if members explicitly ask Orbit to help find a time that works for everyone, Orbit may gather availability, but it still converges to a concrete proposed time rather than handing back a Doodle-style grid for the group to sort out. (How many requests trigger this is a post-launch tuning knob; see build-notes.md §1.)
- **Act on clear intent, ask when ambiguous.** "See you Monday" in chat is an RSVP signal; act on it. If unsure, ask ("sounds like you're in, want me to mark you?").
- **Ask if missing, don't guess.** A gap in the group description (e.g. climb time) triggers a clarifying question.
- **The claim-to-fact boundary is `src/lib/orbit/normalize.ts`.** Orbit's structured extraction returns raw model output, which is a claim about the world, not a fact. Every user-facing behavior that keys off an extraction result reads the normalized shape from this module, never the raw response. Worked example, the failure this prevents: extraction once reported a field as missing that the schema did not require, which would have triggered a clarifying question to the founder about something the product never needed to know. (build-notes §11 back-references this as "the CLAUDE.md guardrail," so this pointer must stay.)
- **Stored state is not display; carry it, do not regenerate it.** When Orbit merges a new answer into an existing profile, untouched fields are copied verbatim, never re-derived from the description. Worked example, the failure this prevents: across a gap-merge round the activity label drifted from CLIMBING to CLIMB because the model re-derived it from the description instead of carrying the prior stored value. (build-notes §11, gap-ask.)
- **Orbit is never a User or Membership row.** It speaks in the feed through a `MessageAuthor.ORBIT` enum with a null author, never a person record. This is why Orbit can never appear in a roster, a member list, or an RSVP tally. (build-notes §11, group-home-chat.)
- **Venue never gates anything.** Not the completeness gate, not the gap-ask, not group or event creation. A missing or invalid venue always degrades to nothing; it never blocks a founder or stops a group from scheduling. (build-notes §11, venue-capture.)
- **Transparency on changes.** When Orbit changes group details at someone's request, announce it in the feed with an easy revert. Rhythm-altering changes get gauged with the group first.
- **One bump, then let it die.** A stalled-but-viable idea earns at most one resurfacing. No pinning, no banners.
- **Venue/context suggestions key off the group's actual history,** never generic geography.

---

## Data model (load-bearing rules)

- **Many-to-many user-to-group from day one.** Scope events, RSVPs, and Orbit's context per group. The multi-group home is a fast-follow; the backend must be ready so it's additive, not a retrofit.
- **An RSVP attaches to exactly one event. Attendance never inherits from a parent.** No event nesting in the MVP schema, but never build a shortcut (e.g. a group-level RSVP implying event attendance) that would foreclose adding it later via a nullable parent reference.
- **RSVP is per-person status (in or out), never a stored count.** Counts are derived. "No reply yet" is the absence of an Rsvp row, not a third stored enum value; the RsvpStatus enum is IN / OUT only. Why: derived counts cannot drift out of sync with the rows they describe, and a stored count can. RSVP accuracy is the entire value of this product.
- **Event location is a set of venue options (usually one); RSVPs carry an optional venue.** MVP UI stays single-location, but the model supports the split. A venue also carries an optional short display label that Orbit suggests once at creation time (a Level 1 prompt), stored on the venue and editable, never regenerated per render.
- **Events store a start and an optional end** (multi-day gatherings are date ranges).
- **Emails are never displayed anywhere in the UI,** even after capture. Member lists are names only. Why: the email is given to Orbit, not to the group. A member hands it over to get reminders and to get back in from another device; displaying it to everyone repurposes it into something they never agreed to.
- **The server-side completeness gate is the only door to group creation.** No request path creates a group without a schedulable primary rhythm at position zero; the confirm action re-validates the client-held payload on the server before anything is written. (build-notes §11, founder-onboarding.)
- **Worked example of the "design element with no data home" rule (which lives in the user-level file, not restated here).** A mockup showed a "beers once a month" row alongside the climbing rhythm; no field held a monthly cadence, so a one-shot build shipped everything else and flagged nothing. This is the signature silent-drop failure. The lesson for this codebase: when a screen implies data the model cannot store, name it and settle where it lives before building; never build the parts with a data home and quietly skip the part that needs a modeling decision. (build-notes §11, one-shot experiment.)

---

## Identity, auth, and known gaps

- **Anonymous session on entry,** upgraded later by attaching an email (then magic-link sign-in). Orbit asks for the email after the user's first RSVP, with a concrete reason attached. Why anonymous-first: experience before PII (build-notes §3). People see and use the product before being asked for anything personal.
- **Invite-link taps must check for an existing session first** and route members in, rather than creating duplicate accounts.
- **Names are the only identity needed to participate** (founder gives theirs in onboarding Step 1; members on the join screen).
- **Known gap, standing state rather than a per-slice deferral: no surface in the product is membership-gated.** The group home, event detail, and group info are all viewable by any session. Its home is the access-control slice, which is where membership gating across surfaces will live; until then, every surface is ungated by design, not by oversight.

---

## UI & copy rules

### Time

- **Everything renders in the group's timezone, never viewer-local.** Forced, not chosen: Orbit's announcement is a single stored string in a shared feed, so a viewer-local card would contradict a group-time announcement for anyone in another zone. Group-time is also how casual groups actually talk ("the 8am climb" is a fact about the group). (build-notes §11, timezone slice.)

### Color

- **Teal is the single primary action per *element*.** One teal action per screen region or card (Continue, Share invite link, Join, I'm in, Add to calendar). Never decorative, never on a chat bubble. Secondary actions are outlined; tertiary are text links. A card's own action is teal: a full teal footer band on simple confirmation cards (the onboarding playback card), or a teal primary button plus an outlined secondary on the event card ("I'm in" / "Can't make it"). Why: no ambiguity about the next action *on the thing being acted on*. Concrete: the event card ships teal "I'm in" plus outlined "Can't make it," never two teal buttons **on one card**.
  - **Amended 27 July 2026**, from "exactly one teal action per screen". The multi-card carousel put a teal "I'm in" on each of two upcoming events. The owner's read: each card is its own element with its own primary action, so the original wording was too rigid rather than the code being wrong. The intent it protected is unharmed, because nobody looking at two event cards is confused about which button belongs to which plan. (build-notes §11, spark part two.)
- **Lime is Orbit's brand color, not an action.** Orbit's avatar, brand moments, and gap-prompt cues (the lime "what time?" prompt) are lime. Lime never marks a primary action and never appears as a plain button. Why: on the onboarding cards, lime means "Orbit needs this before it can proceed"; a lime button anywhere else would teach founders that the lime gap marker is sometimes ignorable. (build-notes §11, venue-capture.) (Lime and teal are the two fixed chromatic decisions because each carries meaning; their exact values live in the design tokens.)
- **Dark is the default theme.** The product is designed dark-first across every screen. Known scaffolding gap: `globals.css` still ships create-next-app defaults, a white `:root` background that only flips dark under `prefers-color-scheme: dark`, and an Arial `body` font while `--font-sans` is wired to Geist. Neither is a decision anyone made; the end-of-build visual-polish pass closes both (registered in the build-notes feel-pass register). Do not treat the light default as intended.
- **Status by brightness plus icon or label, never by hue.** RSVP and event states are distinguished by brightness and an icon or text label (a checkmark for in, grouped IN / OUT / HAVEN'T REPLIED labels), never by color alone.
- **Never rely on red/green as the only signal** (accessibility: the product owner is red/green colorblind). Use shape, label, or position alongside color.

### Type & sizing

- **One locked type scale, applied across all screens.** Sizes are in rem so they honor the device text setting; line-heights are unitless. The `--type-*` size tokens and `--leading-*` line-height tokens are defined in `src/app/globals.css`, which is their single source of truth, kept deliberately separate from the `--text-*` color tokens so a size change never touches color. Do not restate the values here; read them from the CSS so the two copies cannot drift.
- **Role to token mapping** (this is the part the CSS cannot express): group identity name at display; event-detail title at title; preview-card title and home header at heading; body and chat at body; primary and share CTAs at body; compact in-card buttons (RSVP, add to calendar, leave) at label; metadata, status, and Orbit's reference note at meta; uppercase eyebrows at the floor. **Nothing anywhere goes below the 13px eyebrow floor.**
- **Layout grows with content, never clips.** Use min-height plus padding, not fixed heights. Containers grow with their text. Buttons stack when they cannot sit side by side. Why: enlarged device text must not clip the event card; proven at enlarged text sizes during the visual-language phase. (build-notes §7.)

### Chat voice system (distinguished by structure and weight, not specific color)

- Orbit speaks as its avatar, no name label, in a soft muted fill. Members speak as a name label, no avatar, in an outlined low-fill bubble. The viewer is right-aligned in the strongest fill, which must not be the teal primary-action color (a teal self-bubble would read as a button) and is not lime (which reads as Orbit).
- **Bubbles for dialogue, notes for reference.** Use a chat bubble only when the user's next on-screen action responds to Orbit. On reference pages, Orbit leaves a labeled note, never a bubble. Why: a bubble promises that the user's next on-screen action answers Orbit. Concrete failure (logged in the feel-pass register): the gap-step card renders as a second Orbit bubble that is a bare data block with nothing to reply to.
- **One onboarding exception:** the Step 1 bubble drops its avatar, shifts to the left margin, and keeps a small tail pointing up at the header. It is the only tailed bubble in the product. (Implementation note in build-notes §7.)

### Copy

- **Orbit's voice is plain, warm, and approachable** to everyone from a teen to an 80-year-old (target roughly a 7th to 8th grade reading level). This applies to Orbit's user-facing copy only, not to code, comments, or commit messages.
- **Soft declines everywhere.** "Next time," never "Pass" or a bare "No." Honest tallies depend on socially comfortable exits.
- **Product-voice rule: no em-dashes in anything Orbit says.** This governs Orbit's user-facing copy specifically. Use commas, periods, parentheses. (Standard hyphens in compound words are fine.) It is distinct from the communication rule in the user-level file, which governs what the build agent writes to the product owner. Both exist and both hold; do not collapse them into one or delete either as a duplicate.
- **Three-letter weekday abbreviations** in schedule and rhythm copy ("Mon & Wed mornings @ 8am"), both as a display rule and as something Orbit follows when it generates copy. Why: card real estate; the preview card's job is the gist.
- **Generated display copy is structured-extract-then-format.** Orbit extracts structured fields (days, time, part of day, cadence) and the UI composes the compact display string deterministically; Orbit writes free prose only for its own chat nudges, constrained by format, length, and examples. This is Level 1 AI (prompt engineering) and it also yields the structured data that reminders, the calendar button, and check-ins need. (Why, in build-notes §7.)

### Cards & layout

- **People, not counts, where identity matters.** The event detail roster shows who, by name, grouped IN / OUT / HAVEN'T REPLIED. The compact preview card is counts-only ("4 In · 1 Out · 4 TBD": In always shown, Out only when nonzero, TBD is the pending count, no names), a deliberate brevity choice to keep the card short. (Why, in build-notes §7.)
- **Preview cards show the gist plus the primary action; the detail screen carries completeness.** Counts-only status, the short venue label, and day abbreviations are all instances of this brevity and real-estate discipline.
- **Separator dots** between metadata items are slightly larger and brighter than a hairline so they read as deliberate, still subordinate to the text. Each dot binds to the end of its item, so a wrapped line always starts with a word.
- **Header grammar:** the Orbit logo top-left is the home button (anticipating multi-group); the group title with chevron opens group info. The group emblem lives on the info page and the future multi-group home, not in the header.
- **The event card stays pinned at the top** as the constant next-event reminder; the chat feed is its own scroll region below it, above a pinned input. **The chat body stays at `--type-body` (17px) and is never shrunk to fit.** (An open question about condensing the card after RSVP is recorded in build-notes §7; do not build it preemptively.)

---

## Design sources for this project

The user-level rules say to work from the real source, not a flattened copy. Here is where this project's real source is, and how to treat each artifact.

- **The real visual source is Claude Design's "Send to local coding agent" handoff,** which transfers the actual CSS, the frame components, and the asset files. That handoff is the only thing visual code is built from. Screenshots are never a build input: a screen rendered too small loses fine detail, and any asset the agent never receives is silently replaced with a placeholder that then looks like a deliberate design choice in the diff.
- **`docs/design/walkthrough-screens/` holds cropped PNG exports for the two human verification gates:** the describe-back checkpoint before an agent writes visual code, and human verification of a "matches the design" claim against a rendered screen. They are reference, not source: no CSS, no tokens, no assets. A difference from these screens is a question to raise, not a defect to fix.
- **`docs/walkthrough.html` is a JavaScript-packed export.** Grepping it returns nothing, and a false negative from a grep reads identically to the line genuinely not existing. Any claim about mockup copy requires rendering the file in a browser, never grepping it. This has already produced one wrong claim (build-notes §11, venue-capture).
- **Recorded decisions win over the walkthrough.** Where CLAUDE.md or build-notes disagrees with a walkthrough screen, the recorded decision is correct; the screens predate several shipped decisions.

---

## Stack realities

These are the places where training-data conventions are actively wrong about this repo. Check them before writing code in each area rather than assuming older patterns.

- **Stack:** Next.js 16, Supabase (auth only), Prisma 7, Vitest, Vercel.
- **Next.js 16 changed conventions from earlier versions.** Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (flagged in `AGENTS.md`) and heed deprecation notices. If you are not confident about a Next.js 16, Prisma 7, or Supabase detail where conventions have shifted, check the docs before acting instead of guessing; confidence without certainty causes more damage than admitting a gap.
- **Prisma owns the schema.** Prisma 7 keeps its CLI config in `prisma.config.ts`, ships no bundled query engine (a driver adapter is required), and does not auto-run `prisma generate`.
- **Supabase does auth only. The Data API is disabled and Prisma owns the schema.** Reaching for supabase-js to touch data would reintroduce the competing source of truth this project deliberately removed. The single thread between the two systems is the `supabaseAuthId` pointer.

### Two databases, never crossed

This is the one rule in this file where a mistake is unrecoverable, so it stands on its own. Production and `interplanetary-groups-dev-test` are separate Supabase projects with separate credentials. Never point a production build, migration, or seed script at the dev/test database, and never the reverse. If a task seems to require it, stop and ask.

---

## Out of scope for MVP (don't build, don't design around)

Multi-group home UI · multi-venue UI · event nesting · logistics/travel features · multimodal input (forwarded emails, screenshots) · web push · photo avatars · opt-out attendance preferences. These are fast-follows; the data model accommodates them, the MVP does not implement them. See `docs/build-notes.md` §8.
