// src/app/events/[id]/AddToCalendarButton.tsx
//
// The event screen's own primary action (spec: teal, its own region; the
// details card keeps its teal "I'm in"). A plain anchor, deliberately not
// next/link: the target is a file the browser or a phone's calendar app
// handles, never a client-side navigation.
//
// Shape ported from walkthrough.css .ed-cal (task 3): the screen block at
// line 428 draws it outlined, but the refinement pass at line 680-681
// overrides it teal ("the single teal primary on the event screen") — the
// last definition wins, and it already matches what shipped here. `height:
// 44px` in the source becomes `minHeight` per global constraint 3 (fixed
// geometries are a floor, not a clip).

import { Calendar } from "@/components/glyphs"

export default function AddToCalendarButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/events/${eventId}/calendar.ics`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "9px",
        width: "100%",
        minHeight: "44px",
        padding: "0.75rem 1.5rem",
        backgroundColor: "var(--action)",
        color: "var(--action-ink)",
        border: "1px solid var(--action)",
        borderRadius: "24px",
        fontSize: "var(--type-label)",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      <Calendar size={16} stroke="var(--action-ink)" strokeWidth={2} />
      Add to calendar
    </a>
  )
}
