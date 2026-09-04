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
// TWO THINGS THAT SUMMARY NO LONGER TELLS YOU ON ITS OWN, both from the
// message-send-latency slice (31 Aug 2026). Read them before trusting the
// four bullets above, because each qualifies one of them:
//
// 1. HOLDING AN OPTIMISTIC ENTRY AND DRAWING IT AS UNSENT ARE NOW SEPARATE.
//    useOptimistic decides when to release the entry, and that is NOT when the
//    server got the message: it waits for every router-level transition,
//    including the one Next wraps around Orbit's read. So a second piece of
//    state, settledSends, decides when the bubble stops looking unsent. See the
//    long note on it below and src/lib/messages/optimistic-display.ts.
//
// 2. THE HARD RULE BELOW WAS TRUE ONLY OF ERRORS THE ACTION RETURNS. A
//    rejection escaped the transition to src/app/error.tsx and replaced the
//    whole screen with "Something broke on our end.", with the member's typed
//    text already cleared. Both consumers of the send promise now catch, and
//    both treat a null result as a failure. Do not remove either catch.
//
// A silently-sent-but-failed message is never left — same hard rule as RSVP,
// and as of the above it holds for a failed TRIP as well as a failed action.

import { useOptimistic, useTransition, useState, useEffect, useRef } from "react"
import { sendMessageAction, type SendMessageState } from "@/app/actions/send-message"
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
import LiveRefresh from "./LiveRefresh"
import { applySettledSends, type SettledSend } from "@/lib/messages/optimistic-display"
import type { ModelFailureReason } from "@/lib/orbit/model-errors"

/**
 * How long a send may go unanswered before the member is told it failed.
 *
 * A send can fail in two different ways and only one of them rejects. A dropped
 * connection, a 500, or a stale action id REJECT, and the catches below handle
 * those. Turning WiFi off does neither: the request simply hangs, nothing
 * settles, and without this the member's message sits at MessageFeed's 0.65
 * "not sent yet" opacity forever with nothing on screen saying so. Measured in a
 * production build with a never-settling fetch: still dim and still silent after
 * 25 seconds. Found by the owner on a real phone, after a test that only covered
 * the rejecting case passed.
 *
 * Deliberately generous, and the cost is real and belongs next to the number: a
 * slow-but-working send on bad signal can pass this deadline and be reported as
 * failed when it actually landed. That is why a timed-out entry is LEFT in the
 * feed rather than removed (owner's call, 31 Aug 2026): dim already reads as
 * "not sent", so the two agree, and deleting a message that did reach the server
 * is the worse of the two mistakes in a product whose whole claim is accurate
 * attendance.
 */
const SEND_DEADLINE_MS = 20_000

/**
 * The send promise, or null if it has not answered within the deadline.
 *
 * Never rejects, so both consumers can await it without their own guard against
 * a hang. It resolves to null rather than throwing because "no answer" and "an
 * answer that says it failed" mean the same thing to a member.
 */
function withDeadline(
  sending: Promise<SendMessageState>
): Promise<SendMessageState | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SEND_DEADLINE_MS)
    sending
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

/**
 * Whether a send result carries ANY error, rather than specifically
 * `errors.general`.
 *
 * `SendMessageState` has one error field today, so the two are equivalent and
 * this looks like ceremony. It is not: the moment somebody adds `errors.body`
 * or `errors.rateLimit`, a check pinned to `general` stops matching, and this
 * component's success path would mark the entry settled and draw a failed send
 * as sent at full opacity with no error anywhere. That is a direct violation of
 * this file's hard rule, produced by adding a field to an interface in another
 * file. Keyed on "any error present" so it cannot happen.
 */
function hasError(result: SendMessageState): boolean {
  return Boolean(result.errors && Object.values(result.errors).some(Boolean))
}

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

  // ORBIT'S READ RUNS WITH NO TRANSITION OF ITS OWN, AND THAT IS NOT WHAT FIXED
  // THE SLOW SEND. Both halves matter. (message-send-latency slice, 31 Aug 2026.)
  //
  // There used to be a second useTransition here, with a comment saying its
  // pending flag was "deliberately dropped on the floor", never reached
  // ChatInput's `disabled`, and that this was "the whole architecture of this
  // slice". That claim was false, and every attempt to fix it by reasoning
  // about transition scope was ALSO false. The record of that is kept here
  // because the wrong explanations are more useful than the right one to
  // whoever touches this next.
  //
  // The symptom: the member's own message rendered at MessageFeed's 0.65
  // "not sent yet" opacity for the entire length of Orbit's model call.
  // Measured on a local production build: on screen in 6-19ms, solid only at
  // 5034-6484ms, tracking the end of Orbit's request rather than the send's.
  //
  // Three things were tried, each measured in a browser rather than reasoned
  // about, and the first two changed NOTHING:
  //   1. Dispatching Orbit from a promise chain registered outside every
  //      transition.
  //   2. Dispatching it from an effect, so it ran after the send's commit.
  //   3. Removing its useTransition entirely.
  // A component test said (3) worked. The browser said it did not: still solid
  // at ~6300ms. That test had been passing against MOCKED actions, which is
  // exactly what hid the real cause, and it was deleted rather than kept.
  //
  // The real cause, established by switching Orbit's dispatch off at runtime
  // and re-measuring: solid dropped to 2877-3217ms, each landing ~10ms after
  // the send's own request ended. Next dispatches EVERY server action inside a
  // router-level transition, and useOptimistic holds its entry until all of
  // those settle. So merely calling detectIntentAction holds the entry, with or
  // without a useTransition around it. It is not escapable from this side.
  //
  // Hence the actual fix, which stops fighting the framework: the entry is
  // released whenever React likes, and separately stops being DRAWN as sending
  // the moment the send's own promise resolves. See settledSends below and
  // src/lib/messages/optimistic-display.ts.
  //
  // The transition is still not restored here, on its own merit: it bought
  // nothing and its pending flag was already unused. But do not re-add it
  // believing it fixes anything, and do not delete settledSends believing the
  // absence of a transition is what keeps the message solid. It is not.
  //
  // The departure this represents, named rather than hidden: SeenMarker.tsx
  // follows the Next.js guidance to wrap a server action called from an effect
  // in startTransition, and this does not.
  //
  // Best-effort by design: closing the tab in that beat means Orbit never
  // answers. It fails quietly rather than wrongly.

  // The one thing the sender is told besides their own message: Orbit could
  // not read it (credits or trouble). Nothing is stored, nothing enters the
  // feed; a page reload drops it just like the condition it describes.
  const [orbitDown, setOrbitDown] = useState<ModelFailureReason | null>(null)

  // Supplies the optimistic entry's React key. See the note at its use site for
  // why a counter replaced Date.now() here.
  const nextOptimisticId = useRef(0)

  // Optimistic entries whose send has already landed. See
  // src/lib/messages/optimistic-display.ts for the whole reasoning; the short
  // version is that useOptimistic decides when to RELEASE an entry, and that is
  // not the same moment the server got the message, so this decides separately
  // when it stops being drawn as "sending".
  const [settledSends, setSettledSends] = useState<SettledSend[]>([])
  const displayMessages = applySettledSends(optimisticMessages, settledSends)

  // Whether React is still holding at least one optimistic entry it has not
  // yet reconciled away. This is NOT "is the send visually still greyed out"
  // (that question is settledSends' alone, above) and it is deliberately not
  // scoped to our own handleSubmit transition either: it tracks the raw
  // useOptimistic list, where an entry's isPending only clears when React
  // actually releases it, which per this file's header is not until every
  // router-level transition in flight has settled, Orbit's read included.
  // That is exactly the window LiveRefresh's own header names as the hazard:
  // a poll landing here can only make React wait on ONE MORE transition
  // before it reconciles, stretching the hold rather than shortening it. Feed
  // it to LiveRefresh as `paused` below so a periodic poll cannot pile onto a
  // hold that is already in progress.
  const hasUnreconciledSend = optimisticMessages.some((m) => m.isPending)

  // Nothing is in flight any more, so the ids are dead weight. Cleared rather
  // than left to grow for the life of the tab.
  useEffect(() => {
    if (settledSends.length > 0 && !hasUnreconciledSend) {
      setSettledSends([])
    }
  }, [hasUnreconciledSend, settledSends])

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
  // callback. **This did not fix the greying and nothing about the dispatch
  // site does** (see the note above: the cause is that a server action is a
  // router transition at all). It is kept on its own merit only: the send
  // transition owns the optimistic entry and should not also be the thing that
  // kicks off unrelated work.
  useEffect(() => {
    if (detectQueue.length === 0) return
    const draining = detectQueue
    // Remove exactly what is being drained, never the whole queue.
    //
    // This was `setDetectQueue([])`, which reintroduced the very bug the queue
    // above exists to prevent, and the comment on that queue was describing a
    // guarantee its own drain was breaking. `enqueueDetection` appends
    // functionally, so a second send resolving between this render and this
    // effect's flush lands in the queue that the plain `[]` then discards. The
    // member sees their message normally and Orbit never reads it, silently.
    // Appends only ever happen at the end, so dropping the drained prefix is
    // enough. Found in independent review, not by a test: the interleaving
    // needs a real paint boundary and is not reproducible in jsdom.
    setDetectQueue((queue) => queue.slice(draining.length))
    for (const messageId of draining) {
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
      // A counter, not a clock. This used to be `optimistic-${Date.now()}`,
      // which was fine while the input was disabled for the whole send: a
      // second message could not exist inside the same millisecond. Now that
      // the input stays live, fast typing collides, and React's response to a
      // duplicate key is a warning that the behavior "is unsupported and could
      // change in a future version" — i.e. it renders both today and reserves
      // the right to omit one later. The counter removes the question.
      id: `optimistic-${nextOptimisticId.current++}`,
      authorType: MessageAuthor.MEMBER,
      authorId: viewerId,
      authorName: viewerName,
      body,
      createdAt: new Date(),
      isPending: true,
    }

    setInputValue("")
    setErrorMsg(null)

    // Started outside the transition so the same promise can be observed twice:
    // once by the transition that owns the optimistic entry, and once by the
    // plain callback below that decides when the entry stops LOOKING unsent.
    // Guarded once, consumed twice: the transition below decides what the
    // member is told, and the .then decides whether the bubble stops looking
    // unsent. Both must agree, so both read the same guarded promise.
    const sending = withDeadline(sendMessageAction({}, formData))

    startTransition(async () => {
      addOptimisticMessage(optimistic)
      // `.catch` is load-bearing and is the same guard SeenMarker.tsx and the
      // detection call below already carry. The action is soft on the server;
      // this covers THE TRIP. A dropped connection, a 500, or a stale action id
      // after a deploy while the tab was open all reject the promise this client
      // is holding, and React surfaces a rejected async transition to the
      // nearest error boundary: src/app/error.tsx, "Something broke on our end."
      // That replaced the entire group home, with the member's typed text
      // already cleared, and the inline error below never rendered.
      //
      // A null result therefore means the trip failed, and is deliberately
      // treated as an error rather than as an empty success. Pre-existing on
      // main and measured identically there; fixed here because this slice
      // rewrote this line and had already put the same guard on the harmless
      // branch of the very same promise.
      const result = await sending
      if (!result || hasError(result)) {
        setErrorMsg(result?.errors?.general ?? "Couldn't send that, try again.")
        // useOptimistic auto-reverts to initialMessages once the transition
        // settles with no matching revalidatePath — removing the failed entry.
        return
      }
      if (result?.messageId) enqueueDetection(result.messageId)
    })

    // The send has landed: the server has this message, whatever React is still
    // holding. Marked from OUTSIDE the transition on purpose, so this is an
    // urgent update that lands now rather than a transition update that would
    // wait for the very thing being worked around.
    //
    // A failed send is deliberately NOT marked. It keeps reading as unsent and
    // then disappears with the error, which is the hard rule this component has
    // always held: a silently-sent-but-failed message is never left.
    void sending
      .then((result) => {
        // The SAME test the transition branch uses, deliberately. These two
        // decide the same question about the same promise, and if they ever
        // disagree the losing combination is "no error shown, drawn as sent".
        if (!result || hasError(result)) return
        // Both ids, because the server one is what lets the entry be dropped
        // when its confirmed row arrives rather than merely un-greyed.
        if (!result.messageId) return
        const landed: SettledSend = {
          optimisticId: optimistic.id,
          serverId: result.messageId,
        }
        setSettledSends((ids) => [...ids, landed])
      })
      .catch(() => null)
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
      {/* Renders for any viewer, member or not; the page-level members-only
          wall already decided who reaches this screen. `paused` is bound to
          hasUnreconciledSend above, not to the ChatInput-adjacent "is this
          screen busy" feeling: see that constant's comment for why. */}
      <LiveRefresh paused={hasUnreconciledSend} />

      {/* Scrollable feed */}
      <MessageFeed
        messages={displayMessages}
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
