# CLAUDE.md · Interplanetary Groups

This file loads every session. It is the standing context and the rules that must hold at all times, including inside any plan that assumes no project context. Superpowers owns *process* (TDD, brainstorming, planning, code review, git workflow); do not restate process here. `docs/build-notes.md` is the deep reference for *why* behind every product decision; consult it during brainstorming and whenever a question isn't answered below.

---

## What we're building (the why)

Interplanetary Groups is a group-first coordination app for casual recurring groups: climbing crews, friend groups, families. The problem: groups choose between low-effort coordination ("show up if you want," and nobody does) and high-effort coordination (polls, forms, group texts that feel like planning a wedding for a casual Sunday). Because someone always has to be "the organizer," most plans never happen and groups slowly stop doing things together.

The solution is an AI coordinator named **Orbit** that carries the organizing burden so no human has to. People express intent in plain language; Orbit checks in, gauges interest, proposes concrete plans, and produces a clean event page. The thesis in one line: **the group is the persistent thing, events are activations of it, and nobody has to be the organizer.**

This is a portfolio MVP meant to demonstrate production-quality AI product work. Code quality and product judgment both matter.

---

## Product north stars

- **Group-first.** The group is the persistent entity; events are activations. The invite link joins people to the group, never to an event.
- **The organizer role dissolves after creation.** Anyone can initiate; Orbit carries coordination. No admin console, no role hierarchy beyond minimal founder powers.
- **One conversation surface.** The group feed is the only chat. No private Orbit DMs in MVP. All change requests and Orbit actions are therefore public by design.
- **Anti-clutter is the brand.** The founding complaint was notification noise. Every nudge, message, and notification must justify itself. When in doubt, stay quiet.
- **Complexity must be justified by the problem.** Prefer the simplest thing that works. YAGNI applies to product scope, not just code. Two touchstones settle scope arguments: "Perfection is achieved not when there is nothing left to add, but when there is nothing left to take away," and "fall in love with the problem, not the solution." (Rationale and how they apply in build-notes §1.)

---

## Orbit's behavior (guardrails)

Orbit is an agent: tools (what it can do) + context (what it knows) + guardrails (when it acts, asks, or stays quiet). The guardrails:

- **Nudge sparingly.** Ping the group only when it changes an outcome. Reminders point to the card; chip responses update a tally, they never post a message per response.
- **Concrete-first, override-friendly.** Propose a specific day (at interest-gauge time) and a specific venue (at lock time), then absorb overrides. Don't poll the group with open options on your own initiative. The exception: if members explicitly ask Orbit to help find a time that works for everyone, Orbit may gather availability, but it still converges to a concrete proposed time rather than handing back a Doodle-style grid for the group to sort out. (How many requests trigger this is a post-launch tuning knob; see build-notes.md §1.)
- **Act on clear intent, ask when ambiguous.** "See you Monday" in chat is an RSVP signal; act on it. If unsure, ask ("sounds like you're in, want me to mark you?").
- **Ask if missing, don't guess.** A gap in the group description (e.g. climb time) triggers a clarifying question.
- **Transparency on changes.** When Orbit changes group details at someone's request, announce it in the feed with an easy revert. Rhythm-altering changes get gauged with the group first.
- **One bump, then let it die.** A stalled-but-viable idea earns at most one resurfacing. No pinning, no banners.
- **Venue/context suggestions key off the group's actual history,** never generic geography.

---

## UI & copy rules

### Color

- **Teal is the single primary action per screen.** Exactly one teal action per screen (Continue, Share invite link, Join, I'm in, Add to calendar). Never decorative, never on a chat bubble. Secondary actions are outlined; tertiary are text links. A card's own action is teal: a full teal footer band on simple confirmation cards (the onboarding playback card), or a teal primary button plus an outlined secondary on the event card ("I'm in" / "Can't make it").
- **Lime is Orbit's brand color, not an action.** Orbit's avatar, brand moments, and gap-prompt cues (the lime "what time?" prompt) are lime. Lime never marks a primary action and never appears as a plain button. (Lime and teal are the two fixed chromatic decisions because each carries meaning; their exact values live in the design tokens.)
- **Dark is the default theme.** The product is designed dark-first across every screen.
- **Status by brightness plus icon or label, never by hue.** RSVP and event states are distinguished by brightness and an icon or text label (a checkmark for in, grouped IN / OUT / HAVEN'T REPLIED labels), never by color alone.
- **Never rely on red/green as the only signal** (accessibility: the product owner is red/green colorblind). Use shape, label, or position alongside color.

### Type & sizing

- **One locked type scale, applied across all screens.** Sizes are in rem so they honor the device text setting; line-heights are unitless. Size tokens are `--type-*`, line-height tokens are `--leading-*`, kept separate from the `--text-*` color tokens so a size change never touches color.
  - `--type-display` 1.75rem / 28px · `--leading-tight`
  - `--type-title` 1.5rem / 24px · `--leading-tight`
  - `--type-heading` 1.25rem / 20px · `--leading-tight`
  - `--type-body` 1.0625rem / 17px · `--leading-normal` (raised base)
  - `--type-meta` 0.9375rem / 15px · `--leading-normal`
  - `--type-label` 0.875rem / 14px · `--leading-normal`
  - `--type-eyebrow` 0.8125rem / 13px · `--leading-normal` (hard floor, nothing smaller anywhere)
  - `--leading-tight` 1.15 · `--leading-normal` 1.5
- **Role to token mapping:** group identity name at display; event-detail title at title; preview-card title and home header at heading; body and chat at body; primary and share CTAs at body; compact in-card buttons (RSVP, add to calendar, leave) at label; metadata, status, and Orbit's reference note at meta; uppercase eyebrows at the floor.
- **Layout grows with content, never clips.** Use min-height plus padding, not fixed heights. Containers grow with their text. Buttons stack when they cannot sit side by side. (Rationale and the event-card proof in build-notes §7.)

### Chat voice system (distinguished by structure and weight, not specific color)

- Orbit speaks as its avatar, no name label, in a soft muted fill. Members speak as a name label, no avatar, in an outlined low-fill bubble. The viewer is right-aligned in the strongest fill, which must not be the teal primary-action color (a teal self-bubble would read as a button) and is not lime (which reads as Orbit).
- **Bubbles for dialogue, notes for reference.** Use a chat bubble only when the user's next on-screen action responds to Orbit. On reference pages, Orbit leaves a labeled note, never a bubble.
- **One onboarding exception:** the Step 1 bubble drops its avatar, shifts to the left margin, and keeps a small tail pointing up at the header. It is the only tailed bubble in the product. (Implementation note in build-notes §7.)

### Copy

- **Orbit's voice is plain, warm, and approachable** to everyone from a teen to an 80-year-old (target roughly a 7th to 8th grade reading level). This applies to Orbit's user-facing copy only, not to code, comments, or commit messages.
- **Soft declines everywhere.** "Next time," never "Pass" or a bare "No." Honest tallies depend on socially comfortable exits.
- **No em-dashes in any user-facing copy.** Use commas, periods, parentheses. (Standard hyphens in compound words are fine.)
- **Three-letter weekday abbreviations** in schedule and rhythm copy ("Mon & Wed mornings @ 8am"), both as a display rule and as something Orbit follows when it generates copy.
- **Generated display copy is structured-extract-then-format.** Orbit extracts structured fields (days, time, part of day, cadence) and the UI composes the compact display string deterministically; Orbit writes free prose only for its own chat nudges, constrained by format, length, and examples. This is Level 1 AI (prompt engineering) and it also yields the structured data that reminders, the calendar button, and check-ins need. (Why, in build-notes §7.)

### Cards & layout

- **People, not counts, where identity matters.** The event detail roster shows who, by name, grouped IN / OUT / HAVEN'T REPLIED. The compact preview card is counts-only ("4 In · 1 Out · 4 TBD": In always shown, Out only when nonzero, TBD is the pending count, no names), a deliberate brevity choice to keep the card short. (Why, in build-notes §7.)
- **Preview cards show the gist plus the primary action; the detail screen carries completeness.** Counts-only status, the short venue label, and day abbreviations are all instances of this brevity and real-estate discipline.
- **Separator dots** between metadata items are slightly larger and brighter than a hairline so they read as deliberate, still subordinate to the text. Each dot binds to the end of its item, so a wrapped line always starts with a word.
- **Header grammar:** the Orbit logo top-left is the home button (anticipating multi-group); the group title with chevron opens group info. The group emblem lives on the info page and the future multi-group home, not in the header.
- **The event card stays pinned at the top** as the constant next-event reminder; the chat feed is its own scroll region below it, above a pinned input. **The chat body stays at `--type-body` (17px) and is never shrunk to fit.** (An open question about condensing the card after RSVP is recorded in build-notes §7; do not build it preemptively.)

---

## Data model (load-bearing rules)

- **Many-to-many user-to-group from day one.** Scope events, RSVPs, and Orbit's context per group. The multi-group home is a fast-follow; the backend must be ready so it's additive, not a retrofit.
- **An RSVP attaches to exactly one event. Attendance never inherits from a parent.** No event nesting in the MVP schema, but never build a shortcut (e.g. a group-level RSVP implying event attendance) that would foreclose adding it later via a nullable parent reference.
- **RSVP is per-person status (in or out), never a stored count.** Counts are derived. "No reply yet" is the absence of an Rsvp row, not a third stored enum value; the RsvpStatus enum is IN / OUT only.
- **Event location is a set of venue options (usually one); RSVPs carry an optional venue.** MVP UI stays single-location, but the model supports the split. A venue also carries an optional short display label that Orbit suggests once at creation time (a Level 1 prompt), stored on the venue and editable, never regenerated per render.
- **Events store a start and an optional end** (multi-day gatherings are date ranges).
- **Emails are never displayed anywhere in the UI,** even after capture. Member lists are names only.

---

## Identity & auth

- Anonymous session on entry, upgraded later by attaching an email (then magic-link sign-in). Orbit asks for the email after the user's first RSVP, with a concrete reason attached.
- Invite-link taps must check for an existing session first and route members in, rather than creating duplicate accounts.
- Names are the only identity needed to participate (founder gives theirs in onboarding Step 1; members on the join screen).

---

## Code quality standard

- **Write production-readable code for engineer reviewers.** This codebase will be read by engineers evaluating product-and-engineering fluency. No quick hacks left unflagged.
- **Flag technical debt explicitly** when it's created, in plain language, even when deferring it intentionally.
- **Explain decisions in commit messages and PRs** the way a strong PM would: what changed and why.
- Stack: Next.js, Supabase (db + auth), Prisma, Vitest, Vercel. RAG + MCP are the AI differentiators.
- **This is Next.js 16, which changed conventions from earlier versions.** Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (flagged in `AGENTS.md`) and heed deprecation notices. Do not assume older Next patterns from training data.

---

### How the build agent should work

- **Ask or flag before assuming on anything that shapes product behavior, requirements, or architecture.** On pure implementation detail, use your judgment and pick the simplest thing that works, but record any notable choice (a line in the PR, and in build-notes §11 if it is a lasting decision) so the reasoning is visible later. Rule of thumb: if a future reader would ask "why was it done this way," either ask first or write it down. (This deliberately preserves "prescriptive on the what, open on the how." It is not a mandate to stop and ask about everything.)
- **Stay in the lane of the current slice.** Do not refactor, rename, or "improve" code that is not part of the task, even when it looks better that way. Clean, focused diffs are part of what this codebase is meant to demonstrate. If you spot something worth changing elsewhere, note it rather than doing it.
- **Flag uncertainty before proceeding, and verify instead of guessing.** If you are not confident about an approach or a detail, especially anything Next.js 16, Prisma 7, or Supabase specific, where conventions have shifted, say so and check the docs before acting. Confidence without certainty causes more damage than admitting a gap.
- **Branch and PR discipline.** When fixing or refining work whose PR is still open and unmerged, commit to that PR's existing branch rather than opening a new branch or PR. The fix updates the open PR in place. Open a new branch and PR only for (a) a genuinely new slice, or (b) a fix to something already merged to main. Rationale: a slice that takes several attempts should land as one coherent PR, not a chain of fragmented ones. This also avoids stacking a new branch on an unmerged one, which is what creates messy merge conflicts after a squash-merge.
- **Merge boundary and self-merge.** You may resolve merge conflicts and do post-merge cleanup (pulling main, deleting merged branches) when asked. For merging to main: you may self-merge a PR only if every changed file in it is a Markdown (.md) documentation file. If a PR touches any non-.md file (anything under src/, any .ts/.tsx, schema, config, or tests), do not merge it; leave it open for the human product owner to merge deliberately in GitHub. The merge-to-main decision stays with the human for any change that includes code.

---

## Out of scope for MVP (don't build, don't design around)

Multi-group home UI · multi-venue UI · event nesting · logistics/travel features · multimodal input (forwarded emails, screenshots) · web push · photo avatars · opt-out attendance preferences. These are fast-follows; the data model accommodates them, the MVP does not implement them. See `docs/build-notes.md` §8.
