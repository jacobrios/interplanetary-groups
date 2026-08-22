# Polish slice three: the remaining screens

**Date:** 21 Aug 2026 · **Branch:** `feat/visual-polish-3` · cut from main at `61b8c4b`

---

## Front section (for the owner)

**Settled, do not relitigate:**

- Five screens remain: the front door, the join screen, event detail, group info, and the three dead-end screens (not-found, error, invite-only wall). One slice, not two: one token map, no new seams, nothing unproven.
- Build sources. The front door has a real high-fidelity handoff (`design-polish-rd-2/README.md` item 01, values in `round4-base.css`). Join, event detail and group info are drawn in `walkthrough.css` (`.jn-` 208-265, `.ed-` 391-459, `.gi-` 461-522) plus the override passes at 524-698, the same situation slice two found for the wizard. The dead-end screens are drawn nowhere.
- The OrbitPause precedent half-applies to the Orbit note wall. The *screen* is undrawn, so its shape stands: centred column, one note, one quiet non-teal way out. The *note element* is drawn, as `.ed-slip` on event detail, which is the treatment `OrbitNoteScreen` says it copied. So the note gets real ported values and the screen shape is left alone. Nothing invented either way.
- Copy travels with any element this slice rebuilds, and stays put everywhere else (owner, 21 Aug). This adopts the join screen's designed copy, which also retires our current "you can add an email later to keep access" line: that promises email sign-in the product does not have.
- The event screen keeps our RSVP pair. The design's "✓ You're in / Change" band predates the card-state-grammar slice and would cost a tap.
- The invite-only wall and the bad-invite screen lose their outer eyebrow, keeping the note's own "A note from Orbit" label (owner, 21 Aug). Two stacked uppercase labels, the outer one restating the note's first clause. A deletion, not an invention, so the undrawn-screen rule is not in tension with it.
- Email stays post-MVP. Capture alone is small, but sign-in needs a verified sending domain, which is a first-use-of-an-external-service seam and cannot be verified without it.

**Not in this slice, and where each belongs:**

- The event screen's drawn "A note from Orbit" slip — declined (owner, Q2). Its copy promises a nudge before a confirmed event; verified that nothing sends one, the one-bump rule being a gauge mechanism only. Belongs with whatever slice builds real reminders.
- The venue "MAP" link on event detail — queued (owner, Q2). A feature rather than polish, and it lands on the known wrong-venue gap. Belongs with "founder can fix group details after creation."
- Both polish-slice-two carryovers, the step 1 field order and step 2's group name as a title bar — queued (owner, Q4). Onboarding is slice two's lane and it landed.
- The real-phone Safari pass — the owner's, as step 1 of this PR's QA script. The build cannot run it.
- Any behaviour, copy-outside-a-rebuilt-element, prompt or model change — none anywhere.
- `#f87171` in `ChatInput.tsx` and `choice.tsx` — out of lane. Named in the task report, not touched here.

**Verification, written before any code:** every one of the five screens rendered at a 375x812 mobile viewport and compared by *computed value*, not by eye, against the values this document quotes; the join screen and event detail additionally rendered beside `screens-05-06.png` and `screens-09-10.png`; screenshots shared in chat. The invite-only wall and the bad-invite screen reached through their real routes, not by rendering the component. Suite before and after in the PR, plus `npx tsc --noEmit`. The one thing the build cannot honestly produce is the phone pass; it is named as a gap and handed over, exactly as slice two did.

**Expected debt:** ragged value columns wherever a fixed key-column width becomes a floor (the accepted cost slice two already carries on the playback card, now reaching the join and group-info cards; a card-level grid remains the queued fix). The join screen's returning-session state is our own design, not drawn anywhere. Two `#f87171` sites left untokenized outside this lane.

**Test-suite baseline at slice start:** 92 files, 934 tests, all green, zero skipped, verified on this branch before any code. This matches the narrow-weekday-rule slice's finishing number exactly; there is no pre-existing failure to carry. Known flaky: `src/lib/orbit/__tests__/endgame.test.ts`'s overlapping-sweeps case reaches the live dev-test database and can fail on network conditions. Leave it alone unless it fails twice.

---

## Task-by-task detail (for executing agents)

### General rules binding every task

1. **Map handoff tokens by value, never by name.** `walkthrough.css`'s own `:root` (lines 6-50) is the authority. The traps, all confirmed by reading it: `--ink` = `#ECEDF2` = our `--text-primary`; `--ink-soft` = `#A7AAB6` = our `--text-secondary`; **`--ink-faint` = `#A7AAB6` = our `--text-secondary`, NOT `--text-faint`**; `--stroke` and `--stroke-strong` and `--border` are all `#454c5e` = our `--hairline`. This exact mistake shipped a regression in slice two and was then repeated in a task brief. Note the asymmetry: `round4-base.css` (the front door) names `--text-faint` *directly*, and there it genuinely means `--text-faint` (`#6F7280`). Read the source each time.
2. **A later override pass supersedes an earlier definition, so the LAST definition of a selector is the correct one.** Before porting any value, grep the whole stylesheet for every occurrence of that selector. Worked example you will hit: `.jn-primary` is drawn lime at line 251 and overridden to teal at line 548. Lime is the wrong answer and the stylesheet says so, twenty lines later.
3. **The design's fixed geometries were drawn against short example data and cannot hold real content.** Every `height` becomes `minHeight`; every fixed key-column `flex: 0 0 Npx` becomes content sizing with an `Npx` floor and a ~60% ceiling, the pattern `PlaybackCard` already uses. This is CLAUDE.md's "layout grows with content, never clips," and it beat the design source twice in slice two. Where you convert one, say so in the task report.
4. **Recorded decisions beat the design source.** The design predates several shipped rulings. Where they disagree, follow the record and flag the disagreement in the task report rather than silently picking one. Known live cases: the role map puts sentence-case reference text at `--type-meta` where the stylesheet says eyebrow; `PageHeader` owns the back bar where the design draws the back link inline; lime is never an action.
5. **`--display` is Hanken Grotesk in the handoff and Geist in this product.** Render it as Geist at `fontWeight: 800` with the quoted letter-spacing. That is slice one's precedent and slice two's; do not add a font.
6. **Styling pattern:** inline style objects reading custom properties from `globals.css`. Add a stylesheet rule only where a style object genuinely cannot express it (a pseudo-element), and say so in the report. Add no new tokens.
7. **No animation anywhere.** Existing in-flight `opacity` treatments stay as they are, without transitions.
8. **The reference PNGs are for eyeball comparison only, never a source of values.** A difference between a rendered screen and a PNG is a question to raise, not a defect to fix.
9. **Tests.** These screens are server-rendered and talk to the database, so they cannot be unit tested; the repo can only test components. Where a task changes a shared or client component's rendered structure or accessible content, update its tests honestly, test-first where behaviour changes. Style-value-only changes need no new test. Do not invent a test that cannot fail.
10. **Report what you could not verify.** An unverified claim costs more than an admitted gap.

---

### Task 1: The front door (`/`)

**File:** `src/app/page.tsx`. **Source:** `design-polish-rd-2/round4-base.css` lines 10-25, described in `README.md` item 01. This is the only screen in the slice with a purpose-built high-fidelity handoff; treat its values as exact.

The session-aware redirect at the top of the file is behaviour and does not change. Only the returned markup changes.

Current state: a vertically centred `maxWidth: 28rem` block, an eyebrow, an `h1`, a lede, and a rectangular `0.5rem`-radius teal link. The layout, the mark, the button shape and the closing note are all wrong or missing.

**Structure**, top to bottom, replacing the centred block:

- Root `main`: `flex-direction: column`, `padding: 4px 24px 0`, `minHeight: 100dvh`, `--surface-base`. **Not** centre-justified: the mark holds the top and the copy sinks to the bottom.
- **Orbit mark** — a 104x104 box, `margin: 6px 0 0 -9px`, `flex: 0 0 auto`. The negative left margin is deliberate and documented in the README: the orbit path overflows the sphere, so this optically aligns the sphere with the 24px gutter. Use the existing `OrbitMark` component at `size={104}`; verify it renders uncropped at that size, since the moon and path overflow the sphere's box (the wizard header hit exactly this in slice two). This is the only lime and the only brand moment on the screen.
- **Copy block** — `margin-top: auto`, `flex: 0 0 auto`. That auto margin is what pins the copy and action low while the mark stays high; the gap between absorbs longer text.
  - Eyebrow: `--type-eyebrow`, uppercase, `letter-spacing: .18em`, `fontWeight: 700`, **`--text-faint`** (genuinely faint here, see general rule 1), `margin: 16px 0 0`. Copy unchanged: "Interplanetary Groups".
  - Headline: `--type-display`, Geist 800, `--leading-tight`, `letter-spacing: -.015em`, `--text-primary`, `margin: 9px 0 0`, `textWrap: "balance"`. Copy unchanged.
  - Lede: `--type-body`, `--leading-normal`, `--text-secondary`, `margin: 12px 0 0`, `textWrap: "pretty"`. Copy unchanged.
- **Footer** — `flex: 0 0 auto`, `padding: 22px 0 4px`.
  - CTA link to `/create`: flex row, centred, `gap: .5em`, `minHeight: 52px` (a floor, not a height), `padding: .5em 1.2em`, `borderRadius: 28px`, `--action` fill, `--action-ink` label, `--type-body`, `--leading-normal`, `fontWeight: 700`. Label "Start your group" followed by an arrow SVG: `viewBox="0 0 24 24"`, `width/height: 1.05em`, `fill: none`, `stroke: var(--action-ink)`, `strokeWidth: 2.4`, round caps and joins, path `M5 12h14M13 6l6 6-6 6`. Mark it `aria-hidden`; the label already carries the meaning.
  - Note, new: `--type-eyebrow`, `--leading-normal`, `--text-faint`, centred, `margin: 12px 0 0`. Copy: "Already invited? Open the link you were sent." Deliberately **not** a second button, per the README: people with an invite link land on the join screen, not here.

**Rules to hold:** one action only, no nav, no marketing sections, nothing below the fold at default text size. At larger OS text sizes the page grows and scrolls and nothing truncates — check this, because the `margin-top: auto` layout is the part that could break under it.

---

### Task 2: The join screen (`/join/[inviteToken]`)

**Files:** `src/app/join/[inviteToken]/page.tsx` and `JoinForm.tsx`. **Source:** `walkthrough.css` lines 208-265, plus overrides at 548 (teal fill), 552-553 (arrow stroke), 569-573 (card surface and shadow), 575-578 (input surface and border), 628-632 (bubble border), 637-639 (placeholder grey). **Reference:** `docs/design/walkthrough-screens/screens-05-06.png`, left frame.

This is the slice's largest build. The screen today is a bare `h1`, a subtitle, a labelled input and a rectangular button. The design is a real screen: an eyebrow, Orbit introducing itself, a card telling you what you are joining, a pill field, a pill action, and a reassurance line.

**Data.** The page currently fetches only the group row. It now also needs the member count and the stored rhythms. Extend the existing `findUnique` with `_count: { select: { memberships: true } }` and select `recurringActivities`; do not add a second query. Compose the rhythm rows with `parseStoredRhythms` and `formatRhythmRow` from the group-info page, reused verbatim, venue appended the same way. Do **not** write a second formatter.

**A disclosure note, already ruled and recorded here so it is not rediscovered:** this shows the group's rhythms and member count to someone who is not yet a member. That is intended (owner, 21 Aug). The invite link is the credential, and telling someone what they are joining is the screen's whole job. It does not loosen the members-only wall, which governs the group's own surfaces.

**Structure**, replacing `JoinForm`'s current body. The screen stays headerless (nothing to navigate back to) and the root keeps `minHeight: 100dvh` on `--surface-base`, but drops `justifyContent: center` for the design's `.jn-body`: `flex: 1 1 auto`, `flexDirection: column`, `padding: 10px 24px 18px`.

- **Eyebrow** (`.jn-eyebrow`): `--type-eyebrow`, `letter-spacing: .18em`, uppercase, `--text-secondary`, `fontWeight: 700`, `padding: 6px 2px 14px`. Copy: "You're invited".
- **Orbit bubble** (`.jn-msgrow`, `.jn-msgav`, `.jn-msg`): reuse `src/components/OrbitBubble.tsx`. Its shipped values already match the design's join bubble (28px mark, 9px gap, bottom-aligned, `--surface-raised`, hairline border, `16px 16px 16px 5px` radius, `12px 14px` padding, `--type-body`), so consume it rather than restyling. Its `marginTop: 12px` and `maxWidth: 93%` come along; check they read correctly here and report if not, but do not fork the component. This bubble carries an avatar and no tail: the tailed treatment belongs to a wizard bubble sitting directly under the header, which this is not.
  - Copy, new: `Hey! I'm Orbit. I keep {groupName} running so nobody has to be the organizer.`
- **Group card** (`.jn-card`): `marginTop: 18px`, `--surface-raised`, `1.7px solid var(--hairline)`, `borderRadius: 14px`, `boxShadow: 0 1px 3px rgba(0,0,0,.35)` (the dark override's shadow, matching `EventCard`, not the light `4px 5px 0` value in the screen block), `padding: 16px 17px 15px`.
  - Title (`.jn-cardtitle`): the group name at `--type-title`, Geist 800, `letter-spacing: -.01em`, `--text-primary`, `--leading-tight`.
  - Rows (`.jn-rows`, `.jn-row`): `marginTop: 12px`, each row `display: flex`, `gap: 12px`, `padding: 9px 0`, separated by `borderTop: 1.4px solid var(--hairline)`. Key: `--type-eyebrow`, `letter-spacing: .14em`, uppercase, `--text-secondary`, `fontWeight: 700`, `paddingTop: 2.5px`, and **58px as a floor with content sizing above it and a ~60% ceiling**, not `flex: 0 0 58px` (general rule 3; the design's own board shows "CLIMBS" while real extraction yields the founder's word). Value: `--type-meta`, `--text-primary`, `fontWeight: 500`, `--leading-normal`.
  - Rows to render: `WHO` with the member count ("8 members", singular "1 member"), then one row per stored rhythm using its own label and formatted value.
  - The design's board additionally shows a "BEERS · now and then, about once a month" row. **Nothing in the data model holds a monthly cadence.** This is the recorded signature silent-drop failure and it is already a known gap; render only what `parseStoredRhythms` returns and do not invent a cadence row. Say in the task report that you hit it.
- **Name field** (`.jn-field`, `.jn-input`): `marginTop: 22px`; the input itself `borderRadius: 26px`, `padding: 14px 18px`, `--surface-raised`, `1px solid var(--hairline)` (per the 575-578 override, which replaces the screen block's 2px `--ink` border and its shadow), `--type-body`, `--text-primary` for entered text. The `::placeholder` rule in `globals.css` already gives it the right placeholder grey.
  - The design shows no separate label; the field's own text is "What should the crew call you?". Move that to the placeholder and **keep an accessible name**: a visually hidden `<label htmlFor>` is preferred over `aria-label` so it survives translation tooling. A placeholder alone is not an accessible name; do not ship one.
- **Primary action** (`.jn-primary`): `marginTop: 14px`, `minHeight: 52px` (floor, not `height`), `borderRadius: 28px`, `--action` fill with `--action-ink` label per the line-548 override, centred flex, `gap: 8px`, `--type-body`, `--leading-normal`, `fontWeight: 700`. Label stays `Join {groupName}` and gains a trailing 17px arrow SVG stroked `--action-ink` at `strokeWidth: 2.6`, `aria-hidden`. The existing pending state (`Joining…`, `opacity: 0.65`, `cursor: not-allowed`, disabled) is preserved exactly, no transition.
- **Reassurance** (`.jn-reassure`): `marginTop: 13px`, centred, `--type-eyebrow`, `--text-secondary`, `fontWeight: 500`, `--leading-normal`, `padding: 0 16px`. Copy, replacing the current line: "No app to download, no password. You'll land right in the group." The line it replaces promised email sign-in that does not exist; that is the point of the change, not a side effect.
- **Returning-session state.** The `currentName !== null` branch ("Joining as *Name*") is drawn nowhere. Keep its behaviour and its copy; dress it to sit in the card's place consistently with the rest of the screen, using values already on this screen and no invented ones. Name it in the task report as our own design, the way the Manage-members state was.
- **`--danger`:** replace both hardcoded `#f87171` occurrences in this file with `var(--danger)`. Identical value, no visual change.

---

### Task 3: Event detail, the details card

**File:** `src/app/events/[id]/page.tsx` (the details half; task 4 takes the roster). **Source:** `walkthrough.css` lines 391-435, plus overrides at 569-573 (card surface and shadow), 596-600 (the band), 680-681 (the calendar button). **Reference:** `screens-09-10.png`, left frame.

All data derivation, the membership gate, the proposal band and the calendar button's placement are behaviour and stay exactly as they are. This task changes structure and values only.

**What is wrong today.** The title sits *outside* the card. The meta rows are stacked key/value pairs ("When" over the date), where the design uses single icon-plus-text lines. The card's border and radius do not match the shipped `EventCard`.

**Structure:**

- **Back bar:** keep `PageHeader` + `BackLink`. The design draws the back link inline in the scroll region (`.ed-back`), but `PageHeader` is a shared component that owns the bar's rules and the group info page depends on it; the recorded decision wins. Port only `BackLink`'s type values: `--type-label`, `fontWeight: 600`, `--text-secondary`, an 18px chevron stroked `--text-secondary`, `gap: 5px`. Report the structural difference from the board.
- **Scroll region** (`.ed-scroll`): `padding: 0 22px 16px`, column flex. The current `2rem 1.5rem` padding goes. The page currently nests *two* wrappers (a padded flex column inside `main`, and a `maxWidth: 28rem` column inside that); collapse them to one column that keeps `maxWidth: 28rem` with `margin: 0 auto`, matching the group info page. One wrapper, not two, not zero.
- **Details card** (`.ed-card` + `.ed-pad`): `--surface-raised`, `1.7px solid var(--hairline)`, `borderRadius: 14px`, `boxShadow: 0 1px 3px rgba(0,0,0,.35)`, `overflow: hidden` (the footer band relies on it), inner `padding: 15px 16px`. These match `EventCard`'s shipped values; they are the product's card recipe now, not this screen's alone.
  - **Title moves inside the card** (`.ed-title`): `--type-title`, Geist 800, `letter-spacing: -.01em`, `--text-primary`, `--leading-tight`. Note this is `--type-title` (24px), *down* from the current `--type-display` (28px), which is correct: the role map puts event-detail title at title. Keep it the page's `h1`.
  - **Meta rows** (`.ed-meta`, `.ed-mrow`): a column with `gap: 7px`, replacing `MetaRow` entirely. Each row is `display: flex`, `alignItems: center`, `gap: 9px`, `--type-meta`, `--leading-normal`, `--text-primary`, `fontWeight: 600`, led by a 16px `flex: 0 0 auto` SVG stroked `--text-secondary` and marked `aria-hidden`.
    - When-row: a clock glyph. **Reuse the clock path already in `src/app/create/PlaybackCard.tsx`** (the handoff's own glyph, currently stroked `--lime` for the gap marker); extract it or copy the path, stroked `--text-secondary` here. Do not draw a new clock.
    - Where-row: a map-pin glyph, rendered only when a venue exists. No "MAP" link and no chevron — the design draws one, and it is queued rather than built (front section).
    - Activity row: keep the existing conditional row; it has no drawn glyph, so give it no icon and indent it to the same text column so the rows stay aligned. Name that judgment in the report.
    - The "When" / "Where" / "Activity" key labels are deleted with `MetaRow`. Each row's icon plus its own text carries it, exactly as the board does. `aria-hidden` icons mean the row must still read sensibly to a screen reader from its text alone; the date and venue name do.
  - **RSVP band** (`.ed-band.footer`): `RsvpControls` moves into a card footer band separated by `borderTop: 1.6px solid var(--hairline)`, `padding: 13px 16px`, transparent background, no radius (per the 596-597 override, which strips the lime tint the screen block draws). The current `<hr>` and the inline placement inside the padded body go. `RsvpControls` itself is a shared component and its internals do **not** change: the pair stays, both borders teal while unanswered, the chosen answer filled and checkmarked. Its `groupId` prop and revalidation stay.
- **Below the card**, order unchanged and deliberate: `AddToCalendarButton`, then `ProposalSection`, then the roster card. Port the calendar button's shape from `.ed-cal` plus the line-680 override: `minHeight: 44px` (floor, not `height`), `borderRadius: 24px`, `--action` fill, `--action-ink` label, `1px solid var(--action)`, `--type-label`, `fontWeight: 600`, centred with `gap: 9px` and a 16px calendar glyph stroked `--action-ink`, `aria-hidden`. Note the design's screen block draws this outlined and the refinement pass at line 680 makes it teal, calling it "the single teal primary on the event screen" — the last definition wins, and it agrees with what ships today.

---

### Task 4: Event detail, the roster card and its avatars

**Files:** `src/app/events/[id]/page.tsx` (the `RosterSection` half) and `src/app/events/[id]/RosterAvatar.tsx`. **Source:** `walkthrough.css` lines 436-450, plus overrides at 642 (the check glyph), 643-644 (name brightness), 685-689 (avatars).

**What is wrong today.** The three roster groups sit in one card separated only by a 1.25rem gap, each member on its own stacked row at `--type-body`. The design groups them with hairline dividers and wraps members horizontally, which is what lets a nine-person roster fit on a phone. And the avatars carry a per-name hue.

- **Card:** same recipe as the details card (`1.7px solid var(--hairline)`, `borderRadius: 14px`, the same shadow). The inner `padding: 1.25rem` and `gap: 1.25rem` are replaced by per-group padding.
- **Groups** (`.ed-rgroup`): each group `padding: 11px 16px 12px`, and every group after the first gets `borderTop: 1.4px solid var(--hairline)`. Do not put a divider above the first.
- **Group label** (`.ed-seclabel`): `display: block`, `marginBottom: 8px`, `--type-eyebrow`, `letter-spacing: .14em`, uppercase, `--text-secondary`, `fontWeight: 700`. Keep the existing `LABEL · count` composition. The IN group's checkmark becomes the drawn 12px stroked check from line 642 (`stroke: var(--text-primary)`, `strokeWidth: 2.7`, round caps, `verticalAlign: -1px`, `marginRight: 5px`) instead of the literal "✓" character, which currently renders in whatever the font supplies. Keep the labels' current wording.
- **People** (`.ed-people`, `.ed-person`): `display: flex`, `flexWrap: wrap`, `gap: 8px 16px`; each person `display: flex`, `alignItems: center`, `gap: 7px`; name at `--type-label`, `fontWeight: 600` (down from `--type-body`, matching the board and what makes the wrap work).
- **Brightness carries state, per the 643-644 contrast pass:** IN names `--text-primary`; HAVEN'T REPLIED names `--text-secondary`; OUT names `--placeholder`. Grouping and labels still do the real work; this is reinforcement, and it is hue-free, which matters because the owner is red/green colourblind.
- **Avatars** (`.ed-av`, and the refinement pass at 685-689): 30px circle, `--surface-raised` fill, `1.6px solid var(--hairline)`, glyph stroked `--text-secondary`. The pass is explicit that avatars are "uniform identity anchors, decoupled from status": **every** avatar sits at the same brightness, including the dimmed groups. Only the name and the grouping signal state.
  - This means `RosterAvatar`'s `nameToHue` per-name colour goes. Today the circle is `hsl(hue, 32%, 38%)`, which puts meaningless colour on the one screen where status must never be read from hue, and it is the registered debt from the event-detail slice ("the designed avatar is a celestial doodle generated per member"). Replace the fill and border with the tokens above and keep the deterministic initials as the identity mark, in `--text-secondary` at `--type-eyebrow`. The per-member celestial doodle the board draws is not something to invent; note in the report that initials are the honest stand-in and the doodle stays queued.
  - `RosterAvatar` is used elsewhere — grep before editing and confirm every call site still reads correctly. It stays `aria-hidden`; the name beside it is the accessible content.

---

### Task 5: Group info, the values port

**Files:** `src/app/groups/[id]/info/page.tsx`, `ManageMembers.tsx`, `ResetInviteLink.tsx`, `LeaveGroupButton.tsx`. **Source:** `walkthrough.css` lines 461-522, plus overrides at 543 (the emblem), 569-573 (the card), 574 (the link row's surface), 583 and 589 (the leave button, outlined). **Reference:** `screens-09-10.png`, right frame.

This screen was built from its own handoff and is the closest to done. It is a values port, not a restructure. Nothing about membership visibility, founder powers or copy changes.

- **Identity block** (`.gi-identity`): `padding: 10px 0 4px`. Emblem (`.gi-emblem`) 72px (already correct as `4.5rem`), lime fill with `--lime-ink` text per the line-543 override, but the initials rise to `--type-display` from the current `--type-title`, `fontWeight: 800`, `letter-spacing: .02em`. Name (`.gi-name`) `--type-display`, Geist 800, `letter-spacing: -.01em`, `--leading-tight`, `marginTop: 12px`. Count (`.gi-count`) `--type-label`, `--text-secondary`, `fontWeight: 600`, `marginTop: 4px` — down from the current `--type-meta`. Replace the block's uniform `gap: 0.75rem` with these margins so the ported numbers mean what they mean in the source; a container gap on top of ported margins double-counts, which is the mistake slice two recorded.
- **Watch the double-count.** The page's content column carries `gap: 1.5rem` between its sections, and the ported values below carry their own margins (`.gi-card` 16px, `.gi-seclabel` 18px). Stacking both is exactly the mistake slice two recorded: consistent and wrong, landing further from the design than before the fix. Remove the container's uniform gap so the ported numbers mean what they mean in the source, then check each gap by computed value.
- **Section label** (`.gi-seclabel`): the "Group invite link" eyebrow takes `letter-spacing: .14em`, `fontWeight: 700`, `margin: 18px 2px 7px`.
- **Link row** (`.gi-linkrow`): `1.6px solid var(--hairline)`, `borderRadius: 10px`, `--surface-base` (already correct), `padding: 11px 12px`, `gap: 9px`; the URL at `--type-label`, `fontWeight: 500`, ellipsis behaviour unchanged. The globe glyph is already the handoff's.
- **Share button:** already the shared 46px teal `ShareInviteLink` from slice two. Do not touch it, and do not re-fix its `minHeight`.
- **The card** (`.gi-card`): `marginTop: 16px`, `1.7px solid var(--hairline)`, `borderRadius: 14px`, the standard dark shadow, `padding: 13px 17px 5px`. Rows (`.gi-row`) `padding: 9px 0 10px` with `borderTop: 1.4px solid var(--hairline)` on every row after the first, replacing the container's `gap: 1rem`. Key column: `--type-eyebrow`, `letter-spacing: .14em`, uppercase, `--text-secondary`, `fontWeight: 700`, `paddingTop: 2.5px`, **58px floor with content sizing and a ~60% ceiling** (currently a fixed `4.5rem`). Value: `--type-meta`, `--text-primary`, `fontWeight: 500` — down from the current `--type-body`.
- **Hint** (`.gi-hint`): centred, `marginTop: 9px`. **Keep it at `--type-meta`.** The stylesheet says eyebrow; the role map puts sentence-case reference text at meta, and slice two already corrected two lines in this exact direction. Recorded decision wins; flag the disagreement, do not act on it.
- **Leave button** (`.gi-leave`, inside `LeaveGroupButton`): `marginTop: auto` (the page already does this), `minHeight: 46px` (floor, not `height`), `borderRadius: 24px`, transparent background with `1.7px solid var(--hairline)` per the line-583 and line-589 overrides, `--type-label`, `fontWeight: 600`, `--text-primary`. It stays outlined and never teal. Its warm confirmation flow and copy do not change.
- **`--danger`:** replace `#f87171` with `var(--danger)` in all three founder-state components. Identical value, no visual change. `ManageMembers`'s per-row remove affordance and `ResetInviteLink` are our own design, not drawn anywhere; tidy them with tokens already on this screen and invent nothing.

---

### Task 6: The three dead-end screens

**Files:** `src/components/OrbitNoteScreen.tsx`, `src/components/DeadEndScreen.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`. **Source for the note only:** `walkthrough.css` lines 456-459 (`.ed-slip`). Everything else here is undrawn.

**The ruling that governs this task:** the screens are undrawn, so their shape stands and only spacing and values get tuned — the OrbitPause precedent. But the *note* inside `OrbitNoteScreen` is drawn, as `.ed-slip`, which is the treatment the component's own comment says it copied. So the note is a real port and the screen around it is not. Do not invent a layout, an illustration, or a state for any of these.

- **`OrbitNoteScreen`'s note**, ported to `.ed-slip`: `position: relative`, `1.6px solid var(--hairline)`, `borderRadius: 12px`, `padding: 14px 14px 12px 48px`, `--surface-raised`. The Orbit mark becomes absolutely positioned at `left: 11px, top: 12px` at 28px, so the text block runs full width beside it instead of the current stacked header row. Label (`.nlbl`): `display: block`, `--type-eyebrow`, `letter-spacing: .14em`, uppercase, `--text-secondary`, `fontWeight: 700`, `marginBottom: 3px`, copy unchanged ("A note from Orbit"). Body (`.ntxt`): `--type-meta`, `--leading-normal`, `--text-secondary` — note this is *down* from the current `--type-body`/`--text-primary`, and it is what the source says.
  - The screen keeps its centred column, its quiet underlined non-teal link out, and both callers' exact note copy and `/create` destination.
- **Delete the outer eyebrow** (owner, 21 Aug). Today the screen stacks two small uppercase labels before the reader reaches the one sentence that matters: an outer eyebrow ("Invite only" / "Invite link") and then the note's own "A note from Orbit". Worse, the outer one restates the note's opening clause, so "invite-only" appears twice inside about fifteen words on the wall, and "invite link" twice on the bad-link screen. The label inside the box stays, because it names the speaker and it is the one part of this screen the design actually drew. The outer one goes.
  - This is a deletion, not an invention, so it does not run into the nothing-invented rule above.
  - Remove the `eyebrow` prop from `OrbitNoteScreen`'s `Props` and its render, then remove the argument at both call sites: `src/components/MembersOnlyWall.tsx` and the bad-invite branch of `src/app/join/[inviteToken]/page.tsx`. Leave no orphaned prop.
  - `src/components/__tests__/OrbitNoteScreen.test.tsx` asserts the eyebrow renders, and `MembersOnlyWall.test.tsx` may too. Update both honestly: the test should now assert the eyebrow is **absent**, so it could fail if someone puts it back. Do not simply delete the assertion.
- **`DeadEndScreen`, `not-found`, `error`:** Orbit stays absent, deliberately and for the recorded reason — Orbit's presence means something is being handled for you, and Orbit did not break a mistyped URL. Tune only: the "Take me home" button on `not-found` and any equivalent in `error.tsx` take the product's pill shape (`minHeight: 52px`, `borderRadius: 28px`, `--type-body`, `fontWeight: 700`) instead of the current `0.5rem` rectangle, so no rectangular button survives anywhere in the app. Copy unchanged. Confirm `error.tsx`'s retry affordance still works after restyling; it is a client boundary.
- **Sweep:** after this task, grep the whole app for `borderRadius: "0.5rem"` on anything that is a button or a link-styled-as-a-button, and report what is left. Do not fix sites outside this slice's five screens; name them.

---

## Sequencing

Tasks 1, 2, 5 and 6 are independent. Tasks 3 and 4 touch the same file and must not run concurrently: land 3, then 4. Task 4 also touches `RosterAvatar`, so its call sites get checked there and nowhere else.

Work in place on this branch. No worktrees.
