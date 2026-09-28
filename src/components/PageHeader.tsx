// src/components/PageHeader.tsx
//
// The header bar, and deliberately nothing else. It owns the bar's rules:
// breathing room, that it does not scroll away with the page, and that it
// grows with whatever is placed inside it.
//
// It no longer owns a hairline (removed 26 Aug 2026, header-rule slice, a
// Claude Design change request folded into the email-sign-in slice's PR out
// of lane): the full-bleed border that used to close the bar off from the
// content below is gone, and the header's own bottom padding is now the
// only rule marking that boundary on the group home and event detail
// screens. The feed's own seam hairline (FeedSeam.tsx) is unaffected and
// stays; see its comment for why removing this one makes that one matter
// more, not less.
//
// "Does not scroll away" is a sticky position with its own opaque background
// (the page surface token), not just a visual claim: without the background,
// scrolling content would show through the bar rather than disappear behind it.
//
// top: var(--safe-top), not a bare 0 (task 5, fix round 1). Confirmed
// rendered at 375x812 with a simulated inset: a sticky element's "top"
// offset is measured from its scroll container's scrollport, which for
// every page that mounts this component through a document/window scroll
// (no inner overflow wrapper) is the physical top of the viewport, inset
// or not, so top: 0 slides this bar back under the status bar the moment
// it scrolls past the inset it started below. globals.css's body::before
// strip is the other half of this fix: it is what scrolling content passes
// behind, in the one frame this bar is still in transit toward its stuck
// position, rather than in front of, since a translucent status bar would
// otherwise show that transit through. The group home's own PageHeader is
// unaffected either way: it renders inside VisibleViewport, a fixed
// container with no ancestor scroll of its own, so this bar is never
// mid-transit there in the first place.
//
// It has no title slot, no trailing-action slot, and no opinion about what
// any screen's header contains. That boundary is the point: the alternative
// considered was one configurable header that knew every screen, and it is
// the version that would eventually have swallowed the group home's title
// chevron (spec: "the shared piece owns the bar, not the content").
//
// It owns no height either, so a one-line child header is one line tall and
// a header whose content wraps (a long group name) is taller, and neither
// pays for the other (CLAUDE.md: layout grows with content, never clips).
// The original example here was the group home's two-line header; that
// second line was the members subline, deleted 17 Aug 2026.

export default function PageHeader({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0.875rem 1rem",
        flexShrink: 0,
        position: "sticky",
        top: "var(--safe-top)",
        zIndex: 10,
        backgroundColor: "var(--surface-base)",
      }}
    >
      {children}
    </header>
  )
}
