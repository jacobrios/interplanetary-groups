// src/app/groups/[id]/GaugeChips.tsx
"use client"

// The three one-tap answers under Orbit's gauge message, and the quiet tally
// line that sits inside the bubble above them.
//
// Styling comes from the shared choice grammar (src/components/choice.tsx):
// ChoiceChip renders the wrapping row's pills, ChipRow the row itself,
// ErrorLine the error string. Never lime (Orbit's cue, not an action) and
// never teal-filled: teal marks a genuine action weight, not a
// single-per-screen count (CLAUDE.md §color, amended 27 July 2026), and
// since the strip-placement call (11 Aug 2026) the pending strip also
// carries a translucent teal wash on this screen.
//
// Emphasis is carried by text brightness, not by a second border colour: the
// spec sheet's two border tokens are the same hex, so all three chips share
// one border and only the yes chip gets full-strength text.  That also
// satisfies the accessibility rule directly (brightness, never hue).
//
// The chosen chip is marked with a checkmark prefix, never by colour alone —
// the same rule and the same idiom as RsvpControls.
//
// Optimistic pattern mirrors RsvpControls: the chip flips instantly on tap and
// useOptimistic reverts it if the transition settles without a matching
// revalidatePath (i.e. the write failed).  The tally line is server-derived,
// so it follows a beat later when the page re-renders.

import { useOptimistic, useTransition, useState } from "react"
import { GaugeAnswer } from "@prisma/client"
import { gaugeVoteAction } from "@/app/actions/gauge-vote"
import { ChoiceChip, ChipRow, ErrorLine, TallyLine } from "@/components/choice"

/** Structurally matches ChipLabels in lib/orbit/spark-copy.ts, which composes them. */
export interface FeedGaugeLabels {
  in: string
  out: string
  notThatDay: string
}

export interface FeedGauge {
  id: string
  /** The Orbit message this renders under. */
  orbitMessageId: string
  /** Composed server-side; empty string before anyone has voted. */
  tallyLine: string
  labels: FeedGaugeLabels
  viewerAnswer: GaugeAnswer | null
}

interface Props {
  gauge: FeedGauge
  onAnswered?: (answer: GaugeAnswer) => void
  /**
   * Whether this chip row sits under Orbit's avatar and should indent past
   * it (the feed). False renders flush left instead, for surfaces with no
   * avatar to align under (the pending panel — pending-surface.css's
   * `.pd-row .gh-qr` override, `9px 0 0`). Defaults to the feed's indented
   * value so nothing in the chat feed changes.
   */
  indentPastAvatar?: boolean
  /** Card surfaces (IdeaCard, ProposalBand) pass an explicit margin; feed callers leave it unset. */
  rowMargin?: string
}

export default function GaugeChips({ gauge, onAnswered, indentPastAvatar = true, rowMargin }: Props) {
  const [optimisticAnswer, setOptimisticAnswer] = useOptimistic(gauge.viewerAnswer)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      const next = formData.get("answer") as GaugeAnswer
      setErrorMsg(null)
      setOptimisticAnswer(next)
      const result = await gaugeVoteAction({}, formData)
      if (result?.errors?.general) {
        setErrorMsg(result.errors.general)
      } else {
        onAnswered?.(next)
      }
    })
  }

  const chips: { answer: GaugeAnswer; label: string; quiet: boolean }[] = [
    { answer: GaugeAnswer.IN, label: gauge.labels.in, quiet: false },
    { answer: GaugeAnswer.OUT, label: gauge.labels.out, quiet: true },
    { answer: GaugeAnswer.NOT_THAT_DAY, label: gauge.labels.notThatDay, quiet: true },
  ]

  // Wrapping row, indented past Orbit's avatar so the chips read as part of
  // its message rather than as a new speaker. Flush left instead on a
  // surface with no avatar (indentPastAvatar={false}), or a card surface's
  // own explicit rowMargin.
  const rowMarginValue = rowMargin ?? (indentPastAvatar ? "8px 0 0 37px" : "9px 0 0")
  const errorMarginLeft = indentPastAvatar && !rowMargin ? 36 : 0

  return (
    <form action={handle}>
      <input type="hidden" name="gaugeId" value={gauge.id} />
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

/**
 * The quiet line inside Orbit's bubble showing where things stand. Rendered
 * only once somebody has voted: "nobody is in yet" is noise the chips already
 * imply.
 */
export function GaugeTally({ line }: { line: string }) {
  return <TallyLine line={line} />
}
