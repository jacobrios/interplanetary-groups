# The install hint: showing people how to put Orbit on their home screen

Designed 28 Sept 2026 on branch `install-hint`, pulled forward by the owner
from the queue (trigger was "strangers onboarding without the owner in the
room"). Settled over phone-width mocks rendered from the real components on a
throwaway route, since deleted. Reasoning lands in build-notes §11 at the end
of the slice.

---

## Front section

**Settled with the owner, 28 Sept 2026. Do not relitigate.**

1. **One shared how-to sheet with three pictured steps**, cropped from the
   owner's own iPhone screenshots with nothing personal in frame, lime rings
   marking what to tap. Safari steps: Share at the bottom, View More, "Scroll
   down, tap Add to Home Screen." Chrome steps: Share in the address bar,
   then the same two. Stills, not a GIF.
2. **Shown only on iPhone Safari and iPhone Chrome, never inside the
   installed app.** Android, laptops, iPad and other iPhone browsers see
   nothing.
3. **Founders:** a quiet underlined line, "Use Orbit like an app", at the
   bottom of onboarding step 3, opening the sheet.
4. **Members:** the sheet itself opens once on the group home ("Use Orbit
   like an app?", "Not now"), once per phone, never over the email ask. Any
   way out ends it for good.
   *(Amended 29 Sept 2026, the owner's phone QA of PR #147: the full steps
   sheet on arrival was too much. Arrival now shows a small sheet sized to
   its content, "Use Orbit like an app?" / "Add it as an icon to your home
   screen." with Orbit's face and equal-weight "Show me" / "Not now"; "Show
   me" opens the steps sheet. The steps sheet drops its title for "Follow the
   3 steps below to add its icon.", frames each picture so none reads as a
   button, circles the ⊕ on step 3, and recrops steps 2 and 3 inside their
   rows. Task 4.)*
5. **Group info:** a new "ON YOUR PHONE" section below the card with the same
   link; the card gains an "ABOUT THE GROUP" title; the email row puts
   "Change email" on the left and the address on the right, one row.
6. **Never on the join screen**: installing before joining gives an app that
   opens signed out.

**Non-goals.** Android's one-tap install (its own slice if the group has
Android users). A GIF or video. Any Orbit chat message about it (would repeat
per join). A line in the digest email (later, as a second nudge).

**Verified by.** Tests, red first: browser detection from real user-agent
strings, installed-app hiding, nothing rendered before mount, the sheet's two
step sets, the group home sheet's once-per-phone rule and its email-ask and
founder exclusions, group info's new order. Deliberately untested: real
phone fit and real install behaviour, which jsdom cannot produce; evidence
for those is the owner's iPhone over the LAN against a production build.

**Debt expected.** The pictures go stale when Apple redesigns the Share
menu, and nothing will say so. "Seen" is per phone and clears with site
data. iPad and other iPhone browsers get no hint. The two touches to shipped
screens (email row, card title) ride this PR, declared.

---

## Baseline

2347 passing of 2347 across 189 files, zero failures, on `main` at
`981a78e`, before anything landed on this branch. Cross-check: the
home-screen web app slice finished at 2340 across 188; PR #146 then added
one file (`inventory-scan.test.ts`) and seven tests, an exact match. Noted,
not carried: `OnboardingWizard.test.tsx` failed once under a full run on 28
Sept and passed 3 of 3 alone; queued as its own task, untouched here.

---

## Tasks

Context every task needs. Next.js 16: read `node_modules/next/dist/docs/`
before any Next-specific code. Tokens live in `src/app/globals.css` (map by
value, never by name). No model calls. TDD: every test is shown failing
before the code that makes it pass. Orbit's copy rules: no em dashes, plain
words. Colour rules: the rings are `--lime` (Orbit pointing), nothing in this
slice is teal, the sheet's single button is outlined. Every new file must
stay out of any code path that reads an email address (the privacy guard in
`src/app/__tests__/no-email-address-on-screen.test.tsx`).

### Task 1: detection, the pictures, and the shared sheet

**1a. Detection** (`src/lib/install-hint/platform.ts`, pure, no DOM access
inside the classifier). `installHintBrowser(userAgent: string,
standalone: boolean): "safari" | "chrome" | null`.

- `null` when `standalone` is true (installed app).
- `"chrome"` when the UA contains `iPhone` and `CriOS`.
- `"safari"` when the UA contains `iPhone`, contains `Safari`, and contains
  none of `CriOS`, `FxiOS`, `EdgiOS`, `OPiOS`, `GSA`.
- `null` for everything else (Android, desktop, iPad, other iPhone
  browsers, in-app browsers).
- A small client hook `useInstallHintBrowser()` returns `null` until mounted
  (so the server render and first client render match, no hydration
  mismatch), then the classifier's answer using `navigator.userAgent` and
  `window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true`.
- Tests use real UA strings for iPhone Safari, iPhone Chrome, iPhone
  Firefox, iPad Safari, Android Chrome and desktop Chrome.

**1b. The pictures.** Create `public/install-hint/` with five PNGs cropped
with macOS `sips` from the owner's screenshots at
`/private/tmp/claude-501/-Users-rivers-m1-air-code-interplanetary-groups/caa6275e-34f4-4f8b-a8c4-5f6b73b796a9/images/`
(`N.png` files; if missing, convert from `N.webp` first with
`sips -s format png N.webp --out N.png`). Each is 923pt-wide phone art.
`sips -c <height> <width> --cropOffset <y> <x> <src> --out <dest>`:

| File | Source | h | w | y | x |
|---|---|---|---|---|---|
| `safari-share.png` | 3.png | 285 | 923 | 1685 | 0 |
| `chrome-share.png` | 5.png | 140 | 923 | 1680 | 0 |
| `safari-view-more.png` | 2.png | 350 | 820 | 1610 | 60 |
| `chrome-view-more.png` | 4.png | 350 | 820 | 1610 | 60 |
| `add-to-home-screen.png` | 1.png | 150 | 848 | 1628 | 38 |

Look at every output image before committing it and confirm no contact
name, photo or personal detail is in frame (the contacts row sits above
these crops). Report each file's size; if any is over 150KB, say so rather
than silently recompressing.

**1c. `InstallHintSheet`** *(Partly superseded by Task 4, 29 Sept 2026: heading and subline removed, the arrival flow opens a small ask first, pictures framed and recropped. Task 4 wins where they differ.)* (`src/components/InstallHintSheet.tsx`, client).
Props: `browser: "safari" | "chrome"`, `heading`, `subline`,
`buttonLabel`, `onClose`. It copies `src/app/groups/[id]/EmailAskNote.tsx`'s
modal precedent, which is this product's only other modal and whose header
documents it: fixed scrim `rgba(8,9,13,.70)` covering the viewport with
`zIndex: 40`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on
the heading, focus moved to the sheet on open and restored on close
(`EmailAskNote.tsx` ~426-447), body scroll lock with the previous value
restored, Escape and scrim tap both call `onClose`, focus trap
(~451-485). Sheet: `--surface-low`, top hairline, radius `22px 22px 0 0`,
shadow `0 -20px 44px rgba(0,0,0,.48)`, grab bar 38x4 `--hairline`,
`maxHeight: 100%`. Content pad `10px 18px 18px`, plus the home-bar inset
the email sheet uses (`email-ask-safe-bottom`'s approach). Heading at
`--type-heading` weight 700; subline `--type-meta` `--text-secondary`.

Steps: each is a row of a 24px numbered circle (`--surface-raised`,
hairline border, `--type-meta` 700) and the step text at `--type-body`,
**in a flex row so wrapped text aligns under the text, never under the
number** (owner's explicit ask), key words bold. Under each, the picture in
a hairline-bordered, radius-12, overflow-hidden box, `alt` describing the
control ("Safari's toolbar with the Share button circled", etc.), with an
absolutely positioned 3px `--lime` ring:

| Picture | Ring |
|---|---|
| safari-share | circle, centre 47% / 73%, diameter 12% of width |
| chrome-share | circle, centre 91.5% / 50%, diameter 11% |
| both view-more | circle, centre 85.6% / 27%, diameter 20% |
| add-to-home-screen | rounded rect, left/right 1%, top 6%, height 88% |

Step copy. Safari: "Tap the **Share** button at the bottom." / "Tap **View
More**." / "Scroll down, tap **Add to Home Screen**." Chrome: "Tap the
**Share** button in the address bar." / then the same two. Step gaps 12px.

The button (`buttonLabel`) is a full-width outlined pill, `minHeight: 48`,
radius 26, `1.6px solid var(--hairline)`, `--type-body` 700, **pinned to the
bottom of the sheet** with the steps scrolling above it, so it is always on
screen when the sheet is taller than the phone (larger text, small phones).
Measured in the mock: 614pt tall on a 661pt screen at default text size.

Tests: Safari and Chrome step sets and pictures; Escape, scrim tap and the
button all call `onClose`; dialog semantics; focus moves in and returns.

### Task 2: the two quiet links (step 3 and group info) plus group info's reorder

**2a. `InstallHintLink`** *(Partly superseded by Task 4, 29 Sept 2026: heading and subline removed, the arrival flow opens a small ask first, pictures framed and recropped. Task 4 wins where they differ.)* (`src/components/InstallHintLink.tsx`, client):
renders nothing until mounted and nothing when `useInstallHintBrowser()` is
`null`; otherwise an underlined text button "Use Orbit like an app" at
`--type-meta`, `--text-secondary`, no background or border, `minHeight:
44px` tap target, opening `InstallHintSheet` with heading "Put Orbit on
your home screen", subline "It opens like an app, full screen, one tap
away.", button "Got it". Accepts an optional `renderWrapper` or equivalent
so group info can hide its heading along with the link (see 2c); keep that
simple, e.g. a `children` render prop or an `eyebrow` prop.

**2b. Onboarding step 3** (`src/app/create/Step3Share.tsx`): the link,
centred, below "You can invite people now or anytime later", `marginTop:
1.25rem`. Nothing else on the screen changes.

**2c. Group info** (`src/app/groups/[id]/info/page.tsx`), final order:
invite link section, email section, **"ABOUT THE GROUP" eyebrow** above the
card (same eyebrow style as "Email for sign-in and reminders", same 7px gap
to what follows; the mock's gap read loose, match the email heading's), the
card, **"ON YOUR PHONE" eyebrow plus the link** (hidden together when the
link would render nothing, so no orphan heading), then Leave (members) and
the footer. For a founder the phone section sits under "Edit group
details". It shows for founders and members alike.

**2d. Email row** (`src/app/groups/[id]/info/EmailStatusRow.tsx`), attached
state only: one flex row, `justifyContent: space-between`, `flexWrap: wrap`,
**"Change email" on the left, the address on the right** (owner's explicit
call, made after seeing both arrangements), address `overflowWrap:
anywhere`. The unattached "Add your email" pill and the expanded flow are
untouched. Update `EmailStatusRow.test.tsx` only where it asserted the old
stacked order.

Tests: link hidden before mount, in the installed app and on Android;
shown and opens the Safari sheet on iPhone Safari; step 3 renders it; group
info order (heading hidden with the link); email row order. Update the
inventory tests (`token-contrast.test.ts`, `screen-min-height.test.ts`) only
if they now list a new file, and say which in the report.

### Task 3: the one-time sheet on the group home *(Partly superseded by Task 4, 29 Sept 2026: heading and subline removed, the arrival flow opens a small ask first, pictures framed and recropped. Task 4 wins where they differ.)*

**`InstallHintOnArrival`** (`src/app/groups/[id]/InstallHintOnArrival.tsx`,
client), mounted from `GroupHome.tsx` beside `EmailAskNote`. It opens
`InstallHintSheet` with heading "Use Orbit like an app?", subline "Put it on
your home screen. It opens full screen, one tap away.", button "Not now",
only when all hold, checked once after mount:

- `useInstallHintBrowser()` is not `null`;
- the viewer is **not this group's founder** (founders met the line on step
  3; pass a boolean prop from `page.tsx`, which already has the group row);
- the email ask is **not** being offered on this render (`emailAsk` prop is
  `null`); if it is, do nothing this visit;
- `localStorage["orbit.installHintShown"]` is not set.

When it opens, **write the flag immediately**, so every exit (button, scrim,
Escape, navigating away) ends it for good; closing writes nothing more. If
reading or writing `localStorage` throws, do not show it (fail toward
silence: this is a nudge). It must not flicker or reopen when `LiveRefresh`
re-renders the page every 10s: decide once, hold the decision in state.
`DeployWatch` already stays its hand while a `[role="dialog"]` is open, so
no wiring there; confirm that in the report.

Tests: shows once and sets the flag; not when the flag is set, when the
email ask is offered, for the founder, in the installed app, on Android, or
when storage throws; survives a re-render without reopening.

---

### Task 4: the small arrival sheet and the steps sheet's redesign (added 29 Sept 2026)

Owner-approved over mocks at 390x661 rendered over a real group home.

**4a. `InstallHintAsk`** (`src/components/InstallHintAsk.tsx`, client), a
bottom sheet sized to its content (no min-height), same modal mechanics as
`InstallHintSheet` (scrim, `role="dialog"`, `aria-modal`, focus in and back,
Escape, scrim tap, focus trap, body scroll lock), scrim lighter at
`rgba(8,9,13,.45)` so the group stays readable behind it. Sheet chrome as
`InstallHintSheet` (`--surface-low`, top hairline, radius `22px 22px 0 0`,
shadow, 38x4 grab bar). Content pad `12px 18px`, plus the home-bar inset via
`email-ask-safe-bottom`. A row: `OrbitMark` size 36 (label null) then a text
column: heading "Use Orbit like an app?" at `--type-heading` 700
`--leading-tight`; subline "Add it as an icon to your home screen." at
`--type-meta` `--text-secondary`, 4px above. Below, 16px gap, two buttons
side by side, gap 10, each `flex: 1 1 0`, `minHeight: 48`, radius 26,
`1.6px solid var(--hairline)`, transparent, `--type-body` 700, labels "Show
me" and "Not now", equal weight (an open question never leans; neither is
teal). Props: `onShowMe`, `onClose`. Escape and scrim tap call `onClose`.

**4b. `InstallHintOnArrival`** opens `InstallHintAsk` instead of the steps
sheet. "Show me" swaps to `InstallHintSheet` (the steps sheet with its
"Got it" button); "Not now", Escape, scrim tap and "Got it" all end it. The
flag, the once-per-phone rule, the founder and email-ask exclusions and the
decide-once latch are unchanged (the flag is still written when the small
sheet opens).

**4c. `InstallHintSheet`** loses `heading` and `subline`. In their place, one
lead line "Follow the 3 steps below to add its icon." as the dialog's
labelled heading, `1.125rem`, weight 700, `--leading-tight`, margin
`2px 0 16px`; it must fit one row at 390pt (it does at 1.125rem, measured).
If 1.125rem is not an existing token, say so in the report and use the
literal with a comment; do not add a token. Each picture sits in a frame:
an outer box with `marginTop: 8`, `marginLeft: 36` (under the step text,
not the number), `padding: 8`, `backgroundColor: var(--surface-base)`,
`borderRadius: 14`; the picture box inside keeps its hairline border,
radius 10. Button area gains `borderTop: 1px solid var(--hairline)`,
`marginTop: 4`, `paddingTop: 20`. `InstallHintLink` passes only
`browser`, `buttonLabel="Got it"`, `onClose`.

**4d. Pictures**, recropped with `sips` from the same source folder as 1b:

| File | Source | h | w | y | x | Ring |
|---|---|---|---|---|---|---|
| `add-to-home-screen.png` | 1.png | 95 | 790 | 1650 | 56 | circle, centre 7.85% / 55%, diameter 10.5% |

and recrop both `*-view-more.png` so no rounded corner of the Share menu
shows at the bottom-right (the current crops end at y 1960 and x 880; trim
the bottom and right edges until the corner is gone, keep the View More
button and its label whole), then recompute the View More ring so it still
centres on the button. Update each picture's `ratio`. Look at every output
image and confirm no corner remnant and nothing personal.

Tests, red first: the small sheet's copy, equal buttons, Escape and scrim;
"Show me" opens the steps sheet; the steps sheet shows the lead line and no
old heading or subline; the arrival flow's existing rules still hold.

### Task 5: a closing line after "Not now" (added 29 Sept 2026)

Owner-approved copy and layout. In `InstallHintAsk`, tapping **"Not now"**
no longer closes the sheet; it swaps the sheet's content (same sheet, same
chrome, Orbit's face kept) to a closing note, and only its **"Got it"**
button closes it. Escape and the scrim still close the sheet directly from
either state, with no note (a free exit stays free). "Show me" is unchanged.

Closing note, exactly:
- Line: "No problem. You can find the steps anytime:" at `--type-body`,
  `--text-primary`.
- Then two numbered rows, each a 24px numbered circle identical to the steps
  sheet's (surface-raised, hairline border, `--type-meta` 700) and text at
  `--type-meta` `--text-primary`, gap 12, rows 8px apart, wrapped text
  aligned under the text, never under the number:
  1. "Tap the group's name at the top of the screen"
  2. "Look under “On your phone”" (curly quotes as written)
- Then one full-width outlined button "Got it" (`minHeight: 48`, radius 26,
  `1.6px solid var(--hairline)`, `--type-body` 700), 16px above.
- The dialog's accessible name follows the visible heading of each state.

Nothing about when the ask appears changes: the flag is still written when
the ask opens, so the note is shown at most once. Tests, red first: Not now
shows the note and does not close; Got it closes; Escape and scrim close
from both states without the note; Show me unchanged; exactly one dialog
throughout.

## Finish (controller, after review)

- Whole-branch review by an independent read-only agent; its report goes in
  the PR body.
- Full suite, `npm run build`, and a production build over the LAN
  (`ipconfig getifaddr en0`, read fresh) for the owner's phone pass: step 3
  line and sheet in Safari and Chrome, fit at his screen height, the group
  home sheet once as a member of a staged group, gone in the installed app.
- Record: build-notes §11 entry, CLAUDE.md current state, strike the queued
  install-hint item in the 28 Sept queue amendment. Stop the dev server.
