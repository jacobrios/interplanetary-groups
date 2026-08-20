// evals/onboarding/run.ts
//
// Runs onboarding cases against the real model. An extract case calls
// `extractGroupProfile` exactly as onboarding step 1 does; a merge case
// replays the real production sequence from src/app/actions/merge-gap.ts:
// `mergeGapAnswer` then `enforceActivityCarryOver` then
// `enforceVenueCarryOver`, calling the plain lib functions directly rather
// than the "use server" action wrapper (which round-trips a different,
// client-payload input shape). Either way the raw claim then goes through
// the product's own normalize layer before anything is graded, so the bench
// measures the fact the founder would meet and never the model's unvalidated
// output. Never touches the database, so it is safe to run repeatedly.
//
// Every assertion on a case is evaluated on every run and scored as its own
// rate. Extraction returns eight fields at once, so a whole-case pass or fail
// would say a case scored 2/5 without saying whether the days broke or the
// name did. Per-assertion scoring costs no extra model calls.
//
// Nothing here caps, samples, or skips: every case runs `runs` times and a
// thrown call is recorded as a failure on every assertion, never as a run
// that quietly did not happen.

import { extractGroupProfile } from "../../src/lib/orbit/extract"
import { enforceActivityCarryOver, enforceVenueCarryOver } from "../../src/lib/orbit/gap"
import { mergeGapAnswer } from "../../src/lib/orbit/merge"
import type { NormalizedOnboarding } from "../../src/lib/orbit/normalize"
import { toOutcome, type OnboardingCase, type OnboardingOutcome } from "./cases"

export interface AssertionResult {
  name: string
  runs: number
  passes: number
  /** One line per failing run, showing what was actually produced. */
  failures: string[]
}

export interface CaseResult {
  id: string
  /** Why the case exists. Printed next to a failure. */
  description: string
  runs: number
  assertions: AssertionResult[]
}

/** Everything one run produced, on one line, so a failure is diagnosable without a re-run. */
function describe(o: OnboardingOutcome): string {
  const n: NormalizedOnboarding = o.normalized
  const head =
    n.status === "ready"
      ? `ready | name ${JSON.stringify(n.groupName)}`
      : `incomplete(${n.missing}) | name ${JSON.stringify(n.groupName)}` +
        ` | candidateTime ${n.candidateTimeLocal ?? "none"}` +
        ` | question ${o.question === null ? "none" : JSON.stringify(o.question)}`
  const rhythms = n.rhythms
    .map(
      (r) =>
        `{activity ${JSON.stringify(r.activity)}, title ${JSON.stringify(r.title)},` +
        ` cadence ${r.cadence ?? "null"}, days ${r.daysOfWeek === null ? "null" : `[${r.daysOfWeek.join(",")}]`},` +
        ` time ${r.timeLocal ?? "null"}, venue ${r.venueName ?? "null"}}`
    )
    .join(" ")
  return `${head} | rhythms: ${rhythms || "(none)"}`
}

/**
 * One run of one case, through the real production entry point for its kind.
 * `mergeGapAnswer` returns the same claim shape against the same schema as
 * extraction, so it flows through the same `toOutcome` and grades against the
 * same assertions. The merge branch replays the exact sequence
 * merge-gap.ts:89-117 runs on a real founder answer: the raw merge claim goes
 * through `enforceActivityCarryOver` then `enforceVenueCarryOver` before
 * normalization, because those two guards are load-bearing parts of what a
 * founder actually experiences (the CLIMBING-to-CLIMB drift CLAUDE.md
 * documents was only ever fixed by adding them), not optional scaffolding
 * around the model call. Skipping them would grade a call nobody makes.
 */
async function runOnce(c: OnboardingCase): Promise<OnboardingOutcome> {
  switch (c.kind) {
    case "extract":
      return toOutcome(await extractGroupProfile(c.founderDescription))
    case "merge": {
      let raw = await mergeGapAnswer(c.input)
      raw = enforceActivityCarryOver(raw, c.input.currentState, c.input.answer)
      raw = enforceVenueCarryOver(raw, c.input.currentState)
      return toOutcome(raw)
    }
  }
}

export async function runCase(c: OnboardingCase, runs: number): Promise<CaseResult> {
  const assertions: AssertionResult[] = c.assertions.map((a) => ({
    name: a.name,
    runs,
    passes: 0,
    failures: [],
  }))

  for (let i = 0; i < runs; i++) {
    let outcome: OnboardingOutcome | null = null
    let thrown: string | null = null
    try {
      outcome = await runOnce(c)
    } catch (err) {
      // A thrown call is a failure on every assertion, never a skipped run.
      // Swallowing it here would let a run of API errors read as a clean board.
      thrown = `threw: ${err instanceof Error ? err.message : String(err)}`
    }

    for (let j = 0; j < c.assertions.length; j++) {
      if (outcome === null) {
        assertions[j].failures.push(thrown ?? "threw: unknown")
        continue
      }
      let ok = false
      try {
        ok = c.assertions[j].check(outcome)
      } catch (err) {
        ok = false
        assertions[j].failures.push(
          `predicate threw: ${err instanceof Error ? err.message : String(err)}`
        )
        continue
      }
      if (ok) assertions[j].passes++
      else assertions[j].failures.push(describe(outcome))
    }
  }

  return { id: c.id, description: c.description, runs, assertions }
}
