// src/app/groups/[id]/EventCarousel.tsx
//
// The pinned card region: a single, date-ordered list mingling confirmed
// events and ideas still being gauged (card-state-grammar slice, spec
// decision 5). One card renders bare, with no carousel chrome at all: dots
// under a single card would be furniture implying something that is not
// there.
//
// Scroll-snap rather than a JS carousel: the browser already does this well,
// it degrades to a plain scroll everywhere, and it keeps the region free of
// state that would fight the server-rendered card list.
//
// FINISHED CHROME, per the visual-polish Claude Design handoff
// (round4-base.css). This stays a server component; only the rail's scroll
// tracking and its active dot need the client, so that piece is split out
// into CarouselRail and the server-rendered cards are passed through as
// children (the supported App Router pattern for a client wrapper around
// server-rendered content).

import EventCard from "./EventCard"
import IdeaCard from "./IdeaCard"
import { CarouselRail } from "./CarouselRail"
import type { RegionEntry } from "@/lib/cards/region"
import type { IdeaItem } from "@/lib/pending/derive"
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
  entries: RegionEntry<EventCardData, IdeaItem>[]
  groupId: string
  timeZone: string
  viewerHasSession: boolean
}

export default function EventCarousel({ entries, groupId, timeZone, viewerHasSession }: Props) {
  const single = entries.length === 1

  return (
    <CarouselRail cardCount={entries.length}>
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
