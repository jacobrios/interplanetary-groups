// src/app/create/OnboardingWizard.tsx
//
// Client wizard for founder onboarding: describe → (extraction pause) →
// [gap-ask rounds, when the description leaves a gap] → playback → confirm →
// share. All beats live at /create in client state (no multi-route wizard);
// the group is created only at Step 2 confirm.
//
// State ownership: this component holds the founder's inputs, the gap-round
// state, and the normalized profile; Step components are presentational.
// Going back to Step 1 preserves everything — nothing is refetched or
// cleared. The description round-trips through client state and the merge
// action; it is not written to the database until confirm.

"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import {
  extractGroupAction,
  type ExtractGroupState,
  type GapPayload,
} from "@/app/actions/extract-group"
import { mergeGapAction } from "@/app/actions/merge-gap"
import { createGroupAction } from "@/app/actions/create-group"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import type { MissingField } from "@/lib/orbit/normalize"
import { EXHAUSTED_COPY } from "@/lib/orbit/playback"
import { gapBubbleLine } from "@/lib/orbit/gap"
import { WizardHeader } from "@/components/WizardHeader"
import VisibleViewport from "@/components/VisibleViewport"
import Step1Describe from "./Step1Describe"
import Step2Playback from "./Step2Playback"
import StepGapAsk, { type GapTurn, type MergeErrorKind } from "./StepGapAsk"
import Step3Share from "./Step3Share"

const initialExtractState: ExtractGroupState = { status: "idle" }

// How many remembered gap answers the wizard keeps and sends. Mirrors
// PRIOR_ANSWERS_MAX in src/lib/orbit/replay.ts, which the server enforces
// regardless; restated rather than imported because that module reaches
// the model call code and this file ships to the browser.
const PRIOR_ANSWERS_KEPT = 6

interface Props {
  /** The signed-in founder's stored `User.name`, or null for a first-time
   * founder. Threaded straight into `founderName` state so every downstream
   * consumer (the playback card, the gap-ask, createGroupAction) sees the
   * true name with no other change, and into Step1Describe separately so it
   * knows to render that name as read-only fact rather than an editable
   * field (spec: docs/superpowers/specs/2026-09-04-onboarding-nav-design.md). */
  knownName: string | null
}

export default function OnboardingWizard({ knownName }: Props) {
  const [step, setStep] = useState<"describe" | "gap" | "playback" | "share">("describe")
  const [founderName, setFounderName] = useState(knownName ?? "")
  const [description, setDescription] = useState("")
  const [groupName, setGroupName] = useState("")
  const [rhythms, setRhythms] = useState<StoredRhythm[] | null>(null)
  // Every activity the founder mentioned besides the main one (Task 4,
  // spontaneous-activities-design slice): set from every extract result,
  // ready or incomplete, including the prior-answers replay path, and reset
  // to [] whenever a new extraction starts (the founder submits step 1
  // again). A merge-gap round never touches it: merge-gap.ts's results
  // never carry otherActivities, since the wizard already has the names
  // from extraction and a later round has no reason to repeat them.
  const [otherActivities, setOtherActivities] = useState<string[]>([])

  // Infer the founder's timezone silently from their browser (build-notes §11,
  // timezone-capture slice): no picker, no question. Detected once on mount and
  // held here for the whole wizard — it never round-trips the extraction/merge
  // actions, so it survives every gap round and the escape back to Step 1, and
  // reaches the server only at confirm. Detection runs in an effect (not during
  // render) because the page is server-rendered first and the server's zone
  // would not match the browser's; reading it at render would risk a hydration
  // mismatch. null until the effect runs and whenever detection yields nothing;
  // the server normalizes null to "UTC".
  const [timeZone, setTimeZone] = useState<string | null>(null)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser timezone does not exist during server render, so it can only be read after mount
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null)
    } catch {
      setTimeZone(null)
    }
  }, [])

  const [extractState, extractFormAction, isExtracting] = useActionState(
    extractGroupAction,
    initialExtractState
  )

  // Gap-round state. round counts founder answers given so far; the server
  // independently clamps it, so drift can only shorten the loop.
  const [gap, setGap] = useState<GapPayload | null>(null)
  const [round, setRound] = useState(0)
  const [answerDraft, setAnswerDraft] = useState("")
  // The gap-ask conversation as shown on screen (gap-ask-thread slice, task
  // 3). Each Orbit line is composed here, once, when it arrives, and stored:
  // gapBubbleLine picks its lead-in from the round and whether the answer
  // stalled, so composing at render time would rewrite every earlier line
  // in the latest round's words. A fresh extraction resets it, which is
  // what makes going back to step 1 start a new on-screen conversation.
  const [thread, setThread] = useState<GapTurn[]>([])
  // Answers the founder gave Orbit that a merge accepted (gap-ask-thread
  // slice, task 7), oldest first, trimmed, the last PRIOR_ANSWERS_KEPT of
  // them. Sent with every step 1 extraction, so going back to rephrase the
  // description does not make Orbit ask again for what the founder already
  // told it; the server replays them only into what the new description
  // still leaves missing, and the description wins where the two disagree.
  // Deliberately never cleared during the wizard's life: a fresh extraction
  // resets the on-screen conversation, not what the founder has said.
  const [priorAnswers, setPriorAnswers] = useState<string[]>([])
  const [exhaustedMissing, setExhaustedMissing] = useState<MissingField | null>(null)
  const [mergeError, setMergeError] = useState<MergeErrorKind | null>(null)
  const [isMerging, startMerge] = useTransition()

  const [isCreating, startCreate] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)
  // Set exactly once, by a successful confirm; the share step needs the id
  // to proceed and the token to share.
  const [created, setCreated] = useState<{ groupId: string; inviteToken: string } | null>(null)

  // Route each new extraction result exactly once, using the
  // adjust-state-during-render pattern (React's documented alternative to a
  // setState-in-effect, which the react-hooks lint rule rejects). The action
  // result object is referentially stable until the next dispatch, so each
  // branch runs once per dispatch — which is also what keeps a stale
  // incomplete result from re-opening the gap step after a merge already
  // moved past it. The profile is copied into wizard state so the
  // step 2 editor can change it without mutating the action result.
  const [handledExtract, setHandledExtract] = useState<ExtractGroupState | null>(null)
  if (extractState !== handledExtract && extractState.status === "ready") {
    setHandledExtract(extractState)
    setGroupName(extractState.profile.groupName)
    setRhythms(extractState.profile.rhythms)
    setOtherActivities(extractState.profile.otherActivities)
    setStep("playback")
  }
  if (extractState !== handledExtract && extractState.status === "incomplete") {
    setHandledExtract(extractState)
    setGap(extractState.gap)
    setOtherActivities(extractState.gap.otherActivities ?? [])
    setRound(0)
    setAnswerDraft("")
    setThread([
      {
        from: "orbit",
        text: gapBubbleLine(extractState.gap.question, 0, false, extractState.gap.missing),
      },
    ])
    setMergeError(null)
    setExhaustedMissing(null)
    setStep("gap")
  }

  // The merge result drives four transitions, so it uses useTransition and
  // straight-line state updates (the createGroupAction pattern below) rather
  // than a second useActionState with its own handled marker.
  function handleAnswerSubmit() {
    if (!gap || answerDraft.trim().length === 0) return
    // Captured before the box is cleared: the merge sends exactly what was
    // typed (untrimmed, as before this slice), the bubble shows it trimmed.
    const answer = answerDraft
    const shown = answer.trim()
    setMergeError(null)
    // The answer shows the moment it is sent, like any chat, and the box
    // empties; a failed merge below rolls both back.
    // Kept by reference so a failed merge can take back exactly this turn.
    const turn: GapTurn = { from: "founder", text: shown }
    setThread((t) => [...t, turn])
    setAnswerDraft("")
    startMerge(async () => {
      const result = await mergeGapAction({ description, answer, round, gap })
      if (result.status === "error" || result.status === "unavailable") {
        // Soft retry: the answer comes off the thread and back into the box
        // so nothing typed is lost, and the round is not consumed. The turn
        // is removed by identity, never by position: "the last item" is only
        // the turn this send added for as long as nothing else has touched
        // the thread, and that is a promise about the rest of this file, not
        // something this line can check. If the thread was replaced in the
        // meantime, the filter finds nothing and removes nothing.
        setThread((t) => t.filter((x) => x !== turn))
        setAnswerDraft(answer)
        // Generic retry line, or the honest reason (credits or trouble).
        setMergeError(result.status === "error" ? "generic" : result.reason)
        return
      }
      // Any other outcome means the merge read the answer, so it is worth
      // remembering, whether it moved anything or not: a stalled "idk" is
      // still what the founder said, and the server's guards decide what it
      // may fill. A failed merge above never reaches here, so an answer
      // Orbit never read is never replayed.
      setPriorAnswers((prev) => [...prev, shown].slice(-PRIOR_ANSWERS_KEPT))
      if (result.status === "ready") {
        setGroupName(result.profile.groupName)
        setRhythms(result.profile.rhythms)
        setStep("playback")
        return
      }
      if (result.status === "incomplete") {
        setGap(result.gap)
        setRound(result.round)
        // A stalled round (the answer moved nothing) acknowledges plainly
        // instead of thanking the founder for nothing.
        setThread((t) => [
          ...t,
          {
            from: "orbit",
            text: gapBubbleLine(
              result.gap.question,
              result.round,
              !result.progressed,
              result.gap.missing
            ),
          },
        ])
        return
      }
      // Exhausted: three answers spent (or a merge lost everything
      // schedulable). Back to describe with the explainer, naming what is
      // actually still missing; the description is still in state, ready
      // to edit.
      setExhaustedMissing(result.missing)
      setStep("describe")
    })
  }

  // A fresh extraction starts a clean loop: clear the exhausted explainer
  // before dispatching.
  function extractFormActionClearingExhausted(formData: FormData) {
    setExhaustedMissing(null)
    formData.set("priorAnswers", JSON.stringify(priorAnswers))
    extractFormAction(formData)
  }

  function handleConfirm() {
    if (!rhythms) return
    setCreateError(null)
    startCreate(async () => {
      const result = await createGroupAction({
        founderName,
        groupName,
        description,
        // Trim the activity and venue here too. Since Task 9
        // (onboarding-step2-cleanup slice) every edit reaches wizard state
        // through the step 2 editor's Done, which hands over
        // validateDetailsEdit's already-trimmed output, so these trims are
        // redundant on that path and kept as a harmless belt: an untrimmed
        // "padel " reaching the server would be trimmed by the founder's
        // first group-info save, which diffDetails then reports as a rename
        // the founder never made (CLAUDE.md: stored state is not display).
        rhythms: rhythms.map((r) => ({
          ...r,
          activity: r.activity.trim(),
          venueName: r.venueName?.trim() ? r.venueName.trim() : null,
        })),
        timeZone,
      })
      if ("error" in result) {
        setCreateError(result.error)
        return
      }
      setCreated(result)
      setStep("share")
    })
  }

  if (step === "share" && created) {
    return (
      <>
        <WizardHeader step={3} />
        <Step3Share
          groupId={created.groupId}
          inviteToken={created.inviteToken}
          groupName={groupName}
        />
      </>
    )
  }

  if (step === "playback" && rhythms) {
    return (
      <>
        {/* No onBack mid-create: Step2Playback's own Edit details link disables
            during isCreating, and the header chevron must match it so a
            founder can't navigate away from an in-flight creation. */}
        <WizardHeader step={2} onBack={isCreating ? undefined : () => setStep("describe")} />
        <Step2Playback
          founderName={founderName}
          groupName={groupName}
          rhythms={rhythms}
          otherActivities={otherActivities}
          onDetailsChange={(name, next) => {
            setGroupName(name)
            setRhythms(next)
          }}
          timeZone={timeZone}
          onConfirm={handleConfirm}
          isCreating={isCreating}
          error={createError}
        />
      </>
    )
  }

  if (step === "gap" && gap) {
    // The gap step is its own full-height screen (gap-ask-thread slice, task
    // 4): the header fixed at the top, the card and the conversation
    // scrolling together in the middle, the composer pinned at the bottom,
    // the way a chat reads. Steps 1 to 3 keep the page's own layout, and
    // create/page.tsx is deliberately untouched, so this step covers the
    // page's padding with a fixed layer rather than asking the page to
    // change shape for one step. Nothing else renders on the page at this
    // step, so nothing sits hidden underneath it. The outer layer is
    // VisibleViewport (home-screen-web-app slice, task 2), which sizes
    // itself to the browser's actual visible area, tracking the on-screen
    // keyboard rather than the static 100dvh this used to be: a static
    // height put this step's composer under the keyboard on iPhone Chrome,
    // which is the "first-tap keyboard overlap" this slice exists to close.
    // VisibleViewport pads its own top with the safe-area inset; the inner
    // column below never carried any top padding of its own to begin with
    // (that lives one level down, on its header child, and is unrelated to
    // the safe area — see the comment there).
    return (
      <VisibleViewport
        style={{
          backgroundColor: "var(--surface-base)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "100%",
            maxWidth: "28rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* The page's own top and side padding, so the header lands exactly
              where it sits on every other step. VisibleViewport pads for the
              safe-area inset on top of this, not instead of it; this 2rem is
              the step's own visual spacing, unrelated to the notch. */}
          <div style={{ padding: "2rem 1.5rem 0", flexShrink: 0 }}>
            {/* No onBack mid-merge, the same rule as the playback step's
                mid-create chevron above. With it live, a founder could go
                back while a merge ran and its stale result still landed: a
                "ready" moved them off step 1 onto the playback they had just
                left, and an "incomplete" appended to a conversation that was
                about to be replaced. */}
            <WizardHeader step={2} onBack={isMerging ? undefined : () => setStep("describe")} />
          </div>
          <StepGapAsk
            founderName={founderName}
            gap={gap}
            thread={thread}
            answer={answerDraft}
            onAnswerChange={setAnswerDraft}
            onSubmit={handleAnswerSubmit}
            isMerging={isMerging}
            mergeError={mergeError}
          />
        </div>
      </VisibleViewport>
    )
  }

  return (
    <>
      <WizardHeader step={1} />
      <Step1Describe
        founderName={founderName}
        onFounderNameChange={setFounderName}
        knownName={knownName}
        description={description}
        onDescriptionChange={setDescription}
        formAction={extractFormActionClearingExhausted}
        isExtracting={isExtracting}
        extractState={extractState}
        bubbleOverride={exhaustedMissing ? EXHAUSTED_COPY[exhaustedMissing] : undefined}
      />
    </>
  )
}
