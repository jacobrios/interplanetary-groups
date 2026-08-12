# Visual-polish slice one: foundations plus the group home (spec, 11 Aug 2026)

The slice that locks the product's visual language. Foundations (the real dark palette, Geist,
Orbit's real mark) plus the group home dressed to the approved round-two handoff: carousel chrome,
the separated-and-washed pending strip, bubble and chip fidelity, the designed header subline, day
dividers, tabular numerals, and the grounded composer.

**Sources, in order of authority:** the strip-placement decision record
(`docs/superpowers/specs/2026-08-11-strip-placement-call-decision.md`, owner-ruled, do not
relitigate) governs what was decided; `docs/design/design-polish-rd-2/` is the sole build source
for how it looks (README sets load order `walkthrough.css` → `pending-surface.css` →
`round4-base.css`; `round4-base.css` overrides `.gh-dots`, the `.peek` geometry, and `.pd-strip`
via `.pd-sep`; `finish-layer.css` is declined and never loaded; `tint-b` is never built).
Recorded decisions win over any walkthrough screen.

## Settled decisions (do not relitigate)

Everything in the strip-placement decision record, plus these, settled at planning:

- **The app adopts the design system's palette wholesale, names and values.** The shipped tokens
  in `globals.css` are self-described placeholders ("values are functional placeholders; the
  pixel-level visual pass is a deferred phase") and match neither the handoff nor the walkthrough.
  The owner approved the round-two boards by eye rendered in the walkthrough palette
  (`--surface-base #15161e`, `--action #18bccb`, `--lime #a4ef4e`, and the rest), so shipping any
  other values would un-approve the design. Token names follow the handoff vocabulary so slices
  two and three port values without a translation table; the pending-surface slice already had to
  document an ad-hoc mapping, which is this debt surfacing once already.
- **Geist is the product's typeface, one family for everything.** The handoff boards render in
  Hanken Grotesk (display) and Inter (UI), which are prototype fonts never loaded by the app; the
  recorded decision (feel-pass register, and the slice scope as given) says Geist. Weights and
  sizes port from the CSS; the family does not. Flagged as an open question for the owner in the
  PR, built as Geist unless overruled.
- **Dark is the actual default, not a media-query branch.** The `prefers-color-scheme` fork and
  the white `:root` scaffolding go; `color-scheme: dark` is declared so form controls and
  scrollbars follow.
- **Orbit's mark ships as one shared component replacing all seven letter-"O" copies**, ported
  from the bundle's `orbit-mark.js` (lime planet, moon on an orbit path). Sizing per slot follows
  the reference HTML. The mark's own art carries blue and coral; that is brand art inside the
  mark, not new meaning-bearing UI color, and lime stays never-an-action.
- **The feed gains its day dividers** (centered uppercase eyebrow, per `.gh-day`), grouped by the
  group's timezone, never the viewer's. The handoff draws only "Today"; the composed labels for
  older days are "Today" / "Yesterday" / three-letter-weekday plus date, per the existing
  weekday-abbreviation rule. Copy choice named in the PR.
- **No animation anywhere in this round**, including removing the two existing micro-transitions
  on the group home (optimistic-message opacity, send-arrow color); states still change, they
  just change instantly.
- **The group home header name moves to `--type-heading`** (CLAUDE.md's role mapping already says
  home header at heading; the shipped body-size header was the deviation), and gains the designed
  subline "N members · group info & invite link" with a real derived member count.

## Not in this slice (each with its home)

- The front door's item-01 build: slice three (remaining screens), where every non-group-home
  screen gets its pass. Its decisions are settled; only the build waits.
- The onboarding wizard's polish, the gap-step bubble fix, the multi-day "&" join, and the
  OrbitPause treatment (never drawn; needs a ruling): slice two.
- The wall (`OrbitNoteScreen`), dead-end screens, group-info founder states, event detail,
  add-to-calendar glyph and the teal hover/focus idiom, and the real-phone Safari pass (including
  the chip-wrap call): slice three.
- The pending panel's internals: explicitly out of the handoff ("as previously drawn and
  unchanged here").
- The carousel's optional tap-a-dot-to-jump: dots stay non-interactive chrome; swipe is the
  interaction. Revisit only if the owner asks.
- RosterAvatar's celestial-doodle successor, the email arc, and everything in §8: unchanged homes.

## Verification (written before any code)

- Suite baseline recorded before code: 73 files, 778 tests, all green (build-notes §11 slice-start
  entry). Before/after numbers in the PR.
- Logic added by this slice is TDD'd: the day-divider grouping (timezone cases), the snapped-index
  derivation for the carousel dots, the OrbitMark component's render and accessibility contract,
  the header subline's count copy. Style-value ports have no unit-test seam; their evidence is the
  rendered comparison, stated as such.
- Rendered verification: the dev server's group home side by side with the rendered
  `round4-design-reference.html` board, screenshots in the PR. No "matches the design" claim
  without that comparison.
- The QA script includes the owner re-judging the dressed strip against the original complaint:
  "does it now read as its own element?" (deferred proof point from the decision record).
- Existing aria contracts hold: `aria-label="Orbit"` on marks, `aria-label="Home"` on the header
  home button (test-load-bearing).

## Debt this slice expects to open

- Every screen outside the group home renders in the new palette and typeface before its own
  polish slice: a deliberate interim mixed-fidelity state, resolved by slices two and three.
- The hard-coded `#f87171` error-line color stays untokenized (out of the handoff's scope; rides
  whichever slice next touches those components).
- The teal hover/focus idiom stays unsettled (register item, slice three).
- `--font-geist-mono` stays loaded-and-unused; removing it is a one-line cleanup for whichever
  slice next touches `layout.tsx`.
