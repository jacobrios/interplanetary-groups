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
import type { MergeGapCallInput } from "../../src/lib/orbit/merge"
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

/**
 * A gap-ask merge round: `mergeGapAnswer`'s exact input shape, so a case is
 * indistinguishable from a real production call. `description` here is the
 * "why this case exists" line (matching `ExtractCase`), not the founder's
 * original text; that text lives inside `input.description`, exactly where
 * `MergeGapCallInput` puts it.
 */
export interface MergeCase {
  id: string
  kind: "merge"
  description: string
  input: MergeGapCallInput
  assertions: Assertion[]
}

export type OnboardingCase = ExtractCase | MergeCase

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

/**
 * An exact group name, not just the four shape checks in NAME_ASSERTIONS.
 * Reserved for a case where the founder's own words already spell out a
 * plausible name, so there is one right answer worth pinning rather than
 * just a shape to hold.
 */
function groupNameIs(want: string): Assertion {
  return {
    name: `name is "${want}"`,
    check: (o) => groupNameOf(o.normalized) === want,
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

  // -------------------------------------------------------------------------
  // Day-prominent and own-words cases (added 20 Aug 2026). The six cases
  // above all lead with the activity ("we climb...", "we play..."), so none
  // of them can see the failure an ad-hoc probe found afterward: the weekday
  // rule is not a uniform 1-in-15, it is concentrated in descriptions where
  // the day is the most distinctive thing the founder said. The probe ran
  // each of the four founder texts below 5 times against the real production
  // path. These four cases exist so the bench can see that shape itself
  // rather than take the probe's word for it. Two are expected to fail often;
  // two are pinned because they already pass, and a bench that only holds
  // failures cannot show a fix helping later.
  // -------------------------------------------------------------------------

  {
    id: "extract-day-prominent-run",
    kind: "extract",
    description:
      "The single most important case in this set. The day is the most distinctive word in the description, ahead of the activity. The probe (20 Aug 2026, 5 runs on the real production path) found a weekday-bearing group name on 5 of 5 runs (\"Saturday Running\" x2, \"Saturday Morning Runners\" x3), and the activity itself slipped from the naming form \"running\" to the doing-word \"run\" on 1 of 5, dragging the title down with it. Expect this case to fail most or every run; that is the finding, not a broken case.",
    founderDescription: "a few of us run on Saturday mornings at 7am",
    assertions: [
      statusReady,
      activityIs("running"),
      cadenceWeekly,
      daysAre([6]),
      timeIs("07:00"),
      timeNotAmbiguous,
      titleIs("Running"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-day-prominent-beers",
    kind: "extract",
    description:
      "A second day-prominent shape from the same probe (20 Aug 2026, 5 runs), so the finding reads as a shape rather than one word's quirk. The founder names the day before the activity needs any qualifying at all. The probe found the weekday leak on 1 of 5 runs (\"Friday Beers\"), with \"Beer Crew\" and \"Beer Grab\" filling the other four; the activity and title held clean on all 5.",
    founderDescription: "we grab beers every Friday at 7pm",
    assertions: [
      statusReady,
      activityIs("beers"),
      cadenceWeekly,
      daysAre([5]),
      timeIs("19:00"),
      timeNotAmbiguous,
      titleIs("Beers"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-own-words-book-club",
    kind: "extract",
    description:
      "The founder's own words already spell out a fine group name, so there is nothing for a weekday to displace. The probe (20 Aug 2026, 5 runs) found this one flawless, \"Book Club\" 5 of 5, and it is pinned to that exact string on purpose: a bench that only ever holds failures cannot show a later fix helping, and this case is what the day-prominent cases above should look like if the weekday problem goes away.",
    founderDescription: "we have book club on Sundays at 4pm",
    assertions: [
      statusReady,
      activityIs("book club"),
      cadenceWeekly,
      daysAre([0]),
      timeIs("16:00"),
      timeNotAmbiguous,
      titleIs("Book Club"),
      groupNameIs("Book Club"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "extract-own-words-family-dinner",
    kind: "extract",
    description:
      "A second own-words case, kept beside book club for the same reason the two day-prominent cases are kept together: one clean pass could be luck, two is a shape. \"Family dinner\" is already a usable name with nothing for a weekday to crowd out. The probe (20 Aug 2026, 5 runs) found this flawless too, \"Family Dinner\" 5 of 5. Note on the activity field, found while writing this case rather than guessed: the model reads \"family\" as a qualifier to drop, the same way it drops a stated venue out of activity, and consistently (9 of 10 runs across the two verification passes) extracts activity \"dinner\" rather than \"family dinner\". That is a separate, stable behavior from the weekday question this case exists to test, so the activity and title assertions are pinned to what the model actually and repeatably returns rather than to a guess.",
    founderDescription: "family dinner every Sunday at 6pm",
    assertions: [
      statusReady,
      activityIs("dinner"),
      cadenceWeekly,
      daysAre([0]),
      timeIs("18:00"),
      timeNotAmbiguous,
      titleIs("Dinner"),
      groupNameIs("Family Dinner"),
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },

  // -------------------------------------------------------------------------
  // Merge cases: one founder answer into a gapped partial state, through
  // `mergeGapAnswer` directly (never through `enforceActivityCarryOver` /
  // `enforceVenueCarryOver`, which are the server action's own code-side
  // guard, not part of the model call). These three measure the prompt's own
  // "latest word wins" and "copy untouched fields verbatim" rules unassisted
  // by that guard, which is the point: the guard exists precisely because
  // the model does not always follow those rules on its own.
  // -------------------------------------------------------------------------

  {
    id: "merge-carry-forward",
    kind: "merge",
    description:
      'The documented past failure behind CLAUDE.md\'s stored-state guardrail: current state holds activity "climbing" and the founder answers only the time question. A field the answer never touches must come back character for character, not re-derived from the description into a different stem ("climb").',
    input: {
      description: "we climb on Tuesdays",
      groupName: "Tuesday Climbers",
      currentState: [
        {
          activity: "climbing",
          title: "Climbing",
          cadence: "weekly",
          daysOfWeek: [2],
          timeLocal: null,
          venueName: null,
        },
      ],
      candidateTimeLocal: null,
      askedAbout: "time",
      answer: "7pm",
    },
    assertions: [
      statusReady,
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([2]),
      timeIs("19:00"),
      timeNotAmbiguous,
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "merge-ambiguous-time",
    kind: "merge",
    description:
      'The candidate-time resolution rule from the merge prompt\'s own field rules, deliberately picked so a correct resolution DIFFERS from the candidate: candidate time is "19:00" (the model\'s pm guess for "at 7"), we asked whether that is morning or evening, and the founder answers "in the morning". The rule\'s own text says "morning" maps candidate "19:00" to "07:00", not to the candidate itself, so this pairing is the one that actually exercises the mapping: a model that just echoes candidateTimeLocal regardless of the answer would fail this case, where an "evening" answer (whose correct output equals the candidate) could not tell the two behaviors apart. `toStored` nulls an ambiguous time on every path (ready or incomplete), so a time surviving into the normalized primary is itself the proof the ambiguity resolved; there is no separate "resolved" flag to read.',
    input: {
      description: "we climb tuesdays at 7",
      groupName: "Tuesday Climbers",
      currentState: [
        {
          activity: "climbing",
          title: "Climbing",
          cadence: "weekly",
          daysOfWeek: [2],
          timeLocal: null,
          venueName: null,
        },
      ],
      candidateTimeLocal: "19:00",
      askedAbout: "ambiguous_time",
      answer: "in the morning",
    },
    assertions: [
      statusReady,
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([2]),
      timeIs("07:00"),
      timeNotAmbiguous,
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
  {
    id: "merge-day-replacement",
    kind: "merge",
    description:
      "Latest-word-wins: we only asked about the time, but the founder's answer contradicts the stored day too (\"actually Saturdays at 10am\"). The days and time must be replaced wholesale by the answer, never merged with the stored Tuesday.",
    input: {
      description: "we climb on Tuesdays",
      groupName: "Tuesday Climbers",
      currentState: [
        {
          activity: "climbing",
          title: "Climbing",
          cadence: "weekly",
          daysOfWeek: [2],
          timeLocal: null,
          venueName: null,
        },
      ],
      candidateTimeLocal: null,
      askedAbout: "time",
      answer: "actually Saturdays at 10am",
    },
    assertions: [
      statusReady,
      activityIs("climbing"),
      cadenceWeekly,
      daysAre([6]),
      timeIs("10:00"),
      timeNotAmbiguous,
      venueIsNull,
      ...NAME_ASSERTIONS,
    ],
  },
]
