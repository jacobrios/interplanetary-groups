// src/app/groups/[id]/EventCarousel.tsx
//
// The pinned card region when a group has more than one upcoming event, which
// is exactly the condition the group-home slice deferred this for: a sparked
// event sitting beside the standing one.
//
// One card renders bare, with no carousel chrome at all: dots under a single
// card would be furniture implying something that is not there.
//
// Scroll-snap rather than a JS carousel: the browser already does this well,
// it degrades to a plain scroll everywhere, and it keeps the region free of
// state that would fight the server-rendered card list.
//
// INTERIM CHROME, agreed 24 July 2026. There is no Claude Design handoff for
// the carousel (docs/design holds reference PNGs only, and its own README says
// they are not a build source). Screen 08's dots carry an active state showing
// which card you are on; these do not, because that needs client-side scroll
// tracking in a region that is otherwise fully server-rendered. Recorded as a
// known question in build-notes §8, not a defect. No new colors, no animation,
// no new tokens.

import EventCard from "./EventCard"
import { RsvpStatus } from "@prisma/client"

export interface EventCardData {
  event: {
    id: string
    title: string
    startsAt: Date
    endsAt: Date | null
    venues: { displayLabel: string | null; name: string }[]
  }
  inCount: number
  outCount: number
  pendingCount: number
  viewerStatus: RsvpStatus | null
}

interface Props {
  events: EventCardData[]
  groupId: string
  timeZone: string
  viewerHasSession: boolean
}

export default function EventCarousel({ events, groupId, timeZone, viewerHasSession }: Props) {
  const single = events.length === 1

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.625rem",
          overflowX: single ? "visible" : "auto",
          scrollSnapType: "x mandatory",
          // The card region grows with its content; never a fixed height.
          scrollbarWidth: "none",
        }}
      >
        {events.map((data) => (
          <div
            key={data.event.id}
            style={{
              // A peek of the next card is what tells people to swipe. One
              // card takes the full width, because there is nothing to peek at.
              flex: single ? "1 0 100%" : "0 0 92%",
              scrollSnapAlign: "start",
            }}
          >
            <EventCard
              event={data.event}
              groupId={groupId}
              timeZone={timeZone}
              inCount={data.inCount}
              outCount={data.outCount}
              pendingCount={data.pendingCount}
              viewerStatus={data.viewerStatus}
              viewerHasSession={viewerHasSession}
            />
          </div>
        ))}
      </div>

      {!single && (
        <div
          aria-hidden="true"
          style={{ display: "flex", justifyContent: "center", gap: "0.375rem", paddingTop: "0.5rem" }}
        >
          {events.map((data) => (
            <i
              key={data.event.id}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: "var(--text-placeholder)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
