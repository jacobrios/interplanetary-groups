// src/app/groups/[id]/GaugeChips.tsx
"use client"

// The three one-tap answers under Orbit's gauge message, and the quiet tally
// line that sits inside the bubble above them.
//
// Styling per docs/design/orbit-suggestion-chips-spec.html: a wrapping row of
// neutral outlined pills, indented under the bubble, --type-label at weight
// 600.  Never lime (Orbit's cue, not an action) and never teal-filled (teal is
// the one primary action per screen, which on this screen is the event card's
// "I'm in").
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
}

export default function GaugeChips({ gauge, onAnswered, indentPastAvatar = true }: Props) {
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

  return (
    <form action={handle}>
      <input type="hidden" name="gaugeId" value={gauge.id} />

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
                // other two sit back. A chosen chip comes forward whichever it is.
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

/**
 * The quiet line inside Orbit's bubble showing where things stand. Rendered
 * only once somebody has voted: "nobody is in yet" is noise the chips already
 * imply.
 */
export function GaugeTally({ line }: { line: string }) {
  if (!line) return null

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: 9,
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
