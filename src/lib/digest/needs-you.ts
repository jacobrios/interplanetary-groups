// src/lib/digest/needs-you.ts
//
// The digest's "needs you" block: everything currently waiting on this one
// member, across a group's confirmed events, ideas still being gauged, and
// open time-change votes. Pure, following lib/pending/derive.ts and
// lib/cards/region.ts before it: rows the caller already fetched go in,
// decided items come out. Nothing here queries Prisma or writes anything, so
// a digest job and any future second consumer can never disagree about what
// this function decided.
//
// DECISION 2 DEPARTURE (owner, 29 Aug 2026, digest slice two — do not "fix"
// this by deleting the time-change kind below or by adding a rung for it
// back to region.ts; both would undo a decision the owner already made on
// purpose). Two of the three kinds here are drawn straight off the card
// ladder in lib/cards/region.ts (eventNeedLabel, ideaNeedLabel), so the
// email can never say something the group home wouldn't. The third, a
// group time-change vote, has NO rung in region.ts, because it was
// deliberately deleted from the card ladder in the card-region-height slice
// once that vote moved off the cards and into chat plus the event detail
// screen. The owner decided the email should carry it anyway: the email
// stands in for the whole screen, chat included, not just the card strip,
// and a stalled time-change vote is already the most invisible thing in the
// product. So its label is composed HERE, in this module, rather than in
// region.ts. This is a knowing, narrow departure from "the email and the
// group home can never disagree," settled deliberately, not drift.
//
// Liveness is never re-derived here. findLiveGauges (lib/gauges/read.ts) and
// findLiveProposals (lib/proposals/read.ts) already decide what is still
// open and answerable, including the timezone-sensitive day-boundary math a
// closed gauge or a lapsed proposal fails. This module only ever sees rows
// those two functions already called live, so "a dead item is never
// emailed" holds by construction: there is no second opinion in here that
// could drift from what the screen shows.
//
// Scope note on time-change votes: only ChangeProposal rows of kind GROUP
// are treated as a vote here. A VERIFY-kind proposal is Orbit's own
// clarifying question to the single member who triggered it, resolved in
// one CONFIRM/DECLINE tap rather than a per-person vote with a bar; it is
// not the "time-change vote" decision 2 is about and was never on the card
// ladder either, so it is excluded rather than silently swept in.

import type { EventCardData } from "@/app/groups/[id]/EventCarousel"
import type { LiveGauge } from "@/lib/gauges/read"
import type { LiveProposal } from "@/lib/proposals/read"
import { eventNeedLabel, ideaNeedLabel } from "@/lib/cards/region"
import { formatEventDate, formatWeekdayShort } from "@/lib/events/format"
import { formatTimeLocalLabel, sparkStartInstant } from "@/lib/orbit/spark-copy"
import { proposalChipLabels } from "@/lib/orbit/change-copy"

/**
 * Which of the three kinds an item is. Not one of the brief's four named
 * fields (title, when-line, label, url); added because the subject-line
 * composer (decision 7: "RSVPs" vs "votes" vs "things") needs a
 * machine-readable grouping and parsing the label text back apart would be
 * the wrong way to get it.
 */
export type NeedsYouKind = "event" | "idea" | "timeChange"

export interface NeedsYouItem {
  kind: NeedsYouKind
  /** The underlying row's own id. Stable per item; never rendered. */
  key: string
  title: string
  whenLine: string
  label: string
  url: string
}

interface DeriveInput {
  /** This viewer's own upcoming events, in the exact shape page.tsx already
   *  assembles for the card region: the event plus this viewer's own RSVP
   *  status. The caller composes this the same way page.tsx does (event
   *  rows plus deriveRoster's viewerStatus), so it is a second window onto
   *  rows already fetched, never a second query run from in here. */
  events: EventCardData[]
  liveGauges: LiveGauge[]
  liveProposals: LiveProposal[]
  viewerId: string
  timeZone: string
}

interface StagedItem extends NeedsYouItem {
  sortMs: number
}

/**
 * Everything waiting on `viewerId`, in date order, soonest first. No cap:
 * unlike the card region (capped at five for a phone screen), an email has
 * no such constraint, and truncating this list would mean silently not
 * telling somebody about something waiting on them.
 */
export function deriveNeedsYouItems(input: DeriveInput): NeedsYouItem[] {
  const staged: StagedItem[] = []

  // ── Events needing an RSVP ────────────────────────────────────────────
  for (const card of input.events) {
    const label = eventNeedLabel(card.viewerStatus)
    if (!label || !label.needsViewer) continue
    staged.push({
      kind: "event",
      key: card.event.id,
      title: card.event.title,
      whenLine: formatEventDate(card.event.startsAt, card.event.endsAt, input.timeZone),
      label: label.text,
      url: `/events/${card.event.id}`,
      sortMs: card.event.startsAt.getTime(),
    })
  }

  // ── Ideas needing a vote ──────────────────────────────────────────────
  // No detail page for an idea (queued post-MVP), so its link is the group
  // home, exactly as the card's own tap target is.
  for (const g of input.liveGauges) {
    const viewerAnswer = g.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    const label = ideaNeedLabel(viewerAnswer)
    // Drops both an explicit decline (label null, same as the card) and a
    // viewer already IN (label.needsViewer false, "Needs other votes"):
    // this block is the viewer's own outstanding list, nobody else's.
    if (!label || !label.needsViewer) continue
    staged.push({
      kind: "idea",
      key: g.id,
      title: g.activity,
      whenLine: g.proposedTime
        ? `${formatWeekdayShort(g.proposedDate, input.timeZone)} ${formatTimeLocalLabel(g.proposedTime)}`
        : formatWeekdayShort(g.proposedDate, input.timeZone),
      label: label.text,
      url: `/groups/${g.groupId}`,
      sortMs: sparkStartInstant(g.proposedDate, g.proposedTime, input.timeZone).getTime(),
    })
  }

  // ── Time-change votes (GROUP kind only; see header scope note) ────────
  for (const p of input.liveProposals) {
    if (p.kind !== "GROUP") continue
    const viewerAnswer = p.votes.find((v) => v.userId === input.viewerId)?.answer ?? null
    if (viewerAnswer !== null) continue // answered, either way; nothing outstanding
    staged.push({
      kind: "timeChange",
      key: p.id,
      title: p.event.title,
      // Borrowed verbatim from the same chip label the event screen renders
      // (proposalChipLabels), so the email never invents new wording for a
      // vote it does not own the copy for.
      whenLine: proposalChipLabels(p.proposedStartsAt, p.priorStartsAt, input.timeZone).yes,
      label: "Needs your vote",
      url: `/events/${p.event.id}`,
      sortMs: p.event.startsAt.getTime(),
    })
  }

  return staged
    .sort((a, b) => a.sortMs - b.sortMs)
    .map(({ sortMs: _sortMs, ...item }) => item)
}
