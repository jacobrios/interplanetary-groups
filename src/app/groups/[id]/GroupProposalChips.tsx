// src/app/groups/[id]/GroupProposalChips.tsx
"use client"

// The two one-tap answers under Orbit's group consensus question, plus the
// quiet tally line that sits below them showing where things stand.
//
// Unlike ProposalChips (the asker-only confirm/decline for part one), this
// vote is a standing member answer that the bar can clear or fail to clear
// over multiple taps, so the viewer's prior vote seeds the optimistic state
// exactly like GaugeChips does (never a fresh null the way ProposalChips
// starts, since ProposalChips only ever fires once before it vanishes).
//
// Styling and behavior otherwise mirror GaugeChips: neutral outlined pills,
// never lime, never teal-filled, emphasis by text brightness, chosen chip
// marked with a checkmark prefix (never colour alone), optimistic flip
// reverted by the transition if the write fails, error string rendered above
// the chips and never posted to the feed as a message.

import { useOptimistic, useTransition, useState } from "react"
import { ProposalVoteAnswer } from "@prisma/client"
import { proposalVoteAction } from "@/app/actions/proposal-vote"

export interface FeedGroupProposal {
  id: string
  /** The Orbit message this renders under. */
  orbitMessageId: string
  labels: { yes: string; keep: string }
  /** Composed server-side; empty string until someone has voted. */
  tallyLine: string
  viewerAnswer: ProposalVoteAnswer | null
}

interface Props {
  proposal: FeedGroupProposal
}

export default function GroupProposalChips({ proposal }: Props) {
  const [optimisticAnswer, setOptimisticAnswer] = useOptimistic(proposal.viewerAnswer)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("answer") as ProposalVoteAnswer
      setErrorMsg(null)
      setOptimisticAnswer(next)
      const result = await proposalVoteAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      }
    })
  }

  const chips: { answer: ProposalVoteAnswer; label: string; quiet: boolean }[] = [
    { answer: ProposalVoteAnswer.YES, label: proposal.labels.yes, quiet: false },
    { answer: ProposalVoteAnswer.KEEP, label: proposal.labels.keep, quiet: true },
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

      {/* Wrapping row, indented past Orbit's avatar so the chips read as part
          of its message rather than as a new speaker. */}
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
                border: "1.7px solid var(--border-subtle)",
                backgroundColor: selected
                  ? "var(--surface-self)"
                  : "var(--surface-input)",
                borderRadius: "20px",
                padding: "8px 12px",
                fontSize: "var(--type-label)",
                fontWeight: 600,
                fontFamily: "inherit",
                // Brightness, not hue: the yes chip stays full strength and the
                // keep chip sits back. A chosen chip comes forward whichever
                // it is.
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

      {/* Where things stand, below the chips (mirrors GaugeTally inside the
          bubble; here it sits under the row since the chips, not a bubble,
          are what it's reporting on). Exported separately so MessageFeed can
          render it alone for a non-member, who gets the tally as feed history
          but no vote of their own. */}
      <GroupProposalTally line={proposal.tallyLine} />
    </form>
  )
}

/**
 * The quiet tally line. Rendered only once somebody has voted: an empty bar
 * is noise the chips already imply. Exported so MessageFeed can render it on
 * its own for a non-member (tally is feed history for everyone; the vote
 * itself is member-gated).
 */
export function GroupProposalTally({ line }: { line: string }) {
  if (!line) return null

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        margin: "8px 0 0 36px",
        fontSize: "var(--type-eyebrow)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-placeholder)",
        fontWeight: 600,
      }}
    >
      <i
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "var(--text-placeholder)",
          flexShrink: 0,
        }}
      />
      {line}
    </span>
  )
}
