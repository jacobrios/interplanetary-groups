// scripts/qa-sweep.ts
//
// Runs the two ENDGAME sweeps by hand, so a walkthrough does not have to wait
// an hour for Vercel. The same calls the cron route makes, unscoped, exactly
// as production runs them, MINUS reconcileScheduledEvents: the cron route
// runs three things and this runs two. Reconcile is left out on purpose,
// because a hand-run reconcile spawns recurring events across every group in
// the shared dev-test database, which is a mess to clean up and has nothing
// to do with any endgame walkthrough.
//
// UNSCOPED IS CORRECT HERE and wrong in a test: this is the owner driving the
// real behavior in the dev-test database on purpose. Never import this from a
// test file.
//
// Usage: npx tsx --env-file=.env scripts/qa-sweep.ts

import { runProposalEndgame } from "../src/lib/proposals/endgame"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { prisma } from "../src/lib/prisma"

import { judge } from "./db-which"

/** The same ref db:which checks against (CLAUDE.md, "Two databases, never crossed"). */
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

/**
 * Refuses to run unless the checkout points at dev-test, on all three env
 * sources. Uses the shared `judge` rather than a hand-rolled parse: an
 * earlier draft of this file checked DIRECT_URL alone, which is the wrong
 * variable to trust on its own, since the writes travel over DATABASE_URL.
 * A mixed .env would have sailed through it.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error(`STOP: this checkout is NOT confirmed to be dev-test.`)
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error(`Run npm run db:which and resolve it before running this script.`)
  process.exit(1)
}


async function main() {
  requireDevTest()
  const now = new Date()
  const proposals = await runProposalEndgame(now)
  const gauges = await runGaugeEndgame(now)
  console.log(JSON.stringify({ proposals, gauges }, null, 2))
  await prisma.$disconnect()
}

main()
