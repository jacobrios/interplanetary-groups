// src/app/groups/[id]/FeedSeam.tsx
//
// The boundary between the pinned card region and the chat feed, and nothing
// else. It owns two marks and has no opinion about what sits on either side:
//
//   - a full-bleed hairline where the feed begins, the same grammar that
//     already ends the header (PageHeader's borderBottom)
//   - an 18px scrim over the feed's first pixels, the composer's own scrim
//     grammar turned upside down
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
