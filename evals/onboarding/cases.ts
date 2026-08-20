// evals/onboarding/cases.ts
//
// Onboarding eval fixtures: a founder's own words in, and the structured
// understanding the product should end up holding. NOT a test file. These hit
// the real model, vary run to run, and are scored as a rate rather than
// passing or failing. The filename deliberately avoids *.test.ts so Vitest's
// default glob never collects them into CI, where they would cost money on
// every run.
//
// Two model calls share this bench because they share a schema, a set of
// field rules, and a normalize layer: extraction (step 1) and the gap-ask
// merge. Case ids are prefixed `extract-` and `merge-` so the CLI's
// id-substring filter selects one family for free.
//
// Every assertion here carries a bar. There is deliberately no bucket
// vocabulary: detect's four buckets were earned case by case and copying
// them without their history would be cargo cult. If a case turns out to have
// no right answer, that is a conversation, not a looser assertion.

import { readClarifyingQuestion, validateQuestion } from "../../src/lib/orbit/gap"
import {
  normalizeExtraction,
  type MissingField,
  type NormalizedOnboarding,
} from "../../src/lib/orbit/normalize"
import type { StoredRhythm } from "../../src/lib/orbit/rhythm"

/**
 * What an assertion is handed. Facts only, never the raw claim.
 *
 * `normalized` is the claim-to-fact boundary's own output, which is what most
 * assertions read. `question` is the one field the founder can see that
 * `normalizeExtraction` does not carry: the gap-ask question travels beside
 * the normalized profile in production (gap.ts reads it off the raw response
 * and puts it through `validateQuestion` before it can reach a screen). It is
 * included here in its already-validated form, so a case still grades a fact
 * the product would act on rather than a raw string the model handed back.
 */
export interface OnboardingOutcome {
  normalized: NormalizedOnboarding
  /** The question the product would actually show, or null if it fell back to a template. */
  question: string | null
}

/** Raw claim to graded fact, through the product's own two gates. */
export function toOutcome(raw: unknown): OnboardingOutcome {
  return {
    normalized: normalizeExtraction(raw),
    question: validateQuestion(readClarifyingQuestion(raw)),
  }
}

export interface Assertion {
  /** Printed on the scoreboard and next to a failure. Name the field, not the mechanism. */
  name: string
  check: (o: OnboardingOutcome) => boolean
}

/**
 * `description` is why the case exists, matching evals/detect/cases.ts, and it
 * is what prints next to a failure. The founder's own words live in
 * `founderDescription`, kept apart so the two never read as one field.
 */
export interface ExtractCase {
  id: string
  kind: "extract"
  description: string
  /** Free text, exactly as a founder would type it into onboarding step 1. */
  founderDescription: string
  assertions: Assertion[]
}

/** A `MergeCase` with `kind: "merge"` joins this union in the merge task. */
export type OnboardingCase = ExtractCase

// ---------------------------------------------------------------------------
// Shared readers. Assertions stay one expression long so a case reads as a
// list of claims rather than a list of null checks.
// ---------------------------------------------------------------------------

function primaryOf(n: NormalizedOnboarding): StoredRhythm | null {
  return n.rhythms.length > 0 ? n.rhythms[0] : null
}

function groupNameOf(n: NormalizedOnboarding): string | null {
  return n.groupName
}

function sameDays(actual: number[] | null, want: number[]): boolean {
  if (actual === null) return false
  const a = [...actual].sort((x, y) => x - y)
  const b = [...want].sort((x, y) => x - y)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ---------------------------------------------------------------------------
// The name assertions, applied to every case.
// ---------------------------------------------------------------------------

/**
 * All seven weekday names and their three-letter abbreviations, matched as
 * whole words and case-insensitively. Whole-word matching is what keeps
 * "Sunday" from being caught twice and keeps a name like "Satellite" clean;
 * it also means a four-letter abbreviation ("Tues", "Thurs") is not covered,
 * which is a known and accepted limit of this predicate.
 */
const WEEKDAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_WORDS.join("|")})\\b`, "i")

/**
 * Every name assertion requires a real string, so a null or blank name reads
 * as four red lines rather than three vacuous greens. A missing name is a
 * total failure of the field and the board should say so four times over.
 */
const NAME_ASSERTIONS: Assertion[] = [
  {
    name: "name: non-empty",
    check: (o) => {
      const n = groupNameOf(o.normalized)
      return typeof n === "string" && n.trim().length > 0
    },
  },
  {
    name: "name: no weekday word",
    check: (o) => {
      const n = groupNameOf(o.normalized)
      return typeof n === "string" && n.trim().length > 0 && !WEEKDAY_RE.test(n)
    },
  },
  {
    name: "name: three words or fewer",
    check: (o) => {
      const n = groupNameOf(o.normalized)
      if (typeof n !== "string" || n.trim().length === 0) return false
      return n.trim().split(/\s+/).length <= 3
    },
  },
  {
    name: "name: letters, numbers and spaces only",
    check: (o) => {
      const n = groupNameOf(o.normalized)
      return typeof n === "string" && /^[A-Za-z0-9 ]+$/.test(n)
    },
  },
]

// ---------------------------------------------------------------------------
// Structured assertion builders, so a case reads as what the founder said.
// ---------------------------------------------------------------------------

const statusReady: Assertion = {
  name: "status is ready",
  check: (o) => o.normalized.status === "ready",
}

function statusIncomplete(missing: MissingField): Assertion {
  return {
    name: `status is incomplete, gap "${missing}"`,
    check: (o) => o.normalized.status === "incomplete" && o.normalized.missing === missing,
  }
}

function activityIs(want: string): Assertion {
  return {
    name: `activity is "${want}"`,
    check: (o) => (primaryOf(o.normalized)?.activity ?? "").trim().toLowerCase() === want,
  }
}

function titleIs(want: string): Assertion {
  return {
    name: `title is "${want}"`,
    check: (o) => primaryOf(o.normalized)?.title === want,
  }
}

const cadenceWeekly: Assertion = {
  name: "cadence is weekly",
  check: (o) => primaryOf(o.normalized)?.cadence === "weekly",
}

function daysAre(want: number[]): Assertion {
  return {
    name: `days are [${want.join(", ")}]`,
    check: (o) => sameDays(primaryOf(o.normalized)?.daysOfWeek ?? null, want),
  }
}

function timeIs(want: string): Assertion {
  return {
    name: `time is "${want}"`,
    check: (o) => primaryOf(o.normalized)?.timeLocal === want,
  }
}

/**
 * The normalized surface of `timeAmbiguous`. An ambiguous reading nulls the
 * time and stashes the guess in `candidateTimeLocal`, so an empty candidate
 * is the fact that says the model did not hedge. Distinct from `timeIs`,
 * which would also pass if the hedge simply never happened to be read back.
 */
const timeNotAmbiguous: Assertion = {
  name: "time not read as ambiguous",
  check: (o) => o.normalized.status === "ready" || o.normalized.candidateTimeLocal === null,
}

const venueIsNull: Assertion = {
  name: "venue is null",
  check: (o) => (primaryOf(o.normalized)?.venueName ?? null) === null,
}

const questionIsAskable: Assertion = {
  name: "clarifying question survives as something to ask",
  check: (o) => o.question !== null,
}

export const CASES: OnboardingCase[] = [
  {
    id: "extract-multi-day",
    kind: "extract",
    description:
      "The case the whole slice exists for: a rhythm on three days at once. The title must be the activity alone, and the group name must not pick one of the three days and call the group after it.",
    founderDescription: "we climb on Mondays, Wednesdays and Fridays at 8 AM",
    assertions: [
      statusReady,
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([1, 3, 5]),
      timeIs("08:00"),
      timeNotAmbiguous,
      titleIs("Climbing"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-single-day",
    kind: "extract",
    description:
      "One day, one clear time, and a two-word activity. The title is the title-cased activity and nothing else, which is the behavior the title task shipped.",
    founderDescription: "we play board games every Thursday at 7pm",
    assertions: [
      statusReady,
      activityIs("board games"),
      cadenceWeekly,
      daysAre([4]),
      timeIs("19:00"),
      timeNotAmbiguous,
      titleIs("Board Games"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-no-time",
    kind: "extract",
    description:
      "A stated day with no time at all. The completeness gate must hold the founder at the time gap, and the model's own question must be good enough to put on the screen rather than falling back to the template.",
    founderDescription: "we climb every Tuesday",
    assertions: [
      statusIncomplete("time"),
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([2]),
      questionIsAskable,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-with-venue",
    kind: "extract",
    description:
      "A place named in the same breath as the activity. Guards the prompt's 'never move the place into activity' rule: the activity must stay the activity and the place must land in venueName.",
    founderDescription: "we climb at Summit Gym on Tuesdays at 7pm",
    assertions: [
      statusReady,
      activityIs("climbing"),
      {
        name: "activity holds no venue words",
        check: (o) => !/summit|gym/i.test(primaryOf(o.normalized)?.activity ?? ""),
      },
      {
        name: 'venue holds "Summit Gym"',
        check: (o) =>
          (primaryOf(o.normalized)?.venueName ?? "").toLowerCase().includes("summit gym"),
      },
      cadenceWeekly,
      daysAre([2]),
      timeIs("19:00"),
      timeNotAmbiguous,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-no-venue",
    kind: "extract",
    description:
      "No place mentioned anywhere. Guards 'never invent a venue', a prompt rule nothing currently proves.",
    founderDescription: "we climb every Sunday at 9am",
    assertions: [statusReady, venueIsNull, ...NAME_ASSERTIONS],
  },
  {
    id: "extract-two-rhythms",
    kind: "extract",
    description:
      "Two activities where only the second one stated is schedulable. Guards primary promotion and the position-zero guarantee: the schedulable rhythm must be at [0] and the loose one must survive rather than being dropped.",
    founderDescription: "we do beers once a month, and we climb every Wednesday at 6pm",
    assertions: [
      statusReady,
      {
        name: "both rhythms survive",
        check: (o) => o.normalized.rhythms.length === 2,
      },
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([3]),
      timeIs("18:00"),
      timeNotAmbiguous,
      ...NAME_ASSERTIONS,
    ],
  },
]
