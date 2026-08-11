# Joining-arc handoff, provenance

Received 11 Aug 2026 from Claude Design's "Send to local coding agent" export
(the full project bundle), trimmed to this slice's files with the owner's
approval; the full export remains in the owner's possession outside the repo.

Kept, and why:

- `README.md`, the bundle's own instructions (names `group-creation.html` as
  the primary file).
- `group-creation.html`, the primary design file: the onboarding wizard finals,
  including the step 3 share screen this slice builds. Self-contained styles;
  renders via `design-canvas.jsx`.
- `design-canvas.jsx`, the canvas machinery `group-creation.html` imports.
- `walkthrough-frames-1.jsx`, exact copies of the approved onboarding finals
  as standalone frame components (frame 04 is the share screen).
- `walkthrough.css`, the walkthrough token and class source.
- `orbit-mark.js`, Orbit's real mascot face as an SVG generator. Not used by
  this slice (the product keeps the letter-O placeholder for consistency);
  kept because the visual-polish pass will want it.
- `orbit-mascot.png`, the raster mascot `group-creation.html` references.

Precedence, per the owner (11 Aug 2026): this design work predates most build
decisions, and build-time decisions override what these files show wherever
they conflict. Known overrides as of the trim: no back chevron on step 3, the
opaque invite token instead of the friendly slug shown in the mockup, the em
dash removed from Orbit's share-step copy, and the letter-O placeholder avatar
instead of the mascot face.
