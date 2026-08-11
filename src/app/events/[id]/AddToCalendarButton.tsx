// src/app/events/[id]/AddToCalendarButton.tsx
//
// The event screen's own primary action (spec: teal, its own region; the
// details card keeps its teal "I'm in"). A plain anchor, deliberately not
// next/link: the target is a file the browser or a phone's calendar app
// handles, never a client-side navigation.

export default function AddToCalendarButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/events/${eventId}/calendar.ics`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        minHeight: "2.75rem",
        backgroundColor: "var(--color-teal)",
        color: "#0a0a0a",
        borderRadius: "1.375rem",
        fontSize: "var(--type-label)",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      Add to calendar
    </a>
  )
}
