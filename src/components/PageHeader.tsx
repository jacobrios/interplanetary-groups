// src/components/PageHeader.tsx
//
// The header bar, and deliberately nothing else. It owns the bar's rules:
// breathing room, the hairline beneath it, that it does not scroll away with
// the page, and that it grows with whatever is placed inside it.
//
// "Does not scroll away" is a sticky position with its own opaque background
// (the page surface token), not just a visual claim: without the background,
// scrolling content would show through the bar rather than disappear behind it.
//
// It has no title slot, no trailing-action slot, and no opinion about what
// any screen's header contains. That boundary is the point: the alternative
// considered was one configurable header that knew every screen, and it is
// the version that would eventually have swallowed the group home's title
// chevron (spec: "the shared piece owns the bar, not the content").
//
// It owns no height either, so a one-line child header is one line tall and
// the group home's two-line header is taller, and neither pays for the other
// (CLAUDE.md: layout grows with content, never clips).

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
        borderBottom: "1px solid var(--hairline)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
        backgroundColor: "var(--surface-base)",
      }}
    >
      {children}
    </header>
  )
}
