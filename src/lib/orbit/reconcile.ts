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
//    The scheduled-event guard (hasUpcomingScheduledEvent) means reconcile
//    will skip that group on retry, so the orphaned event is permanent
//    without manual intervention. Low risk at once-per-day cadence.
//    (promote.ts, the spark path, does hold its whole set in one transaction.)

import { prisma } from "@/lib/prisma"
import { MessageAuthor } from "@prisma/client"
import { parseRhythm } from "./rhythm"
import { computeNextOccurrence } from "./occurrence"
import { buildAnnouncement } from "./announce"
import { createEvent } from "@/lib/events/create"
import { createMessage } from "@/lib/messages/create"
import { hasUpcomingScheduledEvent } from "@/lib/events/upcoming-list"

export type ReconcileResult =
  | { groupId: string; status: "created"; eventId: string }
  | { groupId: string; status: "skipped"; reason: "no_rhythm" | "upcoming_exists" | "duplicate" }
  | { groupId: string; status: "failed"; reason: string }

/**
 * Reconcile scheduled events across all groups.
 *
 * For each group that has a valid rhythm and no upcoming event, creates one
 * Event and one ORBIT feed announcement.  Groups without a rhythm or that
 * already have an upcoming SCHEDULED event are skipped. A sparked event does
 * not count: it is not evidence the schedule has run.
 *
 * Groups are processed sequentially (not Promise.all) to avoid subtle timing
 * races in the upcoming-event guard during integration tests and low-volume
 * production runs.
 *
 * @param now  The reference instant.  Passed explicitly so callers (cron
 *             handler, tests) control the clock without mocking Date.now().
 * @param opts.groupId  Optional scope: reconcile only this group.  Used by
 *             group creation to generate the first event immediately without
 *             sweeping every group in the database.
 */
export async function reconcileScheduledEvents(
  now: Date,
  opts?: { groupId?: string }
): Promise<ReconcileResult[]> {
  const groups = opts?.groupId
    ? await prisma.group.findMany({ where: { id: opts.groupId } })
    : await prisma.group.findMany()
  const results: ReconcileResult[] = []

  for (const group of groups) {
    try {
      results.push(await reconcileOneGroup(group, now))
    } catch (err) {
      // One bad group must not take the sweep down. This runs first of three
      // in the hourly cron (src/app/api/cron/orbit/route.ts), so a throw here
      // used to cost every later group its recurring plan AND both sibling
      // sweeps (last calls, idea goodbyes, stalled vote closures) for that
      // hour. Both siblings already survive a bad row; this one did not.
      // Pre-launch audit, finding 4. Logged, never swallowed silently:
      // endgame.ts:148 is the pattern.
      console.error("[orbit-reconcile] group failed:", group.id, err)
      results.push({
        groupId: group.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

async function reconcileOneGroup(
  group: { id: string; recurringActivities: unknown; timeZone: string | null },
  now: Date
): Promise<ReconcileResult> {
  const { id: groupId, recurringActivities, timeZone } = group

  // Step a: parse rhythm — skip if missing or invalid
  const rhythm = parseRhythm(recurringActivities)
  if (!rhythm) {
    return { groupId, status: "skipped", reason: "no_rhythm" }
  }

  // Step b: skip if the STANDING rhythm already has an upcoming occurrence.
  // Deliberately not "any upcoming event": a sparked event is not evidence
  // that the schedule has run, and counting it would silently withhold the
  // group's recurring event until the spark had passed.
  const alreadyScheduled = await hasUpcomingScheduledEvent(groupId, now)
  if (alreadyScheduled) {
    return { groupId, status: "skipped", reason: "upcoming_exists" }
  }

  // Step c: compute the next occurrence of this rhythm after `now`.
  // The same zone drives the announcement copy below, so the event's instant
  // and the words describing it can never disagree (build-notes §11).
  const zone = timeZone ?? "UTC"
  const startsAt = computeNextOccurrence(rhythm, zone, now)

  // Step d+e: create the event and the announcement
  // P2002 guard: if a concurrent run snuck in a duplicate, catch and skip.
  try {
    const event = await createEvent({
      groupId,
      title: rhythm.title,
      startsAt,
      activityLabel: rhythm.activity,
      // The scheduled path's own idempotency key, replacing the dropped
      // @@unique([groupId, startsAt]). Two cron runs racing on the same
      // occurrence still collide on P2002 and come back as a skip.
      scheduledKey: `${groupId}:${startsAt.toISOString()}`,
      // Standing-place snapshot: the rhythm's venue becomes this event's
      // Venue row ({name} only; label/address/url are per-event concerns,
      // left null). A later change to the rhythm's standing place will not
      // alter events already created — deliberate, see build-notes §11.
      venue: rhythm.venueName ? { name: rhythm.venueName } : null,
    })

    // Step e: announce in the group feed, in the group's timezone so the
    // stored copy matches the pinned card exactly.
    await createMessage({
      groupId,
      authorType: MessageAuthor.ORBIT,
      authorId: null,
      body: buildAnnouncement(event, rhythm, zone),
    })

    // Step f: record success
    return { groupId, status: "created", eventId: event.id }
  } catch (err) {
    // Step g: Prisma unique-constraint violation (the unique scheduledKey).
    // Also the deliberate landing spot for a moved occurrence: a time change
    // leaves the key alone, so after a moved-earlier event passes, the
    // attempt to recreate its original slot lands here and skips. Relocate,
    // not free (see the scheduledKey schema comment and the reconcile test
    // pinning this).
    if ((err as { code?: string }).code === "P2002") {
      return { groupId, status: "skipped", reason: "duplicate" }
    }
    // Any other error is unexpected — re-throw so the cron handler can log it
    throw err
  }
}
