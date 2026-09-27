// src/lib/orbit/replay.ts
//
// "Remembered answers" for onboarding step 1: when a founder goes back to
// step 1 and re-describes the group, answers they already gave Orbit in the
// gap-ask conversation should fill whatever the new description still leaves
// missing. This module is the seam the bench in evals/onboarding/cases.ts
// (the `replay-*` cases) calls, so the bench can see the feature land the
// same day it does.
//
// Task 5 (this file, today): a deliberate stub. It ignores `priorAnswers`
// entirely and returns today's plain extraction, so the replay-* bench cases
// run red against real behaviour before the feature exists. Task 6 replaces
// the body with a call that actually folds the prior answers in, keeping
// this exact exported signature so the bench and its call sites need no
// changes when that lands.

import { extractGroupProfile } from "./extract"

export async function extractWithPriorAnswers(
  description: string,
  priorAnswers: string[]
): Promise<unknown> {
  // Stub: `priorAnswers` is intentionally unused. Task 6 makes it count.
  void priorAnswers
  return extractGroupProfile(description)
}
