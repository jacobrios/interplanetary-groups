// src/lib/orbit/merge.ts
//
// The gap-ask merge call: one founder answer in, the complete updated
// extraction (and, if gaps remain, the next question) out — a single call
// per answer, so the founder gets exactly one labeled pause per answer.
//
// Shares the schema, field rules, and call helper with extract.ts so the
// merged claim flows through the identical normalize path. Like extraction,
// the return type is `unknown` on purpose: merge output is a claim, and
// normalize.ts turns it into a fact before any control flow reads it.
//
// Model: claude-haiku-4-5, same as extraction (product decision, flagged at
// plan review): merging one short answer into a small structure plus writing
// one short question is squarely within Haiku's range, keeps the per-answer
// pause as short as the Step 1 pause, and keeps the two calls behaviorally
// consistent.

import { FIELD_RULES, callExtractionModel } from "./extract"
import type { GapAskable } from "./gap"
import type { StoredRhythm } from "./rhythm"

/** Human phrase for the WE ASKED section, per gap. */
const ASKED_ABOUT: Record<GapAskable, string> = {
  time: "the time",
  day: "the days",
  both: "the day and time",
  cadence: "whether it repeats every week",
  ambiguous_time: "whether the time is morning or evening",
}

const MERGE_SYSTEM_PROMPT = `You are updating your understanding of a founder's recurring group. You asked the founder one clarifying question and they just answered. Merge the answer into the current understanding and return the complete updated extraction.

Merge rules:
- Latest word wins. If the answer contradicts anything in CURRENT UNDERSTANDING (a day, a time, the cadence, even the activity), the answer is right and the old value is replaced. "Actually Saturdays at 10am" replaces both the days and the time.
- Copy every field the answer does not touch character for character from CURRENT UNDERSTANDING, including activity wording. Never re-read DESCRIPTION to redo a field CURRENT UNDERSTANDING already has; DESCRIPTION is only context for reading the answer.
- The answer often settles the asked-about gap indirectly. If we asked whether a time was morning or evening and CANDIDATE TIME is "19:00", then "evening" or "at night" means timeLocal "19:00" with timeAmbiguous false, and "morning" means "07:00" with timeAmbiguous false.
- If the answer does not settle the gap ("hmm not sure", "whenever works"), keep the fields as they were.
- Each distinct recurring activity is one rhythm.

Field rules:
${FIELD_RULES}
- clarifyingQuestion, additionally: ask about whatever gap remains now. If the answer settled nothing, asking the same question again is fine.

Worked example:
DESCRIPTION: "we climb tuesdays at 7"
CURRENT UNDERSTANDING: {"suggestedGroupName":"Climbing Crew","clarifyingQuestion":null,"rhythms":[{"activity":"climbing","cadence":"weekly","daysOfWeek":[2],"timeLocal":null,"timeAmbiguous":false,"isPrimary":true}]}
CANDIDATE TIME: 19:00
WE ASKED: about whether the time is morning or evening
ANSWER: "actually saturdays at 10am"
Correct output: rhythms[0] has daysOfWeek [6], timeLocal "10:00", timeAmbiguous false, and clarifyingQuestion is null.`

export interface MergeGapCallInput {
  /** The founder's original free-text description (client-held; not yet in the DB). */
  description: string
  /** Cleaned name suggestion carried from the last round, or null. */
  groupName: string | null
  /** Current partial state, gapped primary at [0]. */
  currentState: StoredRhythm[]
  /** Best-guess reading of an ambiguous time, if that is the open gap. */
  candidateTimeLocal: string | null
  /** Which gap the rendered question asked about. */
  askedAbout: GapAskable
  /** The founder's answer, already trimmed by the caller. */
  answer: string
}

export async function mergeGapAnswer(input: MergeGapCallInput): Promise<unknown> {
  // Re-encode the stored partial state in schema shape so CURRENT
  // UNDERSTANDING reads exactly like the model's own prior output. Titles
  // are derived display data, not part of the contract, so they are not
  // sent; position zero is the primary by the position-zero guarantee.
  const currentUnderstanding = {
    suggestedGroupName: input.groupName,
    clarifyingQuestion: null,
    rhythms: input.currentState.map((r, i) => ({
      activity: r.activity,
      venueName: r.venueName ?? null,
      cadence: r.cadence,
      daysOfWeek: r.daysOfWeek,
      timeLocal: r.timeLocal,
      timeAmbiguous: false,
      isPrimary: i === 0,
    })),
  }

  const user = `DESCRIPTION:
${input.description}

CURRENT UNDERSTANDING:
${JSON.stringify(currentUnderstanding)}

CANDIDATE TIME: ${input.candidateTimeLocal ?? "none"}

WE ASKED: about ${ASKED_ABOUT[input.askedAbout]}

ANSWER:
${input.answer}`

  return callExtractionModel(MERGE_SYSTEM_PROMPT, user)
}
