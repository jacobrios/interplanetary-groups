// src/lib/orbit/reconcile.ts
//
// Central reconciliation engine for Orbit's scheduled-event slice.
// Queries all groups, checks whether each one needs a new upcoming event,
// and creates exactly one Event + one ORBIT announcement per qualifying group.
//
// Tech debt flags (per task brief + build-notes §11):
//
// 1. App-level null filter: `prisma.group.findMany()` loads all groups and
//    filters `recurringActivities` in JS (parseRhythm returns null for
//    groups that have none). A Prisma JSON `where` filter for "not null array"
//    is fragile across drivers/versions. Fine at MVP group counts; revisit if
//    group count grows large.
//
// 2. Event + announcement are NOT in one transaction: a crash between
//    createEvent and createMessage leaves an event with no announcement.
//    The upcoming-event guard (findSoonestUpcomingEvent) means reconcile
//    will skip that group on retry, so the orphaned event is permanent
//    without manual intervention. Low risk at once-per-day cadence.

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { parseRhythm } from "./rhythm"
import { computeNextOccurrence } from "./occurrence"
import { buildAnnouncement } from "./announce"
import { createEvent } from "@/lib/events/create"
import { createMessage } from "@/lib/messages/create"
import { findSoonestUpcomingEvent } from "@/lib/events/upcoming"

export type ReconcileResult =
  | { groupId: string; status: "created"; eventId: string }
  | { groupId: string; status: "skipped"; reason: "no_rhythm" | "upcoming_exists" | "duplicate" }

/**
 * Reconcile scheduled events across all groups.
 *
 * For each group that has a valid rhythm and no upcoming event, creates one
 * Event and one ORBIT feed announcement.  Groups without a rhythm or that
 * already have an upcoming event are skipped.
 *
 * Groups are processed sequentially (not Promise.all) to avoid subtle timing
 * races in the upcoming-event guard during integration tests and low-volume
 * production runs.
 *
 * @param now  The reference instant.  Passed explicitly so callers (cron
 *             handler, tests) control the clock without mocking Date.now().
 */
export async function reconcileScheduledEvents(now: Date): Promise<ReconcileResult[]> {
  const groups = await prisma.group.findMany()
  const results: ReconcileResult[] = []

  for (const group of groups) {
    const { id: groupId, recurringActivities, timeZone } = group

    // Step a: parse rhythm — skip if missing or invalid
    const rhythm = parseRhythm(recurringActivities)
    if (!rhythm) {
      results.push({ groupId, status: "skipped", reason: "no_rhythm" })
      continue
    }

    // Step b: skip if an upcoming event already exists (idempotency guard)
    const upcoming = await findSoonestUpcomingEvent(groupId)
    if (upcoming) {
      results.push({ groupId, status: "skipped", reason: "upcoming_exists" })
      continue
    }

    // Step c: compute the next occurrence of this rhythm after `now`
    const startsAt = computeNextOccurrence(rhythm, timeZone ?? "UTC", now)

    // Step d+e: create the event and the announcement
    // P2002 guard: if a concurrent run snuck in a duplicate, catch and skip.
    try {
      const event = await createEvent({
        groupId,
        title: rhythm.title,
        startsAt,
        activityLabel: rhythm.activity,
      })

      // Step e: announce in the group feed
      await createMessage({
        groupId,
        authorType: MessageAuthor.ORBIT,
        authorId: null,
        body: buildAnnouncement(event, rhythm),
      })

      // Step f: record success
      results.push({ groupId, status: "created", eventId: event.id })
    } catch (err) {
      // Step g: Prisma unique-constraint violation (@@unique[groupId, startsAt])
      if ((err as { code?: string }).code === "P2002") {
        results.push({ groupId, status: "skipped", reason: "duplicate" })
        continue
      }
      // Any other error is unexpected — re-throw so the cron handler can log it
      throw err
    }
  }

  return results
}
