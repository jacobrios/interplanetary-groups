// src/app/groups/[id]/GroupHome.tsx
"use client"

// The client island for the group home: manages the optimistic message list
// and wires the chat feed to the pinned input.
//
// Architecture note: useOptimistic for the chat feed must live in a shared
// ancestor that renders both the feed (MessageFeed) and the form (ChatInput),
// because React's useOptimistic state is local to the component.  GroupHome
// is that ancestor: it holds the state, passes the live (possibly-optimistic)
// message list down to MessageFeed, and passes the submit handler + input
// state down to ChatInput.
//
// Optimistic pattern mirrors RsvpControls (see §11 optimistic-RSVP entry):
// - addOptimisticMessage appends the new message instantly.
// - startTransition awaits the server action; optimistic state persists
//   for the full round trip.
// - On success, revalidatePath (in sendMessageAction) triggers a server
//   re-render; initialMessages is updated and useOptimistic syncs.
// - On failure, the action returns an error and skips revalidatePath;
//   useOptimistic auto-reverts to initialMessages (removing the failed
//   optimistic entry) and errorMsg is shown.
//
// A silently-sent-but-failed message is never left — same hard rule as RSVP.

import { useOptimistic, useTransition, useState } from "react"
import { sendMessageAction } from "@/app/actions/send-message"
import { detectIntentAction } from "@/app/actions/detect-intent"
import { MessageAuthor } from "@prisma/client"
import MessageFeed, { type FeedMessage } from "./MessageFeed"
import type { FeedGauge } from "./GaugeChips"
import type { FeedProposal } from "./ProposalChips"
import type { FeedGroupProposal } from "./GroupProposalChips"
import ChatInput from "./ChatInput"
import OrbitDownNote from "./OrbitDownNote"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"

interface Props {
  groupId: string
  initialMessages: FeedMessage[]
  viewerId: string | null
  viewerName: string | null
  /** The group's own IANA timezone, threaded to MessageFeed for day dividers
   * that render in group time, never the viewer's (CLAUDE.md time rules). */
  timeZone: string
  gauges: FeedGauge[]
  proposals: FeedProposal[]
  groupProposals: FeedGroupProposal[]
  viewerIsMember: boolean
  /** Whether the pending strip renders above the feed (page.tsx), so the
   * feed can carry the strip's own 6px of air below it (round4-base.css
   * `.pd-host.pd-sep-host + .gh-feed { padding-top: 6px }`). */
  stripAbove?: boolean
}

export default function GroupHome({
  groupId,
  initialMessages,
  viewerId,
  viewerName,
  timeZone,
  gauges,
  proposals,
  groupProposals,
  viewerIsMember,
  stripAbove,
}: Props) {
  // The optimistic message list: flips to include the new message instantly,
  // then either stays (revalidatePath confirms) or reverts (action failed).
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    initialMessages,
    (state: FeedMessage[], newMsg: FeedMessage) => [...state, newMsg]
  )

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [isPending, startTransition] = useTransition()

  // A SECOND transition, for Orbit reading what was just said.
  //
  // Its pending flag is deliberately dropped on the floor and never reaches
  // ChatInput's `disabled`. That is the whole architecture of this slice: the
  // message posts, the input stays live, and Orbit's reply arrives a beat
  // later on its own. Wiring this flag to the input would lock the keyboard
  // for two to three seconds on the most-used interaction in the product.
  //
  // Best-effort by design: closing the tab in that beat means Orbit never
  // answers. It fails quietly rather than wrongly.
  const [, startDetection] = useTransition()

  // The one thing the sender is told besides their own message: Orbit could
  // not read it (credits or trouble). Nothing is stored, nothing enters the
  // feed; a page reload drops it just like the condition it describes.
  const [orbitDown, setOrbitDown] = useState<ModelFailureReason | null>(null)

  function handleSubmit(formData: FormData) {
    const body = (formData.get("body") as string | null)?.trim() ?? ""
    if (!body || !viewerId || !viewerName) return

    const optimistic: FeedMessage = {
      id: `optimistic-${Date.now()}`,
      authorType: MessageAuthor.MEMBER,
      authorId: viewerId,
      authorName: viewerName,
      body,
      createdAt: new Date(),
      isPending: true,
    }

    setInputValue("")
    startTransition(async () => {
      setErrorMsg(null)
      addOptimisticMessage(optimistic)
      const result = await sendMessageAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
        // useOptimistic auto-reverts to initialMessages once the transition
        // settles with no matching revalidatePath — removing the failed entry.
        return
      }

      // The send has settled. Hand the message to Orbit in its own transition
      // so this one can finish and release the input.
      if (result?.messageId) {
        const messageId = result.messageId
        startDetection(async () => {
          // The action is soft on the server; this catch covers the trip
          // itself. Going offline in the beat after sending must leave the
          // message standing, not surface an error boundary.
          const result = await detectIntentAction(messageId).catch(() => null)
          // The one thing the sender is told: Orbit could not read the
          // message (credits or trouble). Any successful detection clears a
          // stale note; a repeat failure keeps it current.
          if (result?.status === "unavailable") setOrbitDown(result.reason)
          else if (result) setOrbitDown(null)
        })
      }
    })
  }

  const canPost = viewerId !== null && viewerName !== null

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0, // allows flex children to scroll properly
      }}
    >
      {/* Scrollable feed */}
      <MessageFeed
        messages={optimisticMessages}
        viewerId={viewerId}
        timeZone={timeZone}
        gauges={gauges}
        proposals={proposals}
        groupProposals={groupProposals}
        viewerIsMember={viewerIsMember}
        stripAbove={stripAbove}
      />

      {/* Pinned input. The page-level wall means only members ever render
          this screen, and createMessage refuses a non-member server-side
          regardless (a removed member's stale tab still holds a live form).
          canPost still checks the session because a member row without a
          session cannot author anything. */}
      {canPost && (
        <>
          {orbitDown && <OrbitDownNote reason={orbitDown} />}
          <ChatInput
            groupId={groupId}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            isPending={isPending}
            errorMsg={errorMsg}
          />
        </>
      )}
    </div>
  )
}
