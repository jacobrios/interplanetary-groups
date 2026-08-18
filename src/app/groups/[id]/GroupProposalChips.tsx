// src/app/groups/[id]/GroupProposalChips.tsx
"use client"

// The two one-tap answers under Orbit's group consensus question.
//
// A quiet tally line sat below them until the event-copy pass (17 Aug 2026)
// deleted it, with nothing in its place: the checkmark on the chosen chip is
// the confirmation that a vote landed, and Orbit announces a passed change in
// the feed. Reasoning in lib/orbit/change-copy.ts.
//
// Unlike ProposalChips (the asker-only confirm/decline for part one), this
// vote is a standing member answer that the bar can clear or fail to clear
// over multiple taps, so the viewer's prior vote seeds the optimistic state
// exactly like GaugeChips does (never a fresh null the way ProposalChips
// starts, since ProposalChips only ever fires once before it vanishes).
//
// Styling comes from the shared choice grammar (src/components/choice.tsx),
// same as GaugeChips: neutral outlined pills, never lime, never teal-filled,
// emphasis by text brightness, chosen chip marked with a checkmark prefix
// (never colour alone), optimistic flip reverted by the transition if the
// write fails, error string rendered above the chips and never posted to
// the feed as a message.

import { useOptimistic, useTransition, useState } from "react"
import { ProposalVoteAnswer } from "@prisma/client"
import { proposalVoteAction } from "@/app/actions/proposal-vote"
import { ChoiceChip, ChipRow, ErrorLine } from "@/components/choice"

export interface FeedGroupProposal {
  id: string
  /** The Orbit message this renders under. */
  orbitMessageId: string
  labels: { yes: string; keep: string }
  viewerAnswer: ProposalVoteAnswer | null
}

interface Props {
  proposal: FeedGroupProposal
  onAnswered?: (answer: ProposalVoteAnswer) => void
  /**
   * Whether this chip row sits under Orbit's avatar and should indent past it
   * (the feed). False renders it flush left instead, for a surface with no
   * avatar to align under (the event screen's band). Defaults to the feed's
   * indented value so nothing in the chat feed changes.
   */
  indentPastAvatar?: boolean
  /** Card surfaces (IdeaCard, ProposalBand) pass an explicit margin; feed callers leave it unset. */
  rowMargin?: string
}

export default function GroupProposalChips({
  proposal,
  onAnswered,
  indentPastAvatar = true,
  rowMargin,
}: Props) {
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
      } else {
        onAnswered?.(next)
      }
    })
  }

  const chips: { answer: ProposalVoteAnswer; label: string; quiet: boolean }[] = [
    { answer: ProposalVoteAnswer.YES, label: proposal.labels.yes, quiet: false },
    { answer: ProposalVoteAnswer.KEEP, label: proposal.labels.keep, quiet: true },
  ]

  // Wrapping row, indented past Orbit's avatar so the chips read as part of
  // its message rather than as a new speaker. Flush left instead on a
  // surface with no avatar (indentPastAvatar={false}), or a card surface's
  // own explicit rowMargin.
  const rowMarginValue = rowMargin ?? (indentPastAvatar ? "8px 0 0 37px" : "9px 0 0")
  const errorMarginLeft = indentPastAvatar && !rowMargin ? 36 : 0

  return (
    <form action={handle}>
      <input type="hidden" name="proposalId" value={proposal.id} />
      <ErrorLine msg={errorMsg} marginLeft={errorMarginLeft} />
      <ChipRow margin={rowMarginValue}>
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
