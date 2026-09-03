// src/app/groups/[id]/EventCarousel.tsx
//
// The pinned card region: a single, date-ordered list mingling confirmed
// events and ideas still being gauged (card-state-grammar slice, spec
// decision 5). One card renders bare, with no scroll or snap at all: there
// is nothing to swipe to.
//
// Scroll-snap rather than a JS carousel: the browser already does this well,
// it degrades to a plain scroll everywhere, and it keeps the region free of
// state that would fight the server-rendered card list.
//
// Peek geometry per the visual-polish Claude Design handoff
// (round4-base.css); the handoff's dot row was deleted 17 Aug 2026, since
// the peek already says there is more and a row costs chat height. This
// stays a server component, with the rail split out into CarouselRail and
// the server-rendered cards passed through as children (the supported App
// Router pattern for a client wrapper around server-rendered content).

import EventCard from "./EventCard"
import IdeaCard from "./IdeaCard"
import { CarouselRail } from "./CarouselRail"
import type { RegionEntry } from "@/lib/cards/region"
import type { IdeaItem } from "@/lib/pending/derive"
import { RsvpStatus, EventStatus } from "@prisma/client"

export interface EventCardData {
  event: {
    id: string
    title: string
    startsAt: Date
    endsAt: Date | null
    status: EventStatus
    venues: { displayLabel: string | null; name: string }[]
  }
  inCount: number
  outCount: number
  pendingCount: number
  viewerStatus: RsvpStatus | null
}

interface Props {
  entries: RegionEntry<EventCardData, IdeaItem>[]
  groupId: string
  timeZone: string
  viewerHasSession: boolean
}

export default function EventCarousel({ entries, groupId, timeZone, viewerHasSession }: Props) {
  // One fact, derived once and handed both to the rail and to each card's
  // width: is there a second card to peek at. (It used to be two predicates
  // off the same source, `single` here and `cardCount > 1` inside the rail.)
  const single = entries.length === 1

  return (
    <CarouselRail peek={!single}>
      {entries.map((entry) => (
        <div
          key={entry.kind === "event" ? entry.data.event.id : entry.item.key}
          style={{
            // A peek of the next card is what tells people to swipe. One
            // card takes the full width, because there is nothing to peek at.
            flex: single ? "1 0 100%" : "0 0 calc(100% - 16px)",
            minWidth: 0,
            scrollSnapAlign: "start",
          }}
        >
          {entry.kind === "event" ? (
            <EventCard
              event={entry.data.event}
              groupId={groupId}
              timeZone={timeZone}
              inCount={entry.data.inCount}
              outCount={entry.data.outCount}
              pendingCount={entry.data.pendingCount}
              viewerStatus={entry.data.viewerStatus}
              viewerHasSession={viewerHasSession}
            />
          ) : (
            <IdeaCard item={entry.item} />
          )}
        </div>
      ))}
    </CarouselRail>
  )
}
