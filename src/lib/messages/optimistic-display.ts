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

/**
 * Clears the sending state on optimistic entries whose send has already landed.
 *
 * Returns the SAME array when nothing changes, so the feed is not handed a
 * fresh list on every render.
 *
 * @param messages the feed as useOptimistic currently reports it
 * @param settledIds ids of optimistic entries whose server action has resolved
 */
export function applySettledSends(
  messages: FeedMessage[],
  settledIds: readonly string[]
): FeedMessage[] {
  if (settledIds.length === 0) return messages

  const settled = new Set(settledIds)
  let changed = false
  const next = messages.map((message) => {
    if (!message.isPending || !settled.has(message.id)) return message
    changed = true
    return { ...message, isPending: false }
  })

  return changed ? next : messages
}
