// src/app/create/OnboardingWizard.tsx
//
// Client wizard for founder onboarding: describe → (extraction pause) →
// playback → confirm. All three beats live at /create in client state
// (no multi-route wizard); the group is created only at Step 2 confirm.
//
// State ownership: this component holds the founder's inputs and the
// normalized profile; Step components are presentational. Going back to
// Step 1 preserves everything — nothing is refetched or cleared.

"use client"

import { useActionState, useState, useTransition } from "react"
import { extractGroupAction, type ExtractGroupState } from "@/app/actions/extract-group"
import { createGroupAction } from "@/app/actions/create-group"
import type { StoredRhythm } from "@/lib/orbit/rhythm"
import Step1Describe from "./Step1Describe"
import Step2Playback from "./Step2Playback"

const initialExtractState: ExtractGroupState = { status: "idle" }

export default function OnboardingWizard() {
  const [step, setStep] = useState<"describe" | "playback">("describe")
  const [founderName, setFounderName] = useState("")
  const [description, setDescription] = useState("")
  const [groupName, setGroupName] = useState("")
  const [rhythms, setRhythms] = useState<StoredRhythm[] | null>(null)

  const [extractState, extractFormAction, isExtracting] = useActionState(
    extractGroupAction,
    initialExtractState
  )

  const [isCreating, startCreate] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)

  // Advance to playback when a new extraction succeeds, using the
  // adjust-state-during-render pattern (React's documented alternative to a
  // setState-in-effect, which the react-hooks lint rule rejects). The action
  // result object is referentially stable until the next dispatch, so this
  // runs exactly once per successful extraction. The profile is copied into
  // wizard state so the group-name row is editable without mutating the
  // action result.
  const [handledProfile, setHandledProfile] = useState<object | null>(null)
  if (extractState.status === "ready" && extractState.profile !== handledProfile) {
    setHandledProfile(extractState.profile)
    setGroupName(extractState.profile.groupName)
    setRhythms(extractState.profile.rhythms)
    setStep("playback")
  }

  function handleConfirm() {
    if (!rhythms) return
    setCreateError(null)
    startCreate(async () => {
      // Redirects server-side on success; only an error ever returns.
      const result = await createGroupAction({
        founderName,
        groupName,
        description,
        rhythms,
      })
      if (result?.error) setCreateError(result.error)
    })
  }

  if (step === "playback" && rhythms) {
    return (
      <Step2Playback
        founderName={founderName}
        groupName={groupName}
        onGroupNameChange={setGroupName}
        rhythms={rhythms}
        onConfirm={handleConfirm}
        onBack={() => setStep("describe")}
        isCreating={isCreating}
        error={createError}
      />
    )
  }

  return (
    <Step1Describe
      founderName={founderName}
      onFounderNameChange={setFounderName}
      description={description}
      onDescriptionChange={setDescription}
      formAction={extractFormAction}
      isExtracting={isExtracting}
      extractState={extractState}
    />
  )
}
