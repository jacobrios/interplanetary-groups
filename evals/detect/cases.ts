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
  {
    id: "bare-ask-one-plan",
    bucket: "must-recognize",
    description:
      "Same bare ask with only one plan on the calendar. The target is unambiguous, so the honest answer is to ask what time.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Priya", body: "see you all there", minutesAgo: 40 }],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply" },
  },
  {
    id: "bare-ask-no-plans",
    bucket: "must-recognize",
    description:
      "A bare ask with nothing on the calendar. The ladder has an honest answer for this and it must get the chance to give it.",
    calendar: [],
    history: [{ author: "Jo", body: "quiet week", minutesAgo: 90 }],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply", replyContains: "I don't see any plans" },
  },
  {
    id: "indirect-push-later",
    bucket: "must-recognize",
    description:
      "An indirect ask with a plan-shaped verb and no time. Politeness is not the same as not asking.",
    calendar: [{ title: "Beers", label: "beers", minutesFromNow: 60 * 50 }],
    history: [{ author: "Priya", body: "looking forward to it", minutesAgo: 30 }],
    trigger: { author: "Sam", body: "any chance we push it later?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "reschedule-word",
    bucket: "must-recognize",
    description: "The plainest possible ask with no time attached.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 20 }],
    history: [{ author: "Jo", body: "excited", minutesAgo: 55 }],
    trigger: { author: "Sam", body: "can we reschedule?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "correction-names-plan",
    bucket: "must-recognize",
    description:
      "The owner's 28 July correction failure. Names a plan, names no time, arrives right after Orbit acted on the wrong one. Which rung answers it depends on whether the model carries the time from the exchange, and both are honest.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Sam", body: "can we do 9 instead?", minutesAgo: 20 },
      {
        author: "Orbit",
        body: "Sounds like you want climbing moved to 9am. Want me to make the change?",
        minutesAgo: 19,
      },
      { author: "Sam", body: "yes", minutesAgo: 17 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 16 },
    ],
    trigger: { author: "Sam", body: "sorry i meant beers, not climbing" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "follow-up-bare-hour",
    bucket: "must-recognize",
    description:
      "A bare hour following a discussion about one specific plan. Tests that the window is doing its job as well as that recognition fires.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Priya", body: "is beers still on for friday?", minutesAgo: 25 },
      { author: "Jo", body: "yep, 7", minutesAgo: 24 },
    ],
    trigger: { author: "Sam", body: "can we do 9 instead?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "put-it-back",
    bucket: "must-recognize",
    description:
      "A revert is just another change request. Names no clock time of its own, which is exactly the shape the deleted guard used to kill.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "9 is rough for me honestly", minutesAgo: 15 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 40 },
    ],
    trigger: { author: "Sam", body: "put it back" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "venue-ask-two-plans",
    bucket: "must-recognize",
    description:
      "A venue ask must still reach its honest decline, which never needed to know the target. This is the third of the owner's 28 July failures and it must not regress while recognition is being loosened.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [{ author: "Priya", body: "where are we meeting?", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "can we move it to tony's?" },
    memberCount: 4,
    expected: { kind: "change", action: "reply", replyContains: "spot" },
  },
  {
    id: "bare-ask-long-history",
    bucket: "must-recognize",
    description:
      "The same bare ask under a full window's worth of chatter, so the plan talk sits near the edge of what Orbit is sent. Twenty-four prior messages against a nineteen-message cap.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "climbing at 8 still good?", minutesAgo: 300 },
      { author: "Priya", body: "yep", minutesAgo: 295 },
      { author: "Sam", body: "cool", minutesAgo: 290 },
      { author: "Jo", body: "anyone seen my chalk bag", minutesAgo: 200 },
      { author: "Priya", body: "no", minutesAgo: 195 },
      { author: "Sam", body: "haha", minutesAgo: 190 },
      { author: "Jo", body: "it was in my car", minutesAgo: 185 },
      { author: "Priya", body: "classic", minutesAgo: 180 },
      { author: "Sam", body: "lol", minutesAgo: 175 },
      { author: "Jo", body: "weather looks ok", minutesAgo: 170 },
      { author: "Priya", body: "nice", minutesAgo: 165 },
      { author: "Sam", body: "finally", minutesAgo: 160 },
      { author: "Jo", body: "new shoes arrived", minutesAgo: 155 },
      { author: "Priya", body: "which ones", minutesAgo: 150 },
      { author: "Sam", body: "the red ones", minutesAgo: 145 },
      { author: "Jo", body: "nice", minutesAgo: 140 },
      { author: "Priya", body: "jealous", minutesAgo: 135 },
      { author: "Sam", body: "they were on sale", minutesAgo: 130 },
      { author: "Jo", body: "link?", minutesAgo: 125 },
      { author: "Priya", body: "sent it", minutesAgo: 120 },
      { author: "Sam", body: "thanks", minutesAgo: 115 },
      { author: "Jo", body: "ok see you all soon", minutesAgo: 110 },
      { author: "Priya", body: "yep", minutesAgo: 105 },
      { author: "Sam", body: "👍", minutesAgo: 100 },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "agreement",
    bucket: "must-stay-quiet",
    description: "Plain agreement. Nothing is being asked of Orbit.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "climbing at 8 works for me", minutesAgo: 10 }],
    trigger: { author: "Sam", body: "sounds good" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "reaction-to-orbit-move",
    bucket: "must-stay-quiet",
    description:
      "The nearest neighbour of the owner's failure: same position in the feed, right after Orbit moved a plan, but a reaction rather than an ask. If loosening recognition breaks anything, it breaks here first.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Jo", body: "yeah 9 is better", minutesAgo: 14 },
      { author: "Orbit", body: "Done, climbing is at 9am now.", minutesAgo: 12 },
    ],
    trigger: { author: "Sam", body: "nice, thanks orbit" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "move-on-topic",
    bucket: "must-stay-quiet",
    description:
      "A movement verb that has nothing to do with a plan. This is the false-positive option A is explicitly not supposed to buy.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "anyway that's settled", minutesAgo: 8 }],
    trigger: { author: "Sam", body: "should we move on?" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "info-question",
    bucket: "must-stay-quiet",
    description:
      "A question that only asks for information about an existing plan. The prompt bullet covering this is being narrowed in Task 5, so this case is what proves the narrowing did not go too far.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "see you tomorrow", minutesAgo: 30 }],
    trigger: { author: "Sam", body: "what time again?" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "availability-late",
    bucket: "must-stay-quiet",
    description: "Availability, not a request. Sam is telling people, not asking Orbit.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 2 }],
    history: [{ author: "Jo", body: "heading over now", minutesAgo: 5 }],
    trigger: { author: "Sam", body: "running late, start without me" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "availability-cant-make",
    bucket: "must-stay-quiet",
    description:
      "Names a clock time and a problem, but asks for nothing. The closest a stay-quiet case gets to a change request without being one.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8am tomorrow then", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "I can't make 8" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "commentary-wish",
    bucket: "must-stay-quiet",
    description: "A wish about a time that does not ask for anything to change.",
    calendar: [{ title: "Beers", label: "beers", minutesFromNow: 60 * 50 }],
    history: [{ author: "Jo", body: "beers at 7 friday", minutesAgo: 25 }],
    trigger: { author: "Sam", body: "9 would've been better" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "small-talk",
    bucket: "must-stay-quiet",
    description: "No activity and no plan in it at all.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "did you see that video", minutesAgo: 12 }],
    trigger: { author: "Sam", body: "haha same" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "agrees-with-live-proposal",
    bucket: "must-stay-quiet",
    description:
      "Agreement while a group proposal is open. The chips handle this; a message is not a vote. Guards the prompt rule that a live proposal makes agreement neither a spark nor a change request.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [
      { author: "Priya", body: "can we push climbing to 9?", minutesAgo: 6 },
      {
        author: "Orbit",
        body: "Priya wants to move climbing to 9am. Does that work?",
        minutesAgo: 5,
      },
    ],
    liveProposal: { planIndex: 0, proposedMinutesFromNow: 60 * 31, asker: "Priya" },
    trigger: { author: "Sam", body: "yeah that works for me" },
    memberCount: 4,
    expected: { kind: "none" },
  },
  {
    id: "might-be-late-implies-move",
    bucket: "ambiguous",
    description:
      "Reads as availability and as a hint that the time should move. No right answer; recorded to watch which way the dial drifts.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8am start", minutesAgo: 20 }],
    trigger: { author: "Sam", body: "I might be late again, 8 is rough" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "group-grumble",
    bucket: "ambiguous",
    description:
      "Commentary on behalf of the group that stops just short of asking. Watched, not barred.",
    calendar: [{ title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 }],
    history: [{ author: "Jo", body: "8 is early", minutesAgo: 15 }],
    trigger: { author: "Sam", body: "nobody really likes 8 do they" },
    memberCount: 4,
    expected: { kind: "change" },
  },
  {
    id: "referent-past-the-window",
    bucket: "ambiguous",
    description:
      "The plan being referred to was discussed further back than the nineteen prior messages Orbit is sent, so the trigger arrives with its referent trimmed away. Records what Orbit does when the window genuinely cannot help.",
    calendar: [
      { title: "Climbing", label: "climbing", minutesFromNow: 60 * 30 },
      { title: "Beers", label: "beers", minutesFromNow: 60 * 76 },
    ],
    history: [
      { author: "Jo", body: "beers is the one I want to shift", minutesAgo: 400 },
      { author: "Priya", body: "ok", minutesAgo: 395 },
      { author: "Sam", body: "sure", minutesAgo: 390 },
      { author: "Jo", body: "unrelated: chalk bag found", minutesAgo: 200 },
      { author: "Priya", body: "good", minutesAgo: 195 },
      { author: "Sam", body: "nice", minutesAgo: 190 },
      { author: "Jo", body: "weather ok", minutesAgo: 185 },
      { author: "Priya", body: "yep", minutesAgo: 180 },
      { author: "Sam", body: "cool", minutesAgo: 175 },
      { author: "Jo", body: "new shoes", minutesAgo: 170 },
      { author: "Priya", body: "which", minutesAgo: 165 },
      { author: "Sam", body: "red", minutesAgo: 160 },
      { author: "Jo", body: "nice", minutesAgo: 155 },
      { author: "Priya", body: "jealous", minutesAgo: 150 },
      { author: "Sam", body: "on sale", minutesAgo: 145 },
      { author: "Jo", body: "link", minutesAgo: 140 },
      { author: "Priya", body: "sent", minutesAgo: 135 },
      { author: "Sam", body: "thanks", minutesAgo: 130 },
      { author: "Jo", body: "see you soon", minutesAgo: 125 },
      { author: "Priya", body: "yep", minutesAgo: 120 },
      { author: "Sam", body: "👍", minutesAgo: 115 },
    ],
    trigger: { author: "Sam", body: "can we move it?" },
    memberCount: 4,
    expected: { kind: "change" },
  },
]
