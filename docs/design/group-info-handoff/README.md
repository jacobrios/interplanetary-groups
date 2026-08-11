# Group-info design handoff

Pulled 10 Aug 2026 from the Claude Design project "Interplanetary Groups"
(claude.ai/design project `1e6b5a4e-ca94-4a77-9b0c-726f22fe4ace`), at the owner's
direction, as the build source for the group-info slice. This is the real handoff
(CSS and components), unlike `docs/design/walkthrough-screens/`, which holds
reference PNGs only.

## Files

- `wireframes/group-info.html` — the group-info wireframe. Self-contained page:
  base wireframe styles first, then a "DARK IDENTITY" role-override pass lower in
  the same stylesheet. **The override pass is the operative look.** Two places
  where reading only the base styles would mislead: the emblem's base style is
  neutral but the override makes it lime with dark-ink initials, and
  `.gi-sharebtn`'s base style is lime but the override moves it to teal (the
  single action color), which is also what the color rules require.
- `design-canvas.jsx` — the canvas scaffolding the wireframe imports (artboard
  chrome, drag/focus overlay). Rendering support only; nothing in it is product
  design.

To view: open `wireframes/group-info.html` in a browser (it loads React and fonts
from CDNs, so it needs network).

## Where recorded decisions override this wireframe

Per the standing rule, recorded decisions win over design artifacts. Known
differences, so they are not mistaken for build targets:

- The link pill shows a vanity URL (`join.interplanetary.app/climbing-crew`). No
  slug field exists; the product shows the real rotatable-token URL
  (`/join/{inviteToken}`), a settled data-model decision.
- The rhythm rows show hand-written copy ("Mondays & Wednesdays, mornings at 9").
  The product composes these rows deterministically via `formatRhythmRow` plus
  the ` · venue` suffix, per the structured-extract-then-format rule and the
  three-letter-weekday display rule.
- No founder powers (remove member, reset invite link), no Leave confirm step,
  and no founder/member/non-member visibility differences are drawn. Those come
  from the slice's spec, not from this artifact.
