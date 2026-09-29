// scripts/usage-report.ts
//
// Hand-run, never in the suite: prints the weekly usage report to the
// terminal, composed by the same collectUsage and composeUsageReport the
// Monday cron email uses, against whatever database this checkout points at.
// It never sends anything and has no production mode; the email is the
// production path.
//
// Usage:
//   npm run usage
//
// Reads USAGE_REPORT_TO from .env when present, so the owner's own groups are
// excluded exactly as the email excludes them. With it unset, the output says
// "Excluded nothing". Never prints the address.

import { prisma } from "../src/lib/prisma"
import { collectUsage } from "../src/lib/usage/collect"
import { composeUsageReport } from "../src/lib/usage/compose"
import { findOwnerUserIds } from "../src/lib/usage/run"
import { judge } from "./db-which"

// Same value db-which.ts carries, duplicated rather than imported for the
// same reason scripts/qa-stage-email.ts and scripts/qa-stage-cardstate.ts
// both already duplicate it: db-which.ts only exports it as a CLI default,
// not as a shared constant.
const EXPECTED_DEV_TEST_REF = "pxbewardwvoyqqcvogel"

/**
 * Refuse to run against anything but dev-test. CLAUDE.md's "Two databases,
 * never crossed" makes this the first thing that runs, before a single query.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  console.log(`Database: project ref ${verdict.ref ?? "(unresolved)"}`)
  if (verdict.ok) {
    console.log("Confirmed dev-test. Continuing.\n")
    return
  }
  console.error("STOP: this checkout is NOT confirmed to be dev-test.")
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error("Run npm run db:which and resolve it before running this script.")
  process.exit(1)
}

async function main(): Promise<void> {
  requireDevTest()

  const to = process.env.USAGE_REPORT_TO?.trim()
  const excludeUserIds = to ? await findOwnerUserIds(to) : []

  const report = await collectUsage(new Date(), { excludeUserIds })
  const { subject, text } = composeUsageReport(report, { ownerRecognised: excludeUserIds.length > 0 })
  console.log(subject)
  console.log("")
  console.log(text)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
