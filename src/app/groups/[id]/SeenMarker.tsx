"use client"

// Renders nothing. Its only job is to tell the server the viewer opened this
// group, once per mount.
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

import { useEffect, useRef, useTransition } from "react"
import { markGroupSeenAction } from "@/app/actions/group-seen"

interface Props {
  groupId: string
  /** Null for a signed-out viewer, who has no read position to record. */
  viewerId: string | null
}

export default function SeenMarker({ groupId, viewerId }: Props) {
  const fired = useRef(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!viewerId || fired.current) return
    fired.current = true
    startTransition(async () => {
      await markGroupSeenAction(groupId)
    })
  }, [groupId, viewerId])

  return null
}
