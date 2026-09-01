// scripts/qa-health.ts
//
// Hand-run proof for the health check. Deliberately outside the test runner,
// like scripts/eval-detect.ts and scripts/measure-group-home.ts, and for the
// same reason: it needs a real database, and the suite must never depend on
// rows that happen to exist.
//
// This script IS the evidence for realProbes(), which has no unit tests on
// purpose. See the comment above realProbes in src/lib/health/check.ts.
//
//   npm run qa:health            healthy path, against the real dev-test database
//   npm run qa:health -- --break failure path, against an unreachable database
//   npm run qa:health -- --ping  sends a real heartbeat to HEALTH_HEARTBEAT_URL
//
// --ping is the one flag here with a blast radius outside this checkout: it
// sends to whatever HEALTH_HEARTBEAT_URL holds locally, and nothing checks
// that this is not the production monitor. See warnHeartbeatDestination().
//
// --break points the probes at a valid-shaped URL on a closed port. Two
// alternatives were rejected and should not be swapped back in:
//
//   Raw SQL asking for a column that does not exist would reproduce the
//   outage's exact P2022 error, and would redden the repo-wide raw-SQL
//   assertion in src/app/__tests__/no-email-address-on-screen.test.tsx,
//   whose allowlist names exactly one file. That guard reddening is by its
//   own rule a decision for the owner, not a test to adjust.
//
//   Altering the shared dev-test database is out, because a concurrent
//   worktree runs phone QA against it.
//
// The accepted limit, stated rather than glossed: an unreachable database
// produces a connection error, not P2022. This proves the check catches a
// broken database and reports it correctly. It does not reproduce the
// missing-column error specifically.

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { runHealthCheck, realProbes, type HealthVerdict } from "../src/lib/health/check"
import { reportHealth } from "../src/lib/health/heartbeat"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

/** Valid-shaped, resolvable, and nothing is listening. Fails fast. */
const UNREACHABLE = "postgresql://nobody:nobody@127.0.0.1:1/none"

/**
 * Every QA script in this repo guards its own database target rather than
 * trusting the runner to have checked (CLAUDE.md, "Two databases, never
 * crossed"). Copied from scripts/qa-stage-latency.ts so all of them fail the
 * same way.
 */
function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) return
  console.error("STOP: this checkout is NOT confirmed to be dev-test.")
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error("Run npm run db:which and resolve it before running this script.")
  process.exit(1)
}

/**
 * Say out loud where a --ping is about to go, BEFORE it goes.
 *
 * requireDevTest() above guards the database and nothing guards this: the
 * heartbeat destination is whatever HEALTH_HEARTBEAT_URL happens to hold in
 * this checkout's .env. Point that at the production monitor and a local
 * `--ping` sends a GREEN heartbeat that suppresses a real missing-ping alarm
 * for a whole period, while `--break --ping` raises a false incident. Only
 * the host is printed; the token in the path is the credential.
 */
function warnHeartbeatDestination() {
  const raw = process.env.HEALTH_HEARTBEAT_URL?.trim()
  if (!raw) {
    console.log("\n  heartbeat destination: (HEALTH_HEARTBEAT_URL unset, nothing will be sent)")
    return
  }
  let host: string
  try {
    host = new URL(raw).host
  } catch {
    host = "(unparseable URL)"
  }
  console.log(`\n  heartbeat destination: ${host}`)
  console.log("  If that is the PRODUCTION monitor, stop: this ping will move a real alarm.")
}

function print(label: string, verdict: HealthVerdict) {
  console.log(`\n─── ${label} ─────────────────────────────`)
  if (verdict.ok) {
    console.log("  verdict : HEALTHY")
    console.log(`  ran     : ${verdict.ranSteps.join(", ") || "(none)"}`)
    console.log(`  skipped : ${verdict.skipped.join(", ") || "(none)"}`)
  } else {
    console.log("  verdict : BROKEN")
    console.log(`  step    : ${verdict.failedStep}`)
    console.log(`  detail  : ${verdict.detail}`)
  }
}

async function main() {
  requireDevTest()

  const args = process.argv.slice(2)
  const now = new Date()

  if (args.includes("--break")) {
    const adapter = new PrismaPg({ connectionString: UNREACHABLE, max: 1 })
    const broken = new PrismaClient({ adapter })
    // Only user_row has to fail: the runner stops at the first failure, which
    // is the behaviour being demonstrated.
    const verdict = await runHealthCheck(now, realProbes(now, broken))
    print("--break (unreachable database)", verdict)
    await broken.$disconnect()

    if (verdict.ok) {
      console.error("\nFAILED: an unreachable database reported healthy.")
      process.exit(1)
    }
    if (args.includes("--ping")) {
      warnHeartbeatDestination()
      console.log(`  heartbeat: ${await reportHealth(verdict)}`)
    }
    return
  }

  const verdict = await runHealthCheck(now, realProbes(now))
  print("real dev-test database", verdict)

  if (args.includes("--ping")) {
    warnHeartbeatDestination()
    console.log(`  heartbeat: ${await reportHealth(verdict)}`)
  }

  if (!verdict.ok) process.exit(1)
}

main()
  .catch((err) => {
    console.error("qa-health threw, which runHealthCheck should make impossible:", err)
    process.exit(1)
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma")
    await prisma.$disconnect()
  })
