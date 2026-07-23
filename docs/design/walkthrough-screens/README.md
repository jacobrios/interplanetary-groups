# Walkthrough screens (reference only)

Cropped exports from the Claude Design gallery, two screens per file. Exported 22 July 2026.

**Not a build source.** They carry no assets and no design tokens, so an agent building from them will silently substitute placeholders and approximate spacing. Per build-notes §9, visual code is built from Claude Design's "Send to local coding agent" handoff, which transfers the real CSS, frame components, and assets.

**Not authoritative on product decisions.** These were drawn during the visual-language phase and the build has moved past them in places, deliberately. Some screens also display data the product had no way to collect when they were drawn. Where a screen and a recorded decision disagree, CLAUDE.md and build-notes win. Deviations are recorded in build-notes §11, slice by slice.

What they are for: the describe-back checkpoint before an agent writes visual code, and human verification of a "matches the design" claim against a rendered screen. A difference from these screens is a question to raise, not a defect to fix.

The live Claude Design gallery is the source of truth for the design itself. If a screen changed there and not here, these are stale.

**One sibling file is different: `../orbit-suggestion-chips-spec.html` is a real build source.** It is a standalone spec sheet for Orbit's suggestion chips, and unlike these crops it carries actual CSS and its own token values, so visual code may be built from it. It exists because screen 07's chip row is clipped by the fixed phone frame.
