"use client"

// Renders nothing. Its only job is to tell the server the viewer opened this
// group, once per distinct group the instance is given.
//
// The guard tracks the last groupId actually fired, not a fired-or-not
// boolean, because this instance can be reused across groups without
// remounting: src/app/groups/[id]/page.tsx renders GroupHome (and this
// marker under it) with no key={group.id}, and nothing scopes a layout to
// that route segment, so a client-side navigation from one group to another
// reconciles this component in place rather than tearing it down. A boolean
// that only ever flips from false to true would fire for the first group and
// then silently stop recording for every group after it. There is no
// in-app route to a second group yet, so this is currently unreachable, but
// it is exactly the path the queued multi-group work will open.
//
// A component rather than an effect inside GroupHome so it has its own test
// seam and so GroupHome, which already carries the optimistic message list,
// does not grow a second unrelated responsibility.
//
// The call is wrapped in startTransition rather than fired bare, per the
// Next.js 16 server-actions guide (node_modules/next/dist/docs/01-app/
// 01-getting-started/07-mutating-data.md, "useEffect" section) and the
// server-actions guide's own line that a Server Action is invoked "from an
// event handler or useEffect wrapped in startTransition". Both docs give
// the exact shape here, a view-count-style write on mount, as their worked
// example. There is no local state update to batch (this component has none
// to render), so the wrap buys none of the mechanical benefit it buys in
// their example; it is kept anyway because it is the documented calling
// convention for this exact pattern, not a case-by-case optimization.
//
// The .catch() on the call is the load-bearing half of that wrap, and it is
// this file's job rather than the action's. The action's own try/catch covers
// what happens inside the server function; it cannot cover the trip. A
// dropped mobile connection, a 500, or a stale action id after a deploy while
// the tab was open all reject the promise this client is holding, and React
// surfaces a rejected async transition to the nearest error boundary, which
// here is src/app/error.tsx. Without the catch, a write with no user-visible
// outcome would replace the product's main screen with "Something broke on
// our end." Same precedent and same reasoning as the detectIntentAction call
// in GroupHome.tsx.

import { useEffect, useRef, useTransition } from "react"
import { markGroupSeenAction } from "@/app/actions/group-seen"

interface Props {
  groupId: string
  /** Null for a signed-out viewer, who has no read position to record. */
  viewerId: string | null
}

export default function SeenMarker({ groupId, viewerId }: Props) {
  const lastFiredGroupId = useRef<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!viewerId || lastFiredGroupId.current === groupId) return
    lastFiredGroupId.current = groupId
    startTransition(async () => {
      // The action is soft on the server; this catch covers the trip itself.
      // A failed read-position write must leave the group home standing, not
      // surface an error boundary.
      await markGroupSeenAction(groupId).catch(() => null)
    })
  }, [groupId, viewerId])

  return null
}
