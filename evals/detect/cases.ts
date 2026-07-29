// evals/detect/cases.ts
//
// Recognition eval fixtures: a short setting, one message, and the outcome a
// member should experience. NOT a test file. These hit the real model, vary
// run to run, and are scored as a rate rather than passing or failing. The
// filename deliberately avoids *.test.ts so Vitest's default glob never
// collects them into CI, where they would cost money on every run.

export type Bucket = "must-recognize" | "must-stay-quiet" | "ambiguous"

/**
 * What the member should end up seeing. `action` is optional on purpose: for
 * some asks more than one ladder rung is a correct, non-silent answer (a bare
 * "can we move it?" is answered honestly by either a which-plan or a which-time
 * question, depending on whether the model resolved the target), and pinning
 * one of them would fail the bench for being right in the other way.
 */
export type Expected =
  | { kind: "none" }
  | { kind: "spark" }
  | {
      kind: "change"
      action?: "reply" | "ask" | "propose" | "move"
      /** Substring of the reply, question, or announcement Orbit produced. */
      replyContains?: string
    }

export interface CalendarPlan {
  title: string
  /** What Orbit calls the plan in copy. */
  label: string
  /** Minutes into the future from the run's now-anchor. Must be positive. */
  minutesFromNow: number
}

export interface HistoryLine {
  /** A member's name, or the literal "Orbit". */
  author: string
  body: string
  /** Minutes before the run's now-anchor. Must be positive. */
  minutesAgo: number
}

export interface EvalCase {
  id: string
  bucket: Bucket
  /** Why this case exists. Printed next to a failure. */
  description: string
  /** Plans on the calendar, in the order the group's carousel shows them. */
  calendar: CalendarPlan[]
  /** Prior feed messages, oldest first. Trimmed to the window by the runner. */
  history: HistoryLine[]
  /** The message being classified. Always the newest thing in the feed. */
  trigger: { author: string; body: string }
  /** A live group proposal, when one is open. */
  liveProposal?: { planIndex: number; proposedMinutesFromNow: number; asker: string }
  memberCount: number
  expected: Expected
}

export const CASES: EvalCase[] = [
  {
    id: "bare-ask-after-move",
    bucket: "must-recognize",
    description:
      "The owner's 29 July failure, verbatim. A bare ask sent right after Orbit announced a consensus move got silence. Nothing here names a plan or a time, and that is the point: the ladder answers this shape with a question, so recognition must not eat it first.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Sam", body: "can we push climbing to 9?", minutesAgo: 22 },
      { author: "Priya", body: "works for me", minutesAgo: 18 },
      { author: "Jo", body: "yeah 9 is better", minutesAgo: 14 },
      {
        author: "Orbit",
        body: "Done, climbing is at 9am now. Everyone's answer got cleared, so have another look when you get a sec.",
        minutesAgo: 12,
      },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
]
