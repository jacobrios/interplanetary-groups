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
  onAnswered?: (answer: ProposalVoteAnswer) => void
  /**
   * Whether this chip row (and its tally line) sits under Orbit's avatar and
   * should indent past it (the feed). False renders both flush left instead,
   * for surfaces with no avatar to align under (the pending panel —
   * pending-surface.css's `.pd-row .gh-qr` override, `9px 0 0`). Defaults to
   * the feed's indented value so nothing in the chat feed changes.
   */
  indentPastAvatar?: boolean
}

export default function GroupProposalChips({ proposal, onAnswered, indentPastAvatar = true }: Props) {
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

  return (
    <form action={handle}>
      <input type="hidden" name="proposalId" value={proposal.id} />

      {errorMsg && (
        <p
          style={{
            fontSize: "var(--type-meta)",
            lineHeight: "var(--leading-normal)",
            color: "#f87171",
            margin: indentPastAvatar ? "0.5rem 0 0 36px" : "0.5rem 0 0",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Wrapping row, indented past Orbit's avatar so the chips read as part
          of its message rather than as a new speaker. Flush left instead on
          a surface with no avatar (indentPastAvatar={false}). */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "7px",
          margin: indentPastAvatar ? "8px 0 0 37px" : "9px 0 0",
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
                backgroundColor: selected ? "var(--surface-self)" : "transparent",
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
      <GroupProposalTally line={proposal.tallyLine} indentPastAvatar={indentPastAvatar} />
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
  if (!line) return null

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        // Recorded deviation (build-notes §11): this tally sits below the
        // chip row rather than inside a bubble like GaugeTally, so it keeps
        // its own left-indent (37px, matching the chip row) in addition to
        // the shared hairline treatment below. Flush left instead when the
        // chip row itself is flush (indentPastAvatar={false}).
        marginTop: 9,
        marginLeft: indentPastAvatar ? 37 : 0,
        paddingTop: 9,
        borderTop: "1.4px solid var(--hairline)",
        fontSize: "var(--type-label)",
        lineHeight: "var(--leading-normal)",
        color: "var(--text-secondary)",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <i
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "var(--text-secondary)",
          flexShrink: 0,
        }}
      />
      {line}
    </span>
  )
}
