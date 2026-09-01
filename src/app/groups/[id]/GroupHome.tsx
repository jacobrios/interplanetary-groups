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

import { useOptimistic, useTransition, useState, useEffect } from "react"
import { sendMessageAction } from "@/app/actions/send-message"
import { detectIntentAction } from "@/app/actions/detect-intent"
import { MessageAuthor } from "@prisma/client"
import MessageFeed, { type FeedMessage } from "./MessageFeed"
import type { FeedGauge } from "./GaugeChips"
import type { FeedProposal } from "./ProposalChips"
import type { FeedGroupProposal } from "./GroupProposalChips"
import ChatInput from "./ChatInput"
import OrbitDownNote from "./OrbitDownNote"
import EmailAskNote, { type EmailAskNoteProps } from "./EmailAskNote"
import SeenMarker from "./SeenMarker"
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
  /** The facts Orbit's email ask decides on, or null when there is no viewer
   * to ask. Whether it is actually shown is EmailAskNote's own call, not this
   * component's and not the page's. */
  emailAsk: EmailAskNoteProps | null
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
  emailAsk,
}: Props) {
  // The optimistic message list: flips to include the new message instantly,
  // then either stays (revalidatePath confirms) or reverts (action failed).
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    initialMessages,
    (state: FeedMessage[], newMsg: FeedMessage) => [...state, newMsg]
  )

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [, startTransition] = useTransition()

  // ORBIT DOES NOT GET A TRANSITION, AND THAT IS THE LOAD-BEARING RULE HERE.
  // (message-send-latency slice, 31 Aug 2026.)
  //
  // There used to be a second useTransition on this line for Orbit's read, with
  // a comment saying its pending flag was "deliberately dropped on the floor",
  // never reached ChatInput's `disabled`, and that this was "the whole
  // architecture of this slice". The claim was false from the day it was
  // written, and the mechanism is not the one anybody assumed.
  //
  // useOptimistic holds its optimistic entry while ANY transition in the same
  // component is pending, not merely the transition that set it. So simply
  // having a second transition running here was enough to keep the member's own
  // message rendering at MessageFeed's 0.65 "not sent yet" opacity for the
  // entire length of Orbit's model call. Where the call was dispatched from
  // never mattered. Measured on a local production build: the message appeared
  // in 6-19ms and only turned solid at 5034-6484ms, exactly when Orbit
  // finished. Worse, once revalidation delivered the real row the member saw
  // their message twice, the confirmed copy solid and the optimistic one greyed
  // beneath it.
  //
  // Two fixes were tried and measured before this one. Moving the dispatch
  // outside the transition scope (a promise chain registered in handleSubmit)
  // changed nothing. Moving it into an effect, so it ran after commit, changed
  // nothing either. Only removing the transition worked, which is what
  // identified the real cause. A diagnostic test drove each attempt; the
  // surviving form of it is GroupHome.test.tsx's "releases the optimistic entry
  // the moment the send lands".
  //
  // So: do not wrap the detection call below in startTransition, and do not add
  // another useTransition to this component while the optimistic feed lives
  // here. Either one silently greys out every member's message again, with no
  // test failing anywhere except that one.
  //
  // The departure this represents, named rather than hidden: SeenMarker.tsx
  // follows the Next.js guidance to wrap a server action called from an effect
  // in startTransition, and this does not. It cannot, for the reason above.
  // SeenMarker is unaffected because it holds its own transition in its own
  // component and fires once on mount, never while a send is in flight.
  //
  // Best-effort by design: closing the tab in that beat means Orbit never
  // answers. It fails quietly rather than wrongly.

  // The one thing the sender is told besides their own message: Orbit could
  // not read it (credits or trouble). Nothing is stored, nothing enters the
  // feed; a page reload drops it just like the condition it describes.
  const [orbitDown, setOrbitDown] = useState<ModelFailureReason | null>(null)

  // Messages waiting to be handed to Orbit.
  //
  // A QUEUE RATHER THAN A SINGLE ID, because this slice made two sends in
  // flight at once a real thing: with the input never disabled, a member can
  // send again before the first send returns, and a lone id would let the
  // second overwrite the first inside one commit, dropping a message from
  // Orbit's view silently.
  const [detectQueue, setDetectQueue] = useState<string[]>([])
  const enqueueDetection = (messageId: string) =>
    setDetectQueue((queue) => [...queue, messageId])

  // Drained from an effect rather than called straight from handleSubmit, so
  // the dispatch happens after the send's commit rather than inside its async
  // callback. That ordering is not what fixed the greying (see the note above:
  // removing the transition did), but it is worth keeping on its own merit:
  // the send transition owns the optimistic entry and should not also be the
  // thing that kicks off unrelated work.
  useEffect(() => {
    if (detectQueue.length === 0) return
    setDetectQueue([])
    for (const messageId of detectQueue) {
      void (async () => {
        // The action is soft on the server; this catch covers the trip itself.
        // Going offline in the beat after sending must leave the message
        // standing, not surface an error boundary.
        const detected = await detectIntentAction(messageId).catch(() => null)
        // The one thing the sender is told: Orbit could not read the message
        // (credits or trouble). Any successful detection clears a stale note;
        // a repeat failure keeps it current.
        if (detected?.status === "unavailable") setOrbitDown(detected.reason)
        else if (detected) setOrbitDown(null)
      })()
    }
  }, [detectQueue])

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
    setErrorMsg(null)

    // This transition owns the optimistic entry and nothing else. It must end
    // when the send ends, which is why the only thing awaited inside it is the
    // send itself. Orbit is queued for later, never started here.
    startTransition(async () => {
      addOptimisticMessage(optimistic)
      const result = await sendMessageAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
        // useOptimistic auto-reverts to initialMessages once the transition
        // settles with no matching revalidatePath — removing the failed entry.
        return
      }
      if (result?.messageId) enqueueDetection(result.messageId)
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
      <SeenMarker groupId={groupId} viewerId={viewerId} />

      {/* Scrollable feed */}
      <MessageFeed
        messages={optimisticMessages}
        viewerId={viewerId}
        timeZone={timeZone}
        gauges={gauges}
        proposals={proposals}
        groupProposals={groupProposals}
        viewerIsMember={viewerIsMember}
      />

      {/* Pinned input. The page-level wall means only members ever render
          this screen, and createMessage refuses a non-member server-side
          regardless (a removed member's stale tab still holds a live form).
          canPost still checks the session because a member row without a
          session cannot author anything. */}
      {canPost && (
        <>
          {orbitDown && <OrbitDownNote reason={orbitDown} />}
          {/* Orbit's ask for an email. Since 27 Aug 2026 it is a bottom sheet
              over this whole screen rather than an inline note in this slot,
              so its position in this list no longer decides where it appears:
              the scrim is fixed to the viewport. It stays mounted here because
              the `canPost` guard around this block is exactly the condition it
              needs (a real session, which is who can be asked). The rule it
              shares with OrbitDownNote above is unchanged: per viewer,
              rendered, never posted to the feed. */}
          {emailAsk && <EmailAskNote {...emailAsk} />}
          <ChatInput
            groupId={groupId}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            errorMsg={errorMsg}
          />
        </>
      )}
    </div>
  )
}
