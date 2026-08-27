// src/app/groups/[id]/FeedSeam.tsx
//
// The boundary between the pinned card region and the chat feed, and nothing
// else. It owns two marks and has no opinion about what sits on either side:
//
//   - a full-bleed hairline where the feed begins
//   - an 18px scrim over the feed's first pixels, the composer's own scrim
//     grammar turned upside down
//
// Amended 26 Aug 2026 (header-rule slice): this hairline used to be
// described as sharing its grammar with the header's own bottom border
// (PageHeader's borderBottom). That border is gone. This hairline stays
// exactly as it was; the cross-reference is what's stale. With the header
// rule removed, this seam is now the only rule left on the screen marking
// where the card region ends and the feed begins, which is a stronger
// reason for it to exist, not a weaker one.
//
// Why it exists as a piece rather than three properties on the page: the page
// is server-rendered and cannot be unit tested, and the scrim carries a real
// failure mode. It sits on top of the feed's top edge, which after a scroll is
// exactly where the topmost gauge chip sits. An overlay that accepts pointer
// events makes that chip untappable while the screen still looks correct.
//
// The scrim is a SIBLING of the scroll region, not a child. Absolute
// positioning inside a scrolling element resolves against the content box, so
// a scrim placed inside the feed would scroll away with the messages, which is
// the opposite of marking a fixed edge. (Round 7 handoff, direction A, firm
// seam: "an overlay on the scroll region, not content.")

export default function FeedSeam({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div
        data-seam-scrim
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "18px",
          background: "linear-gradient(180deg, rgba(0,0,0,.32), rgba(0,0,0,0))",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {children}
    </div>
  )
}
