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
import DeployWatch from "./DeployWatch"
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
 * Where a half-typed message is parked so it survives a full page reload.
 *
 * CORRECTED 4 SEPT 2026 (own-deploy-detection slice), AND THE CORRECTION IS
 * THE FIRST THING TO READ, because the paragraph under it is what a previous
 * slice believed and it is wrong. Next's version-skew reload CANNOT fire on
 * this product. Vercel's Skew Protection pins every framework-managed request,
 * LiveRefresh's router.refresh() included, back to the deployment the tab
 * booted from, so the id in a poll's response is always the id the tab already
 * holds and the mismatch Next reacts to never happens. Proven in production
 * with a redeploy watched on a phone; the earlier probe that said otherwise
 * used a deployment id that did not exist, and nothing can be pinned to a
 * deployment that is not there.
 *
 * This behaviour is still needed, for a reload we now cause ourselves:
 * DeployWatch.tsx notices a newer build through a hand-written fetch (the one
 * request Vercel does not pin) and calls window.location.reload(). That is
 * still a genuine full page load that discards every piece of React state. The
 * one thing that did change is urgency: our own reload waits until the
 * composer is empty, so the draft is no longer the thing standing between a
 * member and a lost message. It is kept because it is right anyway, and
 * because it also survives a manual reload, a crash, and an iOS tab eviction.
 *
 * The superseded reasoning, kept because it explains the shape of what is
 * here: Next's version-skew protection is already live in production, Vercel
 * supplies a deployment id at build time with no configuration from us, and
 * LiveRefresh's 10s poll is what reaches it. When a poll's RSC response
 * reports a deployment id that differs from the one this document booted with,
 * Next calls `location.replace()` from inside its own render
 * (`fetch-server-response.js` -> `app-router.js`), with no user interaction,
 * no confirmation, no visibility guard and no callback we could hang state
 * off. The reload cannot be intercepted, and deferring it is worse than the
 * bug: the only lever on it is whether the poll fires at all, so "don't reload
 * while they're typing" necessarily means "stop syncing chat while they're
 * typing", which regresses the chat-sync slice. So the reload was left alone
 * and made harmless instead.
 *
 * WHY sessionStorage AND NOT localStorage. A draft belongs to the tab it is
 * being typed in. localStorage is shared across every tab on the origin, so a
 * member with this group open twice would watch one tab's half-typed message
 * appear in the other, and the draft would outlive the browsing session
 * entirely, resurfacing days later. sessionStorage is per tab and per session,
 * and — the property this actually needs — it survives a full page load of the
 * same document.
 *
 * WHICH FULL PAGE LOADS THOSE ARE, corrected 4 Sept 2026 with the block above.
 * This line used to name `location.replace()`, "which is exactly the event it
 * exists for", and that event cannot happen here: it is Next's version-skew
 * reload, which the CORRECTED paragraph above establishes never fires on this
 * product. The two loads that do happen are DeployWatch.tsx's own
 * `window.location.reload()` onto a newer build, and the hard browser
 * navigation Next falls back to when a poll's RSC fetch drops mid-flight
 * (fetch-server-response.js logs "Falling back to browser navigation" and
 * hands the caller a plain URL). A manual reload, a crash and an iOS tab
 * eviction are all covered by the same property, and were always the honest
 * everyday case.
 *
 * WHY THE KEY CARRIES THE GROUP ID. A member in two groups must not carry a
 * draft between them: the same tab navigating from one group home to another
 * would otherwise hand the second group a message written for the first.
 */
const draftKey = (groupId: string) => `ipg:draft:${groupId}`

/**
 * This group's parked draft, or "" when there is none.
 *
 * THE TRY BEGINS BEFORE `window.sessionStorage`, NOT AROUND `getItem` ALONE,
 * and that is the load-bearing part rather than defensive habit: reading the
 * property itself throws outright in a private window and wherever the browser
 * is set to block site data, before any method is called. Wrapping only the
 * method call would leave the page dying on the property lookup, in exactly
 * the browsers a member is most likely to be running.
 *
 * Every failure resolves to "no draft" and nothing else. A composer that cannot
 * park a draft must still be a working composer; the member loses a
 * convenience, never the screen.
 */
function readDraft(groupId: string): string {
  try {
    return window.sessionStorage.getItem(draftKey(groupId)) ?? ""
  } catch {
    return ""
  }
}

/**
 * Parks the current text, or removes the key when the member has emptied the
 * box. Same wrapping and the same reason as readDraft: a blocked or full store
 * costs the member their draft on the next reload, never their composer.
 *
 * Empty clears rather than storing "", so an emptied composer leaves nothing
 * behind and `readDraft` has one shape of "nothing" to answer with rather than
 * two.
 */
function writeDraft(groupId: string, value: string): void {
  try {
    if (value === "") window.sessionStorage.removeItem(draftKey(groupId))
    else window.sessionStorage.setItem(draftKey(groupId), value)
  } catch {
    // Deliberately silent. See readDraft.
  }
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
  /** The deployment that server-rendered this document, for DeployWatch to
   * compare against what is live. Null off Vercel, which means detection is
   * off. Passed down rather than read here because only the server has it. */
  bootedDeploymentId: string | null
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
  bootedDeploymentId,
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

  // RESTORED IN AN EFFECT, NEVER DURING RENDER, AND THE COST OF THAT IS
  // DELIBERATE. This screen is server-rendered: the server has no session
  // storage, so its HTML always carries an empty composer. Seeding useState
  // from storage — or reading it anywhere else during render — would make the
  // client's first render disagree with that HTML, which is a hydration
  // mismatch: React discards the server tree, warns, and re-renders the whole
  // island on the client. The visible cost of doing it here instead is one
  // frame with an empty textarea before the draft appears. A one-frame empty
  // box is not a bug and a hydration mismatch is, so this stays an effect. Do
  // not "simplify" it into a useState initialiser or a lazy initialiser
  // callback; both run during render.
  //
  // Keyed on groupId so a tab moving between two group homes picks up the
  // right draft, and THE SET IS UNCONDITIONAL, which is the load-bearing part
  // rather than a shorter way to write the same thing.
  //
  // There used to be an `if (parked)` around it, justified as protecting text
  // the member had already begun typing from an empty read. It protected
  // nothing and it leaked. Nothing: this effect runs at exactly two moments,
  // and at the first of them, mount, inputValue is still useState's own "", so
  // there is no typed text in existence for an empty read to clobber. Leaked:
  // at the second moment, a groupId change on a live instance, the guard is
  // what CARRIED the previous group's text across — readDraft on the new group
  // returns "", the guard skips the set, the box still holds group one's
  // message, and the next keystroke parks it under group two's key. Clearing
  // the box on a group change is the correct answer, because that text was
  // written for the group being left. That is the whole reason the key carries
  // the group id (see draftKey above), and the guard was quietly defeating it.
  //
  // Do not put it back, and do not narrow the dependency array to []. Each is a
  // mutation that was actually run: restoring the guard reddens "does not carry
  // a draft into a second group opened in the same tab" in
  // GroupHomeDraft.test.tsx, and [] reddens that one plus "swaps in the second
  // group's own parked draft".
  //
  // This trips react-hooks/set-state-in-effect, knowingly, and it is the third
  // hit of that rule in this file rather than the first (the settledSends
  // cleanup and the detect-queue drain below are the other two, both accepted
  // on their own merits). The rule's advice — derive it during render instead —
  // is exactly what cannot be done here, because the value being derived comes
  // from a browser API the server does not have. The cost the rule is warning
  // about is one extra render on mount. That is the same one-frame cost the
  // paragraph above already accepts, priced twice rather than a second problem.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the parked draft lives in browser storage the server cannot read, so it loads after mount and again on group change
    setInputValue(readDraft(groupId))
  }, [groupId])

  // Parks the draft as it is typed. The composer's own state is updated first
  // and storage second, in that order on purpose: writeDraft swallows its own
  // failures, so the member keeps typing whatever the browser's storage is
  // doing, and nothing about the composer's behaviour waits on a write.
  function handleInputChange(value: string) {
    setInputValue(value)
    writeDraft(groupId, value)
  }

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
  // yet reconciled away. Used ONLY by the cleanup effect immediately below,
  // to decide when settledSends' ids are dead weight — it is NOT what feeds
  // LiveRefresh's `paused` prop (see sendsInFlight further down), and that
  // split is deliberate, not an oversight: this tracks the raw useOptimistic
  // list, where an entry's isPending only clears when React actually
  // releases it, which per this file's header is not until every
  // router-level transition in flight has settled, Orbit's read included —
  // and on a send whose request hangs forever (SEND_DEADLINE_MS's whole
  // reason to exist), React never settles that transition at all. Fine for
  // this cleanup (an unbounded wait just means the dead ids linger a little
  // longer), fatal for `paused` (an unbounded wait means refresh never comes
  // back). Do not reuse this constant for the LiveRefresh binding.
  const hasUnreconciledSend = optimisticMessages.some((m) => m.isPending)

  // Nothing is in flight any more, so the ids are dead weight. Cleared rather
  // than left to grow for the life of the tab.
  useEffect(() => {
    if (settledSends.length > 0 && !hasUnreconciledSend) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears settled send ids once no optimistic send is pending; deliberate, see the settledSends notes above
      setSettledSends([])
    }
  }, [hasUnreconciledSend, settledSends])

  // How many sends are still waiting on their OWN guarded promise (the
  // `sending` binding below, built by withDeadline) to settle. This is what
  // LiveRefresh's `paused` prop reads, and it is bounded on purpose, in a way
  // hasUnreconciledSend above is not: withDeadline's whole job is to make
  // `sending` resolve — never reject, and never hang — within
  // SEND_DEADLINE_MS even when the real network request never answers. So
  // this counter cannot get stuck at a nonzero value for longer than that
  // deadline, however long React goes on holding the underlying transition.
  //
  // Reviewed and corrected once already: the first version of this file fed
  // `paused` from hasUnreconciledSend, which reads React's own release timing
  // and has no upper bound. A dropped connection mid-send (the exact,
  // phone-verified scenario SEND_DEADLINE_MS exists for: "still dim and still
  // silent after 25 seconds") leaves that transition pending for the rest of
  // the tab's life, which would have paused LiveRefresh forever after one bad
  // WiFi moment — silently reintroducing the frozen-screen bug this slice
  // exists to fix, for every later tick and every tab-return refresh. The
  // property this counter holds instead: once the member has been told the
  // send failed (or it actually landed), there is nothing left to protect,
  // so refresh must resume, whatever React is still doing internally.
  const [sendsInFlight, setSendsInFlight] = useState(0)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drains exactly the queued detection ids after the send commits; functional update keeps late appends, see above
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
    // Cleared AT DISPATCH, not at settle, so it stays in step with the line
    // above: the composer is emptied optimistically, and the parked copy goes
    // with it. Clearing later would leave a window in which a reload put a
    // message the member has already sent back into the box, reading as a send
    // that failed. The cost of clearing here is that a failed send loses the
    // draft, which is exactly what it does today with no storage involved at
    // all; this slice is not changing that behaviour, only not making it
    // worse. Note this cannot be folded into handleInputChange: setInputValue
    // is called directly here, and React does not fire onChange for a
    // programmatic value change on a controlled field.
    writeDraft(groupId, "")
    setErrorMsg(null)

    // Started outside the transition so the same promise can be observed
    // three times: once by the transition that owns the optimistic entry,
    // once by the plain callback below that decides when the entry stops
    // LOOKING unsent, and once by the counter that bounds LiveRefresh's
    // `paused` prop. Guarded once, consumed three times: the transition below
    // decides what the member is told, the first .then decides whether the
    // bubble stops looking unsent, and the .finally below decides when this
    // send stops holding refresh back. All three read the same guarded
    // promise so they can never disagree about when a send is "done".
    const sending = withDeadline(sendMessageAction({}, formData))

    // sendsInFlight is what makes `sending`'s bound (SEND_DEADLINE_MS) reach
    // LiveRefresh: withDeadline guarantees `sending` settles no matter what
    // the real request does, so this decrement is guaranteed to run, and
    // guaranteed to run within that deadline. Counted rather than a single
    // boolean because the input is never disabled (this slice's own rule):
    // a second send can start before the first settles, and the count must
    // not hit zero, and un-pause refresh, while the first is still unresolved.
    setSendsInFlight((n) => n + 1)
    void sending.finally(() => setSendsInFlight((n) => n - 1))

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
          sendsInFlight, deliberately NOT hasUnreconciledSend: see
          sendsInFlight's own comment for why the unbounded signal would
          reintroduce a frozen screen after one dropped connection. */}
      <LiveRefresh paused={sendsInFlight > 0} />
      {/* Notices that a newer build of the product is live and reloads onto
          it, but only when it will not interrupt anybody. These two props are
          the chat's half of that: they come from state this component already
          owns, and DeployWatch is deliberately not allowed to reach into
          either.

          THEY ARE NOT THE WHOLE OF "BUSY", and this note was wrong about that
          until 4 Sept 2026. It claimed waiting protected "scroll position, an
          open sheet and the keyboard" while checking the chat composer alone,
          so an open sheet was in fact the one thing it did NOT protect: a
          member returning from their mail app with a one-time code met a
          reload that took the sheet, its step and their typed address with it.
          DeployWatch now also treats an open [role="dialog"] and a caret in
          any text field as busy, read from the DOM at decision time rather
          than threaded through here — see its header for why a DOM query
          rather than another prop.

          composerHasText is TRIMMED, so whitespace alone is not a member being
          busy. The chat draft itself survives a reload regardless (see
          draftKey above); what these two protect is the send in progress and
          the member's train of thought. */}
      <DeployWatch
        bootedId={bootedDeploymentId}
        composerHasText={inputValue.trim().length > 0}
        sendInFlight={sendsInFlight > 0}
      />

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
          {/* onChange is handleInputChange, not setInputValue: it parks the
              draft as well as holding it. ChatInput is fully controlled and
              knows nothing about any of this, which is why it needed no
              change and must not be given one. */}
          <ChatInput
            groupId={groupId}
            value={inputValue}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            errorMsg={errorMsg}
          />
        </>
      )}
    </div>
  )
}
