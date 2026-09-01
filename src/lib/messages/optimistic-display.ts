// src/lib/messages/optimistic-display.ts
//
// One derivation: which optimistic chat entries should still be drawn as
// "sending".
//
// WHY THIS EXISTS AT ALL (message-send-latency slice, 31 Aug 2026). MessageFeed
// draws a message carrying `isPending` at 0.65 opacity, which a member reads as
// "not sent yet". The optimistic entry carries that flag from the moment it is
// created until useOptimistic releases it. The trouble is when useOptimistic
// releases it: not when the send lands, but when every router-level transition
// settles, and Next dispatches Orbit's read as one of those. So the member's
// own message kept reading as unsent for the entire length of a model call.
// Measured on a local production build: solid at 5034-6484ms against a send
// that had actually landed at about 3000ms.
//
// The fix is to stop conflating "the framework is still holding this entry"
// with "the server does not have this message yet". The second is the only one
// a member cares about, and it is answered by the send's own promise. So the
// entry stays exactly as long as React wants it to, and merely stops LOOKING
// unsent once the send has landed.
//
// AND THE DUPLICATE IS CLOSED HERE TOO, rather than accepted as debt, which is
// where this landed after independent review. While the entry is still held and
// revalidation has already delivered the real row, the member can see their own
// message twice. That was survivable while the leaked copy was greyed, because
// it read as a transient rendering state. Un-greying it made the two copies
// identical, so a leak would read as a data error instead: "did I send that
// twice, can everyone see it twice?" (They cannot; it is local-only.) Rather
// than accept a rarer but now-silent failure, the settled record carries the
// SERVER id the send returned, so the optimistic entry can simply be dropped
// once its confirmed row is present. Matched on that id and never on body text,
// so a member legitimately sending "ok" twice keeps both.
//
// Deliberately not the alternative fixes, both of which were weighed and both
// of which the owner declined on 31 Aug 2026 as bigger changes for an identical
// member experience: routing Orbit's read through an API route so it is not a
// router transition, and replacing useOptimistic with hand-managed state.
//
// A pure function in its own file rather than an inline map inside GroupHome,
// because GroupHome cannot be honestly tested for this (its tests mock the
// server actions, which strips the very transition behaviour at issue) and this
// can.

import type { FeedMessage } from "@/app/groups/[id]/MessageFeed"

/** An optimistic entry whose send has landed, and the row the server gave it. */
export interface SettledSend {
  /** The client-side id the optimistic entry was created with. */
  optimisticId: string
  /** The Message.id the send returned, used to spot its confirmed row. */
  serverId: string
}

/**
 * Reconciles optimistic entries against what the server has confirmed.
 *
 * Two things, both keyed on ids rather than content:
 *  - an entry whose send has landed stops being drawn as sending;
 *  - an entry whose confirmed row is already in the list is dropped, so the
 *    member never sees their own message twice.
 *
 * Returns the SAME array when nothing changes, so the feed is not handed a
 * fresh list on every render.
 *
 * @param messages the feed as useOptimistic currently reports it
 * @param settled optimistic entries whose server action has resolved
 */
export function applySettledSends(
  messages: FeedMessage[],
  settled: readonly SettledSend[]
): FeedMessage[] {
  if (settled.length === 0) return messages

  const landed = new Map(settled.map((s) => [s.optimisticId, s.serverId]))
  const present = new Set(messages.map((m) => m.id))

  let changed = false
  const next: FeedMessage[] = []
  for (const message of messages) {
    const serverId = landed.get(message.id)
    if (serverId === undefined || !message.isPending) {
      next.push(message)
      continue
    }
    // Its real row is already here; this entry is a duplicate of it.
    if (present.has(serverId)) {
      changed = true
      continue
    }
    changed = true
    next.push({ ...message, isPending: false })
  }

  return changed ? next : messages
}
