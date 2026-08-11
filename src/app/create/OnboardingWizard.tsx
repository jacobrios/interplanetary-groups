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
import { WizardHeader } from "@/components/WizardHeader"
import Step1Describe from "./Step1Describe"
import Step2Playback from "./Step2Playback"
import StepGapAsk from "./StepGapAsk"
import Step3Share from "./Step3Share"

const initialExtractState: ExtractGroupState = { status: "idle" }

// Shown on Step 1 after two answers still left the rhythm unschedulable (or
// a merge round lost everything schedulable): the escape hatch is the
// existing edit-description flow, explained in Orbit's voice.
const EXHAUSTED_COPY =
  "I'm still missing a few details. Add the day and time to your description and I'll take another look."

export default function OnboardingWizard() {
  const [step, setStep] = useState<"describe" | "gap" | "playback" | "share">("describe")
  const [founderName, setFounderName] = useState("")
  const [description, setDescription] = useState("")
  const [groupName, setGroupName] = useState("")
  const [rhythms, setRhythms] = useState<StoredRhythm[] | null>(null)

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
  // True when the last answer moved nothing; the lead-in acknowledges that
  // plainly instead of thanking the founder for nothing.
  const [stalled, setStalled] = useState(false)
  const [gapExhausted, setGapExhausted] = useState(false)
  const [mergeError, setMergeError] = useState(false)
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
  // group-name row is editable without mutating the action result.
  const [handledExtract, setHandledExtract] = useState<ExtractGroupState | null>(null)
  if (extractState !== handledExtract && extractState.status === "ready") {
    setHandledExtract(extractState)
    setGroupName(extractState.profile.groupName)
    setRhythms(extractState.profile.rhythms)
    setStep("playback")
  }
  if (extractState !== handledExtract && extractState.status === "incomplete") {
    setHandledExtract(extractState)
    setGap(extractState.gap)
    setRound(0)
    setAnswerDraft("")
    setStalled(false)
    setMergeError(false)
    setGapExhausted(false)
    setStep("gap")
  }

  // The merge result drives four transitions, so it uses useTransition and
  // straight-line state updates (the createGroupAction pattern below) rather
  // than a second useActionState with its own handled marker.
  function handleAnswerSubmit() {
    if (!gap || answerDraft.trim().length === 0) return
    setMergeError(false)
    startMerge(async () => {
      const result = await mergeGapAction({ description, answer: answerDraft, round, gap })
      if (result.status === "error") {
        // Soft retry: draft preserved, round not consumed.
        setMergeError(true)
        return
      }
      if (result.status === "ready") {
        setGroupName(result.profile.groupName)
        setRhythms(result.profile.rhythms)
        setStep("playback")
        return
      }
      if (result.status === "incomplete") {
        setGap(result.gap)
        setRound(result.round)
        setStalled(!result.progressed)
        setAnswerDraft("")
        return
      }
      // Exhausted: two answers spent (or a merge lost everything
      // schedulable). Back to describe with the explainer; the description
      // is still in state, ready to edit.
      setGapExhausted(true)
      setStep("describe")
    })
  }

  // A fresh extraction starts a clean loop: clear the exhausted explainer
  // before dispatching.
  function extractFormActionClearingExhausted(formData: FormData) {
    setGapExhausted(false)
    extractFormAction(formData)
  }

  // The Step 2 venue input writes the raw editing string into rhythm state
  // (typing is never fought); trim-or-null happens once at confirm below.
  function handleVenueNameChange(index: number, value: string) {
    setRhythms((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, venueName: value } : r)) : prev
    )
  }

  function handleConfirm() {
    if (!rhythms) return
    setCreateError(null)
    startCreate(async () => {
      const result = await createGroupAction({
        founderName,
        groupName,
        description,
        rhythms: rhythms.map((r) => ({
          ...r,
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
        {/* No onBack mid-create: Step2Playback's own edit link already disables
            during isCreating, and the header chevron must match it so a
            founder can't navigate away from an in-flight creation. */}
        <WizardHeader step={2} onBack={isCreating ? undefined : () => setStep("describe")} />
        <Step2Playback
          founderName={founderName}
          groupName={groupName}
          onGroupNameChange={setGroupName}
          rhythms={rhythms}
          onVenueNameChange={handleVenueNameChange}
          timeZone={timeZone}
          onConfirm={handleConfirm}
          onBack={() => setStep("describe")}
          isCreating={isCreating}
          error={createError}
        />
      </>
    )
  }

  if (step === "gap" && gap) {
    return (
      <>
        <WizardHeader step={2} onBack={() => setStep("describe")} />
        <StepGapAsk
          founderName={founderName}
          gap={gap}
          round={round}
          stalled={stalled}
          answer={answerDraft}
          onAnswerChange={setAnswerDraft}
          onSubmit={handleAnswerSubmit}
          onEditDescription={() => setStep("describe")}
          isMerging={isMerging}
          mergeError={mergeError}
        />
      </>
    )
  }

  return (
    <>
      <WizardHeader step={1} />
      <Step1Describe
        founderName={founderName}
        onFounderNameChange={setFounderName}
        description={description}
        onDescriptionChange={setDescription}
        formAction={extractFormActionClearingExhausted}
        isExtracting={isExtracting}
        extractState={extractState}
        bubbleOverride={gapExhausted ? EXHAUSTED_COPY : undefined}
      />
    </>
  )
}
