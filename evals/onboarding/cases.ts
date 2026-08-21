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
// The name assertions. The base three (non-empty, three words or fewer,
// letters/numbers/spaces only) apply to every case; the weekday-word bar
// applies only when a case's primary rhythm spans more than one day, per
// nameAssertions below.
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
 * as red lines rather than vacuous greens. A missing name is a total failure
 * of the field and the board should say so every time over.
 *
 * These three hold for every case regardless of shape. The weekday check
 * does not belong here: see `NO_WEEKDAY_NAME` and `nameAssertions` below.
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

/**
 * Bars a weekday word from the group name. Owner's ruling (20 Aug 2026,
 * narrowing the original blanket rule after the day-prominent cases showed
 * where it actually broke): a group that meets on more than one day is not
 * a Monday group, but a group that only ever meets on Saturday is rightly
 * named "Saturday Morning Runners". So this assertion only belongs on a case
 * whose primary rhythm spans more than one day; see `nameAssertions` below.
 */
const NO_WEEKDAY_NAME: Assertion = {
  name: "name: no weekday word",
  check: (o) => {
    const n = groupNameOf(o.normalized)
    return typeof n === "string" && n.trim().length > 0 && !WEEKDAY_RE.test(n)
  },
}

/**
 * The full set of name assertions for one case, with the weekday bar applied
 * only when the case's own rhythm spans more than one day. Takes the case's
 * actual `days` array rather than a hand-picked boolean (changed 20 Aug 2026,
 * review fix): the earlier `multiDay: boolean` parameter was set by eye at
 * each call site, with nothing checking it against the days the case itself
 * asserts, so a case added by copying a neighbour could silently carry the
 * wrong bar. Passing the real days array means there is exactly one place a
 * case states how many days it spans, and `multiDay` is derived from it, not
 * re-typed beside it.
 */
function nameAssertions(days: number[]): Assertion[] {
  return days.length > 1 ? [...NAME_ASSERTIONS, NO_WEEKDAY_NAME] : NAME_ASSERTIONS
}

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
 * An exact group name, not just the shape checks in `nameAssertions`.
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
      // Mon/Wed/Fri: more than one day, so a weekday name is barred.
      ...nameAssertions([1, 3, 5]),
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
      // Thursday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([4]),
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
      // Tuesday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([2]),
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
      // Tuesday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([2]),
    ],
  },
  {
    id: "extract-no-venue",
    kind: "extract",
    description:
      "No place mentioned anywhere. Guards 'never invent a venue', a prompt rule nothing currently proves.",
    founderDescription: "we climb every Sunday at 9am",
    // Sunday only: one day, so a weekday name is allowed, not required.
    assertions: [statusReady, venueIsNull, daysAre([0]), ...nameAssertions([0])],
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
      // The primary (climbing) rhythm is Wednesday only; the loose beers
      // rhythm names no day at all, so there is still only one day.
      ...nameAssertions([3]),
    ],
  },

  // -------------------------------------------------------------------------
  // Day-prominent and own-words cases (added 20 Aug 2026). The six cases
  // above all lead with the activity ("we climb...", "we play..."), so none
  // of them can see what an ad-hoc probe found afterward: the weekday rule
  // was not a uniform 1-in-15, it was concentrated in descriptions where the
  // day is the most distinctive thing the founder said. The probe ran each
  // of the four founder texts below 5 times against the real production
  // path. These four cases exist so the bench can see that shape itself
  // rather than take the probe's word for it.
  //
  // Amended 20 Aug 2026, narrow-weekday-rule slice: the probe's finding was
  // read as a bug at first, but both cases below are single-day groups, and
  // "Saturday Morning Runners" is a fine name for a group that only ever
  // meets on Saturday. The owner ruled the original prompt rule too broad,
  // FIELD_RULES now only bars a weekday name on a multi-day group, and these
  // two cases no longer bar it either (see `nameAssertions`). They stay in
  // the bench for the shape they still guard: the day staying the most
  // distinctive word in the description, and the activity/title holding
  // steady rather than sliding toward the day.
  // -------------------------------------------------------------------------

  {
    id: "extract-day-prominent-run",
    kind: "extract",
    description:
      "The single most important case in this set. The day is the most distinctive word in the description, ahead of the activity. Originally added to catch a weekday-bearing group name (probe: 5 of 5 runs, \"Saturday Running\" x2, \"Saturday Morning Runners\" x3); narrowed 20 Aug 2026 once the owner ruled that a single-day group naming itself after that day is correct, not a bug. What still counts as a failure here: the activity itself slipping from the naming form \"running\" to the doing-word \"run\" (probe: 1 of 5), which drags the title down with it.",
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
      // Saturday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([6]),
    ],
  },
  {
    id: "extract-day-prominent-beers",
    kind: "extract",
    description:
      "A second day-prominent shape from the same probe (5 runs), so the finding reads as a shape rather than one word's quirk. The founder names the day before the activity needs any qualifying at all. The probe found a weekday-bearing name (\"Friday Beers\") on 1 of 5 runs, with \"Beer Crew\" and \"Beer Grab\" filling the other four; the activity and title held clean on all 5. Narrowed 20 Aug 2026 alongside the run case: \"Friday Beers\" is a fine name for a group that only meets on Friday, so this case no longer bars a weekday word either.",
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
      // Friday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([5]),
    ],
  },

  // ---------------------------------------------------------------------
  // Added 20 Aug 2026, a fix-wave review catch. The two day-prominent cases
  // above are both single-day, so narrowing the rule took the weekday check
  // off both of them; the only case left carrying that check, extract-multi-
  // day, leads with the activity ("we climb on Mondays, Wednesdays and
  // Fridays"). Nothing in this bench occupied the cell where both pressures
  // point the same way at once: the founder leads with the days, the days
  // are plural, and the model has to notice that plurality itself before it
  // knows the bar applies, because the rule is now conditional rather than
  // flat. That cell is where a regression would actually show up, and this
  // is the one case that guards it. This is now the primary guard for the
  // behavior that must never regress: a multi-day group whose founder led
  // with the day still must not become a group named after one of its days.
  // ---------------------------------------------------------------------

  {
    id: "extract-day-prominent-multi-day",
    kind: "extract",
    description:
      "Day-prominent and multi-day at once, the one cell the bench never had a case for until this fix wave. The founder names both days before the activity needs any qualifying, the same shape that tempted a weekday name in the single-day probe cases above, except here a weekday name would actually be wrong, so this is the case where the narrowed rule earns its keep rather than the case where it stays out of the way.",
    founderDescription: "Tuesdays and Thursdays we run at 6am",
    assertions: [
      statusReady,
      activityIs("running"),
      cadenceWeekly,
      daysAre([2, 4]),
      timeIs("06:00"),
      timeNotAmbiguous,
      titleIs("Running"),
      venueIsNull,
      // Tuesday and Thursday: more than one day, so a weekday name is barred.
      ...nameAssertions([2, 4]),
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
      // Sunday only: one day, so a weekday name is allowed, not required
      // (moot here since the name is pinned to "Book Club" anyway).
      ...nameAssertions([0]),
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
      // Sunday only: one day, so a weekday name is allowed, not required
      // (moot here since the name is pinned to "Family Dinner" anyway).
      ...nameAssertions([0]),
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
  //
  // All three land on a single day (Tuesday, or Saturday after
  // day-replacement), so `nameAssertions` sees a one-element days array like
  // every other single-day case: a weekday name is allowed here too, not
  // just in extraction, since the merge prompt shares FIELD_RULES verbatim
  // with extraction and the two calls cannot be held to different rules.
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
      // Tuesday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([2]),
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
      // Tuesday only: one day, so a weekday name is allowed, not required.
      ...nameAssertions([2]),
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
      // Saturday only (the replaced day): one day, so a weekday name is
      // allowed, not required.
      ...nameAssertions([6]),
    ],
  },
]
