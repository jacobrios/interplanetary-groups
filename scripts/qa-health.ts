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
//   npm run qa:health                 healthy path, against the real dev-test database
//   npm run qa:health -- --break      failure path, against an unreachable database
//   npm run qa:health -- --break-auth failure path, against an unreachable Supabase auth
//   npm run qa:health -- --ping       sends a real heartbeat to HEALTH_HEARTBEAT_URL
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
//
// --break-auth is task 4 of the supabase-auth-soft-fail slice and it is the
// only real evidence in that whole slice. Tasks 1-3 all rest on one
// assumption, that the real @supabase/auth-js library throws (or returns)
// AuthRetryableFetchError for a real network failure, and no unit test
// carries that assumption on purpose: mocking Supabase would remove the only
// thing being checked (see the DELIBERATELY UNTESTED comment above
// realProbes in src/lib/health/check.ts). --break-auth builds a REAL
// @supabase/ssr client, via the library's own createServerClient
// constructor, aimed at http://127.0.0.1:1, the same closed-port shape
// UNREACHABLE uses for Prisma. It is never a stub whose getUser() rejects:
// a stub would prove something about our test code, not about the library,
// and would make this script theatre rather than evidence. Because
// runHealthCheck stops at the first failing probe and supabase_auth runs
// last, --break-auth runs against the real, healthy dev-test database:
// user_row, membership_row and group_home_data all have to pass for
// execution to reach the probe this flag exists to break.

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { createServerClient } from "@supabase/ssr"
import { runHealthCheck, realProbes, type HealthVerdict } from "../src/lib/health/check"
import { reportHealth } from "../src/lib/health/heartbeat"
import { getSupabaseEnv } from "../src/lib/supabase/env"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

/** Valid-shaped, resolvable, and nothing is listening. Fails fast. */
const UNREACHABLE = "postgresql://nobody:nobody@127.0.0.1:1/none"

/** Same closed-port shape as UNREACHABLE above, for the Supabase auth server. */
const UNREACHABLE_SUPABASE_URL = "http://127.0.0.1:1"

/**
 * Build a real @supabase/ssr client for a bare script, at an explicit URL,
 * always with a stub cookie transport.
 *
 * Neither the healthy path nor --break-auth can use realProbes()'s own
 * default makeSupabase (src/lib/supabase/server.ts's createClient()): that
 * function reads request cookies via next/headers' cookies(), which throws
 * ("called outside a request scope") anywhere that is not a real Next.js
 * request, and a bare script run through tsx is never one. Confirmed by
 * hand while building this flag: `npm run qa:health` with no flag at all
 * failed with exactly that error before this function existed, because
 * task 3 wired that default in for its real caller, the cron route, which
 * does run inside a request, and nobody had run this script end to end
 * since. So this factory is not only --break-auth's; the healthy path below
 * needs its own real-but-script-safe client too, differing only in which
 * URL it is given.
 *
 * The pattern (createServerClient, a stub cookie jar) is copied from
 * scripts/_probe-signin-client.ts, written for the identical reason. An
 * empty getAll and a setAll that is never called are correct here, not a
 * shortcut: the one call this probe makes, getUser() with a throwaway
 * token, is unauthenticated and needs no session to read back.
 *
 * For --break-auth specifically: this MUST be the library's own
 * createServerClient, never a hand-written stub whose getUser() rejects. A
 * stub would only prove that our stub rejects; the entire point of
 * --break-auth is showing that the REAL @supabase/auth-js library produces
 * AuthRetryableFetchError for a REAL network failure aimed at a closed
 * port. That is the one assumption tasks 1-3 rest on with no test of their
 * own.
 */
function buildScriptSupabaseClient(url: string, publishableKey: string) {
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // Never called: every call this script makes is unauthenticated
        // and has no session to persist.
      },
    },
  })
}

/** The real dev-test Supabase project, reachable from a bare script. */
async function makeRealSupabase() {
  const { url, publishableKey } = getSupabaseEnv()
  return buildScriptSupabaseClient(url, publishableKey)
}

/**
 * The real client library, aimed at a closed port instead of the real
 * project. The publishable key is still the real one from this checkout's
 * environment: with nobody listening on the other end it does not matter
 * what the key is, but using the real key keeps the client construction
 * itself honest. Everything about this client is real except the one thing
 * --break-auth exists to break, which URL it dials.
 */
async function makeUnreachableSupabase() {
  const { publishableKey } = getSupabaseEnv()
  return buildScriptSupabaseClient(UNREACHABLE_SUPABASE_URL, publishableKey)
}

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

  if (args.includes("--break-auth")) {
    // Real Prisma client (the default `prisma` singleton, via passing
    // `undefined`), real dev-test database: the first three probes have to
    // PASS for execution to reach supabase_auth, which is the one made to
    // fail here. Only the Supabase factory is swapped.
    const verdict = await runHealthCheck(now, realProbes(now, undefined, makeUnreachableSupabase))
    print("--break-auth (unreachable Supabase auth)", verdict)

    if (verdict.ok) {
      console.error("\nFAILED: an unreachable Supabase auth server reported healthy.")
      process.exit(1)
    }
    if (verdict.failedStep !== "supabase_auth") {
      console.error(
        `\nFAILED: expected supabase_auth to be the failing step, got "${verdict.failedStep}". ` +
          "One of the earlier Prisma probes broke first, which means this run never reached " +
          "the thing --break-auth exists to test."
      )
      process.exit(1)
    }
    if (args.includes("--ping")) {
      warnHeartbeatDestination()
      console.log(`  heartbeat: ${await reportHealth(verdict)}`)
    }
    return
  }

  // Real Prisma client (the default), but NOT realProbes()'s own default
  // Supabase factory: see buildScriptSupabaseClient's header for why a bare
  // script needs its own real-but-cookie-free client rather than
  // src/lib/supabase/server.ts's createClient().
  const verdict = await runHealthCheck(now, realProbes(now, undefined, makeRealSupabase))
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
