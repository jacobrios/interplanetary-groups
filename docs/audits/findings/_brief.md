# Shared brief: pre-launch whole-codebase audit (22 Aug 2026)

> **FROZEN as of 22 August 2026. Do not read this file as the current rule set.**
> It is the audit's own input, kept exactly as the agents received it, so the
> findings underneath can be read against what was actually asked of them. Some
> of what it states as invariant has since been amended; the invariant list
> below already quotes at least one rule (emails never displayed anywhere in the
> UI, amended 27 August 2026) that no longer reads that way. **`CLAUDE.md` is
> the current rule set, and it wins.** A future audit run must take its
> invariants from `CLAUDE.md` on the day it runs, and write its own brief, or it
> will report compliant code as a violation of a rule that no longer exists.
> (Banner added 27 August 2026, on review. Only the file's status is annotated;
> its content is deliberately untouched.)

Every agent in this audit reads this file first. It carries three things: the reporting
contract, the suppression list (findings already registered, which must not be re-reported),
and the invariant list (rules this project states as always-true, which lane 4 checks).

---

## 1. The reporting contract

**This audit is READ-ONLY. Do not edit, create, or delete a single file in `src/`,
`prisma/`, `scripts/`, `evals/`, or any config.** Not even a one-line fix, not even
an obvious typo, not even to prove a finding. Anything you find becomes the owner's
decision afterwards. That constraint is the point of the exercise. The only files
written during this audit are the per-lane findings files under `docs/audits/findings/`.

**Do not run the eval benches** (`npm run eval:detect`, `npm run eval:onboarding`).
They cost money and hit the network. **Do not start a dev server.** **Do not run
migrations or seed scripts.** Running `npm test`, `npx tsc --noEmit`, and `npm run lint`
is allowed and encouraged as evidence.

**Every finding must carry all six fields:**

| Field | Rule |
|---|---|
| `title` | One sentence, plain language, states the defect |
| `file:line` | Exact anchor. A finding you cannot anchor is not a finding |
| `consequence` | **What goes wrong for a person using the product, or for the business.** Written for a non-technical product owner. If you cannot name one, see the two-tier rule below |
| `evidence` | The code path that produces it. Quote the lines. Do not paraphrase |
| `severity` | `fix-now` / `queue` / `decline` |
| `confidence` | `certain` / `likely` / `unsure` |

**The two-tier rule.** Write down everything you find. Findings that can name a real
product or business consequence go in the `## Findings` section and reach the owner.
Findings that are genuinely real but cannot name a consequence (style, taste, a tidier
way to express something that works correctly today) go in an `## Appendix` section in
the same file. Never discard a real finding to meet the bar; never promote a taste
preference into the main section to pad it.

**Severity means:**
- `fix-now` — this can hurt a real user, leak data, lose a vote, or embarrass the owner
  in front of the investor the first shared link goes to.
- `queue` — real, has a cost, but the product ships correctly without it.
- `decline` — you found it, and the honest recommendation is that nothing gets worse by
  never doing it. **`decline` is a first-class answer and a good outcome. Use it.**

**Write in product language, not engineering language.** Not "this violates separation of
concerns," but "this will make it harder to add a second venue later without rebuilding
this piece." The reader does not read code and has said so deliberately. Mechanism belongs
in `evidence`; `consequence` is for them.

**Do not report a finding you have not verified in the code.** A hunch is not a finding.
If you suspect something but cannot confirm it, report it with `confidence: unsure` and
say exactly what you could not check. "I could not verify X" is a complete and useful
answer here; a confident claim that turns out untrue costs more.

---

## 2. Suppression list: already registered, DO NOT re-report

These are known, recorded, and carried on purpose. Re-reporting them is noise.
**If you find one of these, say nothing about it.** If you find something that *looks*
like one of these but is materially different (different file, different mechanism,
worse than recorded), report it and say explicitly how it differs from the registered item.

**Visual and accessibility**
1. Mid-word break on a long single-word label at enlarged device text, on group info,
   the join card, and `PlaybackCard`. Queued behind a card-level grid
   (`minmax(58px, max-content) 1fr`) applied at the pattern, not at the three instances.
2. A declined member's name renders at 4.4992:1 against `--surface-raised`, a hair under
   WCAG AA. Shipped knowingly: design-system token pairing, status never depends on it,
   the ladder is hue-free.
3. Hardcoded `#f87171` in `ChatInput.tsx` and `choice.tsx` where `--danger` exists.
   Left unported deliberately as out of lane.
4. `LeaveGroupButton` is a pill while `ManageMembers` and `ResetInviteLink` are
   rectangular, on the same screen. Queued.
5. The multi-card carousel's peek geometry and the deleted dot row / header subline are
   settled decisions, not defects.

**Product gaps, deliberate**
6. A founder has no path to fix group details after group creation (wizard, info page,
   or Orbit). Queued post-MVP.
7. No fix path for a wrong venue. Orbit's correction path covers time only; venue, day,
   and rhythm changes each get an honest decline until each gets its own slice.
8. Verbal RSVP is written as a guardrail but not built. "See you Monday" in chat does
   not become an RSVP. Correct for today's build.
9. The both-true claim: a message read as both a fresh idea and a change request is
   discarded whole. Its own queued slice.
10. A read-only question about the group's plans ("what's open?") and any question outside
    the product ("what's the weather?") get SILENCE by the owner's decision. This is the
    chosen behavior, not a gap.
11. No request-to-join flow behind the members-only wall. Queued.
12. Email capture after first RSVP, and the whole email/digest arc. Post-MVP.
13. Orbit-miss observability and a user feedback affordance. Queued, declined for now.
14. Multi-group home, multi-venue UI, event nesting, web push, photo avatars,
    opt-out attendance, multimodal input. Explicitly out of scope for MVP.

**Model behavior**
15. The recognition bench's `bare-ask-no-plans` case sits in the `accepted` bucket at
    roughly 60%. Settled 19 Aug: it is model drift, invention is structurally unreachable
    on that path (`change-plan.ts` returns a fixed `NO_PLANS_REPLY` constant), and the
    owner accepted silence there.
16. Group names are model-generated and the residual risk is measured, not removed.
    `rejectWeekdayNameOnMultiDay` in `normalize.ts` closes the weekday case.

**Engineering, registered**
17. The test suite round-trips to the remote dev-test Supabase, costing seconds per test
    (~83s total). Queued with two triggers: the suite crossing three minutes, or the first
    unreproducible failure.
18. The dev-test database holds many near-duplicate groups from repeated onboarding runs.
    Queued as its own chore.
19. An `.ics` entry already saved does not update itself when the group later moves the
    plan. Honest limitation, feed announcement is the correction channel.
20. `zonedWallTimeToUtc`'s pre-dawn large-negative-offset quirk was FIXED (occurrence
    slice). Do not re-report it as latent.
21. The test for `run-tests-unless-docs.mjs` is queued, cheap next time that file is touched.
22. `parseRhythm` rejects a wrong-type `durationMinutes` while `venueName` degrades to
    null: a strictness asymmetry, observed and deliberately left alone.
23. The screens are server-rendered and talk to the database, so component tests cover only
    the shared pieces in `src/components/`. Known coverage shape, not a defect.
24. The ten-item pre-deploy checklist in §11 exists and is the source of truth. Reporting
    that an item on it is not done yet is noise; reporting that the checklist is MISSING
    something real is a finding.

---

## 3. Invariant list: rules this project states as always-true

Lane 4 checks these against the code. Other lanes should report a violation they trip over.
Each is quoted or condensed from `CLAUDE.md`. A violation is a finding; so is a rule that
turns out to be unenforceable or already contradicted by a settled decision.

**Time**
- Everything renders in the **group's timezone**, never viewer-local. One named exception:
  the member's own calendar app showing an `.ics` event in local time is correct.

**Colour and status**
- Teal marks an action that genuinely matters; never on a secondary action, never
  decorative, never on a chat bubble.
- Teal never leans an open question: two equally valid answers carry equal weight while
  open. Only a chosen answer holds the teal fill. Chips stay grey everywhere.
- A need label naming the viewer's own move renders teal; one naming other people's move
  stays grey.
- Lime is Orbit's brand colour, never an action, never a plain button.
- Status by brightness plus icon or label, **never by hue**. Never red/green as the only
  signal (the owner is red/green colourblind).
- Dark is the unconditional default; `:root` declares `color-scheme: dark`; the palette
  tokens in `globals.css` are the single source.
- The four surfaces mean elevation, in brightness order: `--surface-base` page,
  `--surface-low` idea card, `--surface-raised` confirmed card or Orbit bubble,
  `--surface-self` the viewer's own bubble.

**Type**
- One locked scale. `--type-*` and `--leading-*` in `globals.css` are the single source;
  sizes in rem, line-heights unitless.
- Nothing anywhere goes below the 13px eyebrow floor.
- The chat body stays at `--type-body` (17px) and is never shrunk to fit.
- Layout grows with content, never clips: min-height plus padding, not fixed heights.

**Copy**
- **No em-dashes in anything Orbit says.** (Product-voice rule, distinct from the
  build-agent communication rule.)
- Soft declines everywhere: "Next time," never "Pass" or a bare "No."
- Three-letter weekday abbreviations in schedule and rhythm copy.
- Plain, warm, roughly 7th-8th grade reading level.
- Generated display copy is structured-extract-then-format: Orbit extracts fields, the UI
  composes the display string deterministically.

**Data model**
- **RSVP is per-person status (IN / OUT only), never a stored count.** Counts are derived.
  "No reply yet" is the absence of a row, not a third enum value.
- An RSVP attaches to exactly one event; attendance never inherits from a parent.
- **Orbit is never a User or Membership row.** It speaks via `MessageAuthor.ORBIT` with a
  null author, so it can never appear in a roster, member list, or RSVP tally.
- **Emails are never displayed anywhere in the UI**, even after capture.
- Event location is a set of venue options; events store a start and an optional end.
- Many-to-many user-to-group from day one; everything scoped per group.
- The server-side completeness gate is the only door to group creation; the confirm action
  re-validates the client-held payload on the server.

**Orbit's behavior**
- **The claim-to-fact boundary is `src/lib/orbit/normalize.ts`.** Every user-facing behavior
  keying off an extraction result reads the normalized shape, **never the raw response**.
- Stored state is not display: carry it, do not regenerate it. Untouched fields on a merge
  are copied verbatim.
- **Venue never gates anything.** Not the completeness gate, not the gap-ask, not group or
  event creation. A missing or invalid venue always degrades to nothing.
- Never leave a direct ask hanging, where "direct ask" means a request Orbit can act on.
- Nudge sparingly; one bump, then let it die (with the named day-blocked carve-out).
- Every place Orbit decides to speak or stay quiet is listed in build-notes
  ("Where Orbit decides to speak or stay quiet"). **The 29 July bug was that register and
  the code disagreeing, in separate files. Check them against each other.**
- Membership is a real boundary: every write path refuses a non-member server-side through
  `src/lib/auth/membership.ts`.

**Stack**
- Next.js 16, Prisma 7, Supabase **auth only** (Data API disabled; the single thread is the
  `supabaseAuthId` pointer). Reaching for supabase-js to touch data is a defect.
- Prisma 7 ships no bundled query engine (a driver adapter is required) and does not
  auto-run `prisma generate`.
- Two databases, never crossed. Production and `interplanetary-groups-dev-test` are
  separate projects. `npm run db:which` is the sanctioned check.

---

## 4. How to write your findings file

Write to `docs/audits/findings/lane-<N>-<slug>.md`. **Write it as you go, not at the end**,
so a run that dies partway still leaves its work behind. Structure:

```markdown
# Lane N: <name>

## Coverage
Files I read, one per line, exact paths. Then: files assigned to me that I did NOT read,
and why. Be honest here; the ledger is checked.

## Findings
### F-N-1: <title>
- **file:line** — path:NN
- **consequence** — ...
- **evidence** — ...
- **severity** — fix-now | queue | decline
- **confidence** — certain | likely | unsure

## Appendix (real, but no product consequence)
...

## What I could not check
...
```
