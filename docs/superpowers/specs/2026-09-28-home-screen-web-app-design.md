# The home-screen web app: not broken, and a real installable app

Designed 28 Sept 2026 on branch `home-screen-web-app`, item 3 of the owner's
27 Sept queue order, from his 28 Sept iPhone evidence (gap-ask step with the
keyboard open: a large empty band and Orbit's message pushed nearly off the
top in the home-screen version; fine in a Chrome tab). Reasoning lands in
build-notes §11 at the end of the slice.

---

## Front section

**Settled with the owner, 28 Sept 2026. Do not relitigate.**

1. **The three height-locked screens** (the gap-ask step, the group home,
   `/groups`) are sized from the phone's measured visible area, following the
   keyboard and the browser bars. Not scroll-after-focus: both versions were
   tried on his phone on 27 Sept and reverted.
2. **Installable:** name "Interplanetary Groups", icon label **"Orbit"**,
   opens at **`/`** (the session-aware front door), dark `#15161e` for the
   status bar area, launch and browser tint, status bar translucent over the
   page, composer clearing the home bar.
3. **No install hint in the product.** He suggests it in person. Queued with
   a trigger: strangers onboarding without him in the room. Cheapest form
   when it comes: one quiet text line on group info, browser-only.
4. **The email-ask sheet is untouched**; it already behaves above the
   keyboard on his phone (28 Aug).

**Non-goals.** Offline support (its own slice). Push (answered 1 Sept, no
rung). iPhone launch images per device size (only if the launch flash looks
bad on his phone, then queued). Any screen that scrolls as a whole page
beyond the top-inset change.

**Verified by.** Tests, red first: the shared viewport piece follows a
simulated keyboard resize and scroll; the manifest's fields; the layout's
viewport and home-screen metadata; the three screens mount the piece.
Deliberately untested: real on-device heights, which jsdom cannot produce.
Evidence for those is two real-iPhone passes, home-screen app and Chrome,
over the LAN, against a production build.

**Debt expected.** The fit depends on a JavaScript measurement, so the first
paint uses today's sizing until it runs. iPhone's home-screen behaviour
shifts between iOS versions with no automated guard. Every future
full-screen page must use the shared top-inset token or it will sit under
the status bar in the installed app.

---

## Baseline

2291 passing of 2291 across 183 files, zero failures, on `main` at
`bb4022b`, before anything landed on this branch. Cross-check: the
spontaneous-activities slice finished at 2291 across 183, an exact match.

---

## Tasks

Context every task needs. Next.js 16: read `node_modules/next/dist/docs/`
before writing Next-specific code (viewport export: `04-functions/
generate-viewport.md`; manifest: `03-file-conventions/01-metadata/
manifest.md`; `appleWebApp`: `generate-metadata.md` ~779-822). `viewport`
and `themeColor` inside `metadata` are deprecated; use the separate
`export const viewport`. The types for `viewportFit` and
`interactiveWidget` are in `node_modules/next/dist/lib/metadata/types/
extra-types.d.ts:52-53`. Tokens live in `src/app/globals.css`;
`--surface-base` is `#15161e`. No model calls anywhere in this slice. TDD:
every test is shown failing before the code that makes it pass.

### Task 1: `VisibleViewport`, the shared piece

Create `src/components/VisibleViewport.tsx`, a client component that
renders one `div` holding its children over exactly the visible area.

- Style: `position: fixed`, `left: 0`, `right: 0`, `top` and `height` from
  `window.visualViewport` (`offsetTop`, `height`, in px), `overflow:
  hidden`, `box-sizing: border-box`, `padding-top:
  env(safe-area-inset-top)`, plus whatever `style` the caller passes for its
  own background, flex column, and so on.
- Before the first measurement (server render and first client paint) it
  falls back to `top: 0; height: 100dvh`, which is today's behaviour, so
  nothing looks different until it measures.
- Listens to `visualViewport` `resize` and `scroll`, and window `resize` as
  a fallback where `visualViewport` is missing; removes all listeners on
  unmount. Updates through `requestAnimationFrame`, at most one pending.
- **Keyboard state:** sets a CSS custom property `--bottom-inset` on its
  root: `env(safe-area-inset-bottom)` when the keyboard is closed, `0px`
  when open. Treat the keyboard as open when `visualViewport.height` is
  more than 120px shorter than `window.innerHeight`. Why: with the keyboard
  up, the home bar is covered, so padding for it would reopen a gap above
  the keyboard.
- Header comment says why this exists and names the rejected
  scroll-into-view fix and where it was tried (build-notes, 27 Sept
  postscript to the gap-ask thread), so nobody re-adds it.

Tests (`src/components/__tests__/VisibleViewport.test.tsx`), with a fake
`window.visualViewport` (an `EventTarget` with writable `height`,
`offsetTop`): renders the 100dvh fallback when `visualViewport` is absent;
after mount, `top`/`height` match the fake; dispatching `resize` with a
smaller height (keyboard) updates height and sets `--bottom-inset: 0px`;
`scroll` with a new `offsetTop` updates `top`; unmount removes listeners.
Use fake timers or a stubbed `requestAnimationFrame`. Note jsdom history:
`EditGroupDetails.tsx:213-225` records jsdom throwing on `calc()` wrapping
`env()`; assert on the custom property's value, not on a computed calc.

### Task 2: adopt it on the three locked screens

Replace each screen's `height: 100dvh` root with `VisibleViewport`,
keeping every other style the root had.

- `src/app/create/OnboardingWizard.tsx` ~317-335: the gap-ask step today is
  a `position: fixed; inset: 0` layer holding a `100dvh` column. The
  `VisibleViewport` becomes the outer layer (background, centred flex); the
  inner column becomes `height: 100%` with the same max width. Update the
  comment above it, which currently claims 100dvh tracks the visible area.
- `src/app/groups/[id]/page.tsx` ~327-337: server component; wrap with the
  client `VisibleViewport` taking the root's styles. Children stay server
  rendered.
- `src/app/groups/page.tsx` ~70-77: same for `<main>`. The long comment
  above it explains why a definite height is needed for the list to
  scroll; `VisibleViewport` still gives a definite height, keep the
  comment true.
- Any existing test that asserts `100dvh` on these roots is updated to
  assert the piece is mounted instead (find with a grep through `git
  grep`, never a bare shell glob over bracketed route paths).

### Task 3: composers clear the home bar

- `src/app/groups/[id]/ChatInput.tsx` ~120-126: bottom padding goes from
  `4px` to `calc(4px + var(--bottom-inset, 0px))`.
- `src/app/create/StepGapAsk.tsx:267`: replace `env(safe-area-inset-bottom)`
  with `var(--bottom-inset, 0px)` so it drops to zero with the keyboard up.
- `/groups` legal footer (`YourGroupsScreen.tsx`, its footer): same
  treatment, so the links are not under the home bar.
- Tests assert the style string contains `var(--bottom-inset` on each.

### Task 4: installable

- `src/app/manifest.ts` returning `MetadataRoute.Manifest`: `name:
  SITE_TITLE`, `short_name: "Orbit"`, `description: SITE_DESCRIPTION`,
  `start_url: "/"`, `display: "standalone"`, `background_color` and
  `theme_color` `#15161e`, icons at 192 and 512 (`purpose: "any"`), and the
  180 Apple icon.
- Icons: `scripts/make-app-icons.ts` (hand-run, outside the test runner)
  renders `src/app/icon.svg` onto a `#15161e` square with the mark at 80%
  scale, using `sharp` (already in `node_modules`), writing
  `public/icon-192.png` and `public/icon-512.png`. Commit the PNGs. Check
  whether the existing `src/app/apple-icon.png` already has a dark tile; if
  it is transparent, regenerate it at 180 the same way (iOS paints a
  transparent icon on black).
- `src/app/layout.tsx`: add `export const viewport: Viewport` with
  `viewportFit: "cover"`, `themeColor: "#15161e"`, `colorScheme: "dark"`;
  add `appleWebApp: { capable: true, title: "Orbit", statusBarStyle:
  "black-translucent" }` to `metadata`.
- `src/proxy.ts`: the manifest (`/manifest.webmanifest`) passes through
  `updateSession`. Confirm it serves to a signed-out request; excluding it
  from the matcher is fine and declared if needed.
- `src/app/robots.ts` stays as is (manifest is not a page).
- Tests: the manifest function's fields; the layout's `viewport` and
  `metadata.appleWebApp` exports.

### Task 5: top inset on every screen

With `viewportFit: "cover"` and a translucent status bar, the installed app
draws under the status bar.

- `VisibleViewport` already pads its top (task 1).
- In `globals.css`, `body { padding-top: env(safe-area-inset-top); }` and a
  token `--screen-min-height: calc(100dvh - env(safe-area-inset-top))`.
- Replace `minHeight: "100dvh"` with `minHeight:
  "var(--screen-min-height)"` at the nine whole-page sites: `src/app/
  page.tsx:53`, `join/[inviteToken]/JoinForm.tsx:345`,
  `groups/[id]/info/page.tsx:121`, `signin/page.tsx:31`,
  `create/page.tsx:27`, `events/[id]/page.tsx:126`,
  `components/OrbitNoteScreen.tsx:56`, `LegalPage.tsx:50`,
  `DeadEndScreen.tsx:24`. Without this each page scrolls by the status
  bar's height in the installed app.
- `VisibleViewport` is `position: fixed`, so the body padding does not
  affect it; confirm the three screens are not double-padded.
- Sticky headers (`PageHeader`, `EditDetailsCard`, `EditGroupDetails`)
  stick at `top: 0` of their scroll container, which now starts below the
  body padding; check they do not slide under the status bar on scroll in
  a browser at 375x812 with a simulated inset (a temporary
  `--safe-top` override is acceptable for the check, not for shipping).
- Fallback if the phone pass shows trouble: `statusBarStyle: "black"`
  (opaque bar, page starts below it) is a one-line change; surface it to
  the owner rather than switching silently.

### Task 6: phone pass 1 (controller, with the owner)

Production build served on the LAN (`npm run build`, then `npm start -- -H
0.0.0.0`), never the dev server for anything involving reloads. The owner:
Chrome tab, then Share, Add to Home Screen, opened from the icon. Check the
gap-ask with keyboard open, the group home while typing, `/groups`, a
whole-page screen for the top inset, and the launch. Whether iOS installs
an `http://` LAN origin as a standalone app is unverified (not 100% sure);
if it does not, the home-screen half waits for the preview-free
production check after merge, and the PR says so. Stop the server after.

### Task 7: record

- build-notes §11 entry: decisions, evidence, debt; strike the 4 Sept "do
  not tell anyone to add it to their home screen" line with a dated
  pointer here (append-only); close the 27 Sept Chrome keyboard-overlap
  queue item only if phone pass 1 showed it closed.
- CLAUDE.md "Where the build is": one paragraph; queue amendment moving
  verbal group one to next; the install-hint queue item with its trigger.
