// src/app/groups/[id]/ProposalChips.tsx
"use client"

// The two one-tap answers under Orbit's change question, rendered only for
// the asker (the page composes proposal DTOs for the asker alone; the server
// action enforces the same rule).
//
// Styling comes from the shared choice grammar (src/components/choice.tsx),
// same as GaugeChips: neutral outlined pills, never lime, never teal-filled,
// emphasis by text brightness, chosen chip marked with a checkmark prefix,
// optimistic flip reverted by the transition if the write fails. Resolution
// removes the proposal server-side, so on success the chips vanish with the
// next render and the question stays as plain history.

import { useOptimistic, useTransition, useState } from "react"
import { proposalAnswerAction } from "@/app/actions/proposal-answer"
import { ChoiceChip, ChipRow, ErrorLine } from "@/components/choice"

export interface FeedProposal {
  id: string
  /** The Orbit question message these chips render under. */
  orbitMessageId: string
  labels: { confirm: string; decline: string }
}

type Answer = "CONFIRM" | "DECLINE"

interface Props {
  proposal: FeedProposal
}

export default function ProposalChips({ proposal }: Props) {
  const [optimisticAnswer, setOptimisticAnswer] = useOptimistic<Answer | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("answer") as Answer
      setErrorMsg(null)
      setOptimisticAnswer(next)
      const result = await proposalAnswerAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  const chips: { answer: Answer; label: string; quiet: boolean }[] = [
    { answer: "CONFIRM", label: proposal.labels.confirm, quiet: false },
    { answer: "DECLINE", label: proposal.labels.decline, quiet: true },
  ]

  return (
    <form action={handle}>
      <input type="hidden" name="proposalId" value={proposal.id} />
      <ErrorLine msg={errorMsg} marginLeft={36} />
      <ChipRow margin="8px 0 0 37px">
        {chips.map(({ answer, label, quiet }) => (
          <ChoiceChip
            key={answer}
            name="answer"
            value={answer}
            label={label}
            selected={optimisticAnswer === answer}
            quiet={quiet}
            disabled={isPending}
          />
        ))}
      </ChipRow>
    </form>
  )
}
