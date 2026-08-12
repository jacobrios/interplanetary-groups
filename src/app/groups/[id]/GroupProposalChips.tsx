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
// Styling comes from the shared choice grammar (src/components/choice.tsx),
// same as GaugeChips: neutral outlined pills, never lime, never teal-filled,
// emphasis by text brightness, chosen chip marked with a checkmark prefix
// (never colour alone), optimistic flip reverted by the transition if the
// write fails, error string rendered above the chips and never posted to
// the feed as a message.

import { useOptimistic, useTransition, useState } from "react"
import { ProposalVoteAnswer } from "@prisma/client"
import { proposalVoteAction } from "@/app/actions/proposal-vote"
import { ChoiceChip, ChipRow, ErrorLine, TallyLine } from "@/components/choice"

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
  onAnswered?: (answer: ProposalVoteAnswer) => void
  /**
   * Whether this chip row (and its tally line) sits under Orbit's avatar and
   * should indent past it (the feed). False renders both flush left instead,
   * for surfaces with no avatar to align under (the pending panel —
   * pending-surface.css's `.pd-row .gh-qr` override, `9px 0 0`). Defaults to
   * the feed's indented value so nothing in the chat feed changes.
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

      {/* Where things stand, below the chips (mirrors GaugeTally inside the
          bubble; here it sits under the row since the chips, not a bubble,
          are what it's reporting on). Exported separately so MessageFeed can
          render it alone for a non-member, who gets the tally as feed history
          but no vote of their own. */}
      <GroupProposalTally line={proposal.tallyLine} indentPastAvatar={rowMargin ? false : indentPastAvatar} />
    </form>
  )
}

/**
 * The quiet tally line. Rendered only once somebody has voted: an empty bar
 * is noise the chips already imply. Exported so MessageFeed can render it on
 * its own for a non-member (tally is feed history for everyone; the vote
 * itself is member-gated).
 */
export function GroupProposalTally({
  line,
  indentPastAvatar = true,
}: {
  line: string
  /** See the same-named prop on GroupProposalChips: keeps this tally's indent matching its chip row's. */
  indentPastAvatar?: boolean
}) {
  return <TallyLine line={line} marginLeft={indentPastAvatar ? 37 : 0} />
}
