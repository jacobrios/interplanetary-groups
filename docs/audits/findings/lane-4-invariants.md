# Lane 4: Does the code still obey the product's own rules? (invariant sweep)

Started 22 Aug 2026. Written as I go.

## Coverage

**Read in full**
src/app/globals.css
prisma/schema.prisma
src/app/layout.tsx
src/app/page.tsx
src/app/not-found.tsx
src/app/error.tsx
src/app/create/page.tsx
src/app/create/OnboardingWizard.tsx
src/app/create/Step1Describe.tsx
src/app/create/Step2Playback.tsx
src/app/create/Step3Share.tsx
src/app/create/StepGapAsk.tsx
src/app/create/PlaybackCard.tsx
src/app/create/OrbitPause.tsx
src/app/events/[id]/page.tsx
src/app/events/[id]/ProposalSection.tsx
src/app/events/[id]/RosterAvatar.tsx
src/app/events/[id]/AddToCalendarButton.tsx
src/app/groups/[id]/page.tsx
src/app/groups/[id]/GroupHome.tsx
src/app/groups/[id]/GroupHomeHeader.tsx
src/app/groups/[id]/MessageFeed.tsx
src/app/groups/[id]/EventCard.tsx
src/app/groups/[id]/IdeaCard.tsx
src/app/groups/[id]/EventCarousel.tsx
src/app/groups/[id]/CarouselRail.tsx
src/app/groups/[id]/FeedSeam.tsx
src/app/groups/[id]/CardRegionEmpty.tsx
src/app/groups/[id]/ChatInput.tsx
src/app/groups/[id]/OrbitDownNote.tsx
src/app/groups/[id]/GaugeChips.tsx
src/app/groups/[id]/ProposalChips.tsx
src/app/groups/[id]/GroupProposalChips.tsx
src/app/groups/[id]/info/page.tsx
src/app/groups/[id]/info/LeaveGroupButton.tsx
src/app/groups/[id]/info/ManageMembers.tsx
src/app/groups/[id]/info/ResetInviteLink.tsx
src/app/join/[inviteToken]/page.tsx
src/app/join/[inviteToken]/JoinForm.tsx
src/components/choice.tsx
src/components/RsvpControls.tsx
src/components/NeedLabel.tsx
src/components/OrbitBubble.tsx
src/components/TailedOrbitBubble.tsx
src/components/PageHeader.tsx
src/components/WizardHeader.tsx
src/components/SendCircleButton.tsx
src/components/ShareInviteLink.tsx
src/components/BackLink.tsx
src/components/Chevron.tsx
src/components/MembersOnlyWall.tsx
src/components/DeadEndScreen.tsx
src/components/OrbitNoteScreen.tsx
src/components/visually-hidden.ts
src/lib/events/format.ts
src/lib/events/ics.ts
src/lib/groups/timezone.ts
src/lib/messages/day-groups.ts
src/lib/orbit/announce.ts
src/lib/orbit/unavailable-copy.ts
src/lib/orbit/change-plan.ts
src/lib/auth/membership.ts
src/lib/gauges/open-ask.ts
src/app/actions/detect-intent.ts
src/app/actions/extract-group.ts
docs/build-notes.md, "Where Orbit decides to speak or stay quiet" (lines 200-280)

**Read in part, targeted at a specific invariant**
src/components/OrbitMark.tsx (colour constants and the accessible-name props)
src/components/glyphs.tsx (the shared glyph prop shape and flexShrink rule)
src/lib/orbit/spark-copy.ts (chipLabels, buildTallyLine, planAnswerGauge, gaugeClosesAt)
src/lib/orbit/change-copy.ts (chip labels and the group-proposal question)
src/lib/orbit/playback.ts (formatRhythmRow, formatDays, formatGapRhythmRow)
src/lib/orbit/gap.ts (readClarifyingQuestion, validateQuestion, resolveGapQuestion)
src/lib/orbit/normalize.ts (exported surface only)
src/lib/events/roster.ts (deriveRoster contract, formatCounts)
src/app/actions/merge-gap.ts (the raw-versus-normalized path)
src/lib/events/upcoming*.ts, src/lib/proposals/*, src/lib/gauges/* (grep sweeps for Date construction and stored counts, not full reads)

**Assigned but NOT read in full, and why**
The `__tests__` directories under `src/` (roughly 90 files). My lane is whether the shipped code obeys the product's rules; I ran the suite instead (935 passing) and read individual tests only where a claim needed checking.
`src/app/api/cron/orbit/route.ts`, `src/app/actions/*` other than detect-intent / extract-group / merge-gap, and the `src/lib/proposals`, `src/lib/gauges`, `src/lib/events` implementation bodies: these are lanes 2 and 3's ground. I grepped all of them for the invariants I own (date construction without a timezone, stored counts, a third RSVP state, email rendering, raw-model reads) and read only what those greps surfaced.
`src/proxy.ts`, `src/lib/supabase/*`, `src/lib/prisma.ts`: no invariant on my list touches them.

**Verification commands run**
`npx tsc --noEmit` — clean, exit 0.
`npm test` — 92 files, 935 tests, all passing, 71.5s.
`npm run lint` — 15 errors, 28 warnings (see the appendix; 13 of the 15 are in `docs/design/`).


---

## Findings

### F-4-1: The "TIME CHANGE" heading on the event screen is too dim to read comfortably
- **file:line** — src/app/events/[id]/ProposalSection.tsx:33
- **consequence** — The label that tells a member what the block above the vote buttons is about is faint grey on a dark card. On a phone in daylight it is likely to read as decoration rather than a heading, so someone can tap a vote chip without registering that they are voting on moving the plan's time. This is not the registered "declined member's name at 4.4992:1" item.
- **evidence** — `color: "var(--text-faint)"` at `fontSize: "var(--type-eyebrow)"` (13px), inside a card whose background is `var(--surface-raised)`. Computed WCAG contrast of `--text-faint` (#6F7280) against `--surface-raised` (#262b37) is **2.89:1**, against a 4.5:1 floor for 13px text. The project already knows this pairing is bad: `src/app/groups/[id]/CardRegionEmpty.tsx:34` carries the comment "--text-secondary, not --text-faint... Faint on the page ground measures ~3.8:1, under the 4.5:1 floor for text this size" and deliberately avoided it. This site is worse than the one that comment rejected, because it sits on the brighter `--surface-raised`, not on the page.
- **severity** — queue
- **confidence** — certain (ratio computed from the token values in `src/app/globals.css`; not verified on a rendered screen)

### F-4-2: The front door's "Already invited?" line is below the readability floor
- **file:line** — src/app/page.tsx:163 (and the brand eyebrow at src/app/page.tsx:99)
- **consequence** — "Already invited? Open the link you were sent." is the only instruction on the front door for someone who was invited rather than starting a group. It renders at the smallest size in the product in the dimmest grey, so the people it is written for are the most likely to miss it and tap "Start your group" instead, ending up with a second empty group they never wanted. Distinct from the registered declined-name contrast item: different screen, different pairing, and this text is functional instruction rather than a status tint.
- **evidence** — `fontSize: "var(--type-eyebrow)"` (13px) with `color: "var(--text-faint)"` on `backgroundColor: "var(--surface-base)"`. #6F7280 on #15161e computes to **3.77:1**, the same ~3.8:1 figure `CardRegionEmpty.tsx:34` names as under the floor and refuses to ship.
- **severity** — queue
- **confidence** — certain (computed; not verified on a rendered screen)

### F-4-3: The gauge chips lean toward "I'm in", which the project's own teal rule says an open question must not do
- **file:line** — src/app/groups/[id]/GaugeChips.tsx:85-89 (rendered by src/components/choice.tsx:44)
- **consequence** — When Orbit asks the group about an idea, the "I'm in" answer is printed brighter than "Next time" and "Different day". The product's stated rule is that an open question carries equal weight on every answer until somebody picks one, precisely so a tally is honest. A nudge toward yes on the one control the whole three-yes threshold depends on is the kind of thing that inflates a count and produces a plan half the group did not really want.
- **evidence** — `GaugeChips.tsx` builds `{ answer: IN, label, quiet: false }` and marks the other two `quiet: true`; `choice.tsx:44` renders `color: quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)"`. CLAUDE.md's amended teal rule says the opposite in so many words: "When a control offers two or more equally valid answers, the options carry equal weight while open: **both quiet (the gauge chips)**". The parenthetical names this exact control. `GroupProposalChips.tsx:76-79` and `ProposalChips.tsx:49-52` do the same thing (YES / CONFIRM bright, KEEP / DECLINE quiet).
- **severity** — queue
- **confidence** — certain (the code is unambiguous; whether the owner wants the rule or the code to change is his call)

### F-4-4: On the group home nothing can shrink except the chat, so at large device text the conversation can be squeezed to nothing
- **file:line** — src/app/groups/[id]/page.tsx:216 (root `height: "100dvh", overflow: "hidden"`) with the card region at :246-250 (`flexShrink: 0`)
- **consequence** — The group home is locked to exactly one screen tall with everything past that edge cut off. The card region and the message box refuse to shrink, so a member using large text on their phone gives the cards all the space they need and the chat gets whatever is left, which can be nothing. Since the page cannot scroll, there is no way to get to the conversation. The card-region-height slice measured the region at 224.8px of 661 at default text; the same content at accessibility text sizes is roughly double that, plus a taller header and a taller message box.
- **evidence** — root: `height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column"`. Card region wrapper: `style={{ padding: ..., flexShrink: 0 }}`. `FeedSeam` (the chat) is the only `flex: 1, minHeight: 0` child, so it is the only thing that absorbs the deficit, down to zero. Nothing caps the card region's height. This is a different class from the registered mid-word-break item, which is about a label breaking inside a key column.
- **severity** — queue
- **confidence** — likely (mechanism read from the code; I could not render the page at enlarged text to measure where it actually breaks)

### F-4-5: Orbit's real mascot hardcodes the brand lime instead of reading the token
- **file:line** — src/components/OrbitMark.tsx:8
- **consequence** — The product's brand green is written down in two places. Changing it in the design tokens leaves Orbit's face on the old colour in all seven places Orbit appears, and nothing would flag the mismatch. Small, but this is the one colour the whole brand rests on.
- **evidence** — `const LIME = "#a4ef4e"` in `OrbitMark.tsx`, identical to `--lime: #a4ef4e` in `src/app/globals.css:22`. The other constants in that file (LIME_HI, LIME_SH, INK, BLUE, EYE, CORAL, PATH) are illustration shades with no token, which is fine; this one duplicates a token exactly. Not the registered `#f87171` item, which is a different file and a different token.
- **severity** — decline
- **confidence** — certain

### F-4-6: Orbit can go silent after asking a member a direct question, and the register that is supposed to list every such moment does not list it
- **file:line** — src/app/actions/detect-intent.ts:171 and src/app/actions/detect-intent.ts:179
- **consequence** — Orbit asks the group "What day works better?", a member answers with a day, and in two situations Orbit says nothing at all. The member has no way to tell whether Orbit heard them. This is the exact failure mode the 29 July fix was for, and the project's own list of "every place Orbit decides to speak or stay quiet" (build-notes §200) does not name either situation, so nobody would find them by reading the list. The register's own closing line says a list that looks complete and is not is worse than nothing.
- **evidence** — In the `intent.kind === "answer"` branch: `const alreadyOnCalendar = await prisma.event.findFirst({...}); if (alreadyOnCalendar) return { status: "quiet" }` (:163-171), and `const planned = planAnswerGauge(...); if (!planned) return { status: "quiet" }` (:173-179). `planAnswerGauge` (src/lib/orbit/spark-copy.ts:398) returns null "when the resolved start has already passed". The register's row for the answer class names only three gates: `findOpenRetryAsk` finding an unanswered ask, the window shutting when a same-activity gauge exists, and a 48-hour cap. Neither of these two exits appears in it. I verified the rest of the register against the code and the other rows hold, including the claim that `change-plan.ts` has no silent exits (`{ action: "quiet" }` is declared at change-plan.ts:32 and constructed nowhere in that file).
- **severity** — queue
- **confidence** — certain (the code paths and the register text; whether either silence is acceptable behavior is the owner's call, but they are undocumented either way)

### F-4-7: The founder's onboarding question is read straight off the raw model response, which the project's stated boundary forbids
- **file:line** — src/app/actions/extract-group.ts:78 (and src/app/actions/merge-gap.ts:118)
- **consequence** — The rule this project wrote down is that raw model output is a claim, and every user-facing behavior reads the normalized shape instead, never the raw response. The one clarifying question Orbit asks a founder mid-onboarding does not follow it: it is pulled directly out of the model's reply. Nothing goes wrong today, because a separate validator sits in front of it and falls back to a written template. The cost is precedent: the next person who needs something out of a model reply now has a shipped example of reading it raw, and the second time there may be no validator.
- **evidence** — `question: resolveGapQuestion(normalized.missing, readClarifyingQuestion(raw))` at extract-group.ts:78, where `raw` is the untouched return of `extractGroupProfile`. `readClarifyingQuestion` (src/lib/orbit/gap.ts:196) does `(raw as Record<string, unknown>).clarifyingQuestion`. The gate that makes it safe is `validateQuestion` (gap.ts:209), which lives in `gap.ts`, not in `normalize.ts`. CLAUDE.md names `src/lib/orbit/normalize.ts` as **the** claim-to-fact boundary, singular. Either the rule needs amending to say there are two gates (structure in `normalize.ts`, generated prose in `gap.ts`), or this path needs to route through normalize.
- **severity** — queue
- **confidence** — certain (the code path; the harm is precedent, not a live defect, and I say so deliberately)

### F-4-8: The four-surface elevation rule does not cover another member's chat bubble, so it renders with no fill at all
- **file:line** — src/app/groups/[id]/MessageFeed.tsx:275
- **consequence** — The rule lists what each of the four background shades means, and another person's message bubble is not one of them. It ends up painted the same colour as the page behind it, which is to say not painted. The chat-feed-boundary slice treated exactly this as a defect when it found the idea card in the same position and invented a fourth surface to fix it; the member bubble was not revisited. It still reads acceptably because it has a hairline outline, a distinct corner shape and a name above it, which is why the honest recommendation is to leave it alone and fix the rule's wording instead.
- **evidence** — `backgroundColor: "var(--surface-base)"` with `border: "1px solid var(--hairline)"` on the other-member bubble. The design source agrees: `docs/design/design-polish-rd-2/walkthrough.css:566` is `.gh-human .hmsg { background: var(--surface-base); ... }`. The invariant as stated covers base (page), low (idea card), raised (confirmed card or Orbit bubble), self (viewer's own bubble); no entry for a member's bubble.
- **severity** — decline
- **confidence** — certain

---

## Appendix (real, but no product consequence)

- **`--surface-self` does double duty.** src/components/choice.tsx:38 uses `var(--surface-self)` as a chosen chip's fill. The token's stated meaning is "the viewer's own bubble". Semantically it still reads as "the viewer's own answer", so nothing is wrong on screen, but the token's one-line definition no longer describes all its uses.
- **One more hardcoded colour where a token exists.** src/app/create/Step2Playback.tsx:145 sets `backgroundColor: "rgba(10,33,37,.20)"`, which is `--action-ink` (#0a2125) at 20%. Distinct from the two registered `#f87171` sites.
- **The two message composers disagree on caret colour.** src/app/groups/[id]/ChatInput.tsx:108 uses `caretColor: "var(--text-primary)"`; src/app/create/StepGapAsk.tsx:178 uses `caretColor: "var(--action)"`. They share `SendCircleButton` and otherwise read as the same control.
- **`npm run lint` exits nonzero on a clean main.** 15 errors, 28 warnings. Thirteen of the fifteen errors are inside `docs/design/**/*.jsx` design-handoff files, not product code; the two in `src/` are `OnboardingWizard.tsx:58` (the deliberate, commented timezone-detection effect) and `ResetInviteLink.tsx:71` (an unescaped apostrophe that renders correctly). Nothing here breaks the product; the point is that a lint command that is always red cannot be used as a gate. `npx tsc --noEmit` is clean and `npm test` is 935/935 passing in 71.5s.
- **The invite link's own text is truncated with an ellipsis** (src/app/groups/[id]/info/page.tsx:209-211 and src/app/create/Step3Share.tsx:114-116, `whiteSpace: nowrap` + `overflow: hidden` + `textOverflow: ellipsis`). Deliberate and harmless: the share button beside it carries the real value, and nobody transcribes a cuid by eye.

## What I could not check
- Nothing visual was rendered. Every contrast ratio above is computed from the token hex values in `src/app/globals.css` using the WCAG relative-luminance formula, not measured on a screen. The group-home squeeze in F-4-4 is read from the flex rules, not observed at an enlarged device text size; the exact text size at which the chat reaches zero height is unknown.
- The eval benches (`eval:detect`, `eval:onboarding`) were not run, per the brief, so nothing here says anything about model behavior.
- I read the register in build-notes §200 against the code paths it names. I did not audit every module for speak-or-stay-quiet decisions the register might be missing beyond the recognition and change paths named in my lane.
