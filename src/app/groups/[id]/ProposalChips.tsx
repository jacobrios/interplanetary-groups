// src/app/groups/[id]/ProposalChips.tsx
"use client"

// The two one-tap answers under Orbit's change question, rendered only for
// the asker (the page composes proposal DTOs for the asker alone; the server
// action enforces the same rule).
//
// Styling and behavior mirror GaugeChips: neutral outlined pills, never lime,
// never teal-filled, emphasis by text brightness, chosen chip marked with a
// checkmark prefix, optimistic flip reverted by the transition if the write
// fails. Resolution removes the proposal server-side, so on success the chips
// vanish with the next render and the question stays as plain history.

import { useOptimistic, useTransition, useState } from "react"
import { proposalAnswerAction } from "@/app/actions/proposal-answer"

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

      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            margin: "0.5rem 0 0 36px",
          }}
        >
          {errorMsg}
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "7px",
          margin: "0.5rem 0 0 36px",
        }}
      >
        {chips.map(({ answer, label, quiet }) => {
          const selected = optimisticAnswer === answer
          return (
            <button
              key={answer}
              type="submit"
              name="answer"
              value={answer}
              disabled={isPending}
              style={{
                border: "1.7px solid var(--hairline)",
                backgroundColor: selected
                  ? "var(--surface-self)"
                  : "var(--surface-raised)",
                borderRadius: "20px",
                padding: "8px 12px",
                fontSize: "var(--type-label)",
                fontWeight: 600,
                fontFamily: "inherit",
                color:
                  quiet && !selected ? "var(--text-secondary)" : "var(--text-primary)",
                whiteSpace: "nowrap",
                cursor: isPending ? "default" : "pointer",
              }}
            >
              {selected ? `✓ ${label}` : label}
            </button>
          )
        })}
      </div>
    </form>
  )
}
