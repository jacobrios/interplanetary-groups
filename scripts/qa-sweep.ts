// scripts/qa-sweep.ts
//
// Runs the hourly cron's sweeps by hand, so a walkthrough does not have to
// wait an hour for Vercel. Same calls the cron route makes, unscoped, exactly
// as production runs them.
//
// UNSCOPED IS CORRECT HERE and wrong in a test: this is the owner driving the
// real behavior in the dev-test database on purpose. Never import this from a
// test file.
//
// Usage: npx tsx --env-file=.env scripts/qa-sweep.ts

import { runProposalEndgame } from "../src/lib/proposals/endgame"
import { runGaugeEndgame } from "../src/lib/orbit/endgame"
import { prisma } from "../src/lib/prisma"

async function main() {
  const ref = process.env.DIRECT_URL?.match(/postgres\.([a-z0-9]+):/)?.[1]
  if (ref !== "pxbewardwvoyqqcvogel") {
    throw new Error(`refusing to run: DIRECT_URL points at ${ref ?? "unknown"}, not dev-test`)
  }
  const now = new Date()
  const proposals = await runProposalEndgame(now)
  const gauges = await runGaugeEndgame(now)
  console.log(JSON.stringify({ proposals, gauges }, null, 2))
  await prisma.$disconnect()
}

main()
