// scripts/probe-signin-rate.ts
//
// Task 9a of the "ready for other people's data" slice: does anything stop a
// script from guessing a sign-in code? Nobody had ever tested it. This is a
// hand-run experiment against dev-test, deliberately outside the test runner:
// it costs real Supabase API calls and, on the one request step, sends one
// real email.
//
// WHAT IS ALREADY KNOWN FROM READING THE CODE, so this script does not
// re-derive it. The sign-in code is 8 digits. Verification is Supabase's
// verifyOtp, not ours (src/lib/auth/email.ts). There is no rate limiting,
// attempt counter, lockout, or delay anywhere in this product's own code on
// the VERIFY path; the 60-second resend countdown is a client-side UI timer
// on the REQUEST path and does not touch verify at all. Two server actions,
// src/app/actions/signin.ts and src/app/actions/join-signin.ts, both call the
// same two functions this script drives: requestSignInCode and
// confirmSignInCode. Probing that shared seam covers both doors at once.
//
// So the only open question is whether SUPABASE's own service stops a
// guessing attack, and after how many attempts. That is what this script
// measures, by calling the real functions, not a hand-rolled Supabase call.
//
// WHY A STAND-IN SUPABASE CLIENT. Both functions call createClient() from
// src/lib/supabase/server.ts, which needs next/headers' cookies() and a live
// Next.js request scope. A bare script is never one; calling cookies() here
// throws immediately. Rather than reimplementing email.ts's classification
// logic by hand (which is exactly what the task brief says not to do: "not a
// hand-rolled Supabase call, or you are measuring something the product does
// not do"), this script swaps ONLY the cookie transport underneath
// createClient(), for the life of this process, via a targeted
// Module._resolveFilename patch that redirects the single import specifier
// "@/lib/supabase/server" to scripts/_probe-signin-client.ts (read that
// file's own doc comment for what it does and does not change). Everything
// else about requestSignInCode and confirmSignInCode, every branch, every
// error classification, is the real, unmodified code from src/lib/auth/email.ts.
// The patch must run before email.ts is imported, which is why it is the
// first thing this file does.
//
// THE ADDRESS DECISION, made and recorded here because the task leaves it to
// whoever runs this. requestSignInCode calls signInWithOtp with
// shouldCreateUser:false, which only succeeds for an address Supabase
// already has a confirmed identity for; it means real mail goes out to that
// address the moment the request step runs (dev-test's Supabase project has
// custom SMTP live, confirmed in build-notes and re-confirmed by hand before
// writing this script: a real signInWithOtp call for a real address returned
// no error, meaning Supabase accepted it and queued a send). A fake or
// unreachable address would either be rejected outright (no identity, no
// code, nothing to probe) or, worse, bounce and cost the sending domain's
// reputation. There is no safe throwaway address for this specific call,
// because the call requires a pre-existing identity, and manufacturing one
// costs its own send. The safe choice is therefore the operator's own real
// inbox: guaranteed deliverable, no bounce risk, no third party involved.
// This script requires --email to be passed explicitly every run rather than
// defaulting to any address baked into source, so that choice is always made
// on purpose, not inherited silently.
//
// USAGE (dev-test only; the guard below refuses anything else):
//   npx tsx --env-file=.env scripts/probe-signin-rate.ts --email <address> --send-code
//   npx tsx --env-file=.env scripts/probe-signin-rate.ts --email <address> --skip-request
//   npx tsx --env-file=.env scripts/probe-signin-rate.ts --email <address> --send-code --max-attempts 100
//
// --send-code and --skip-request are mutually exclusive and one is required,
// on purpose: this is the one action in the script that sends real mail, and
// it should never happen by a flag someone forgot to pass. --skip-request
// assumes a code is already pending for --email (requested moments earlier,
// by this script or by hand) and goes straight to the verify loop, so a
// second run does not mail a second code for no reason.
//
// --max-attempts caps how many wrong codes get submitted. Default 200, hard
// ceiling 500: "no wall found within N attempts" is a complete and useful
// answer, running until something breaks is not.

import Module from "node:module"
import path from "node:path"
import { judge, EXPECTED_DEV_TEST_REF } from "./db-which"

// ── The Module patch. Must run before anything imports src/lib/auth/email. ──

type ResolveFilename = (
  this: unknown,
  request: string,
  parent?: unknown,
  isMain?: boolean,
  options?: unknown
) => string

const STUB_CLIENT_PATH = path.resolve(__dirname, "_probe-signin-client.ts")
const moduleInternals = Module as unknown as { _resolveFilename: ResolveFilename }
const originalResolveFilename = moduleInternals._resolveFilename

moduleInternals._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "@/lib/supabase/server") {
    return originalResolveFilename.call(this, STUB_CLIENT_PATH, ...(rest as [unknown, boolean, unknown]))
  }
  return originalResolveFilename.call(this, request, ...(rest as [unknown, boolean, unknown]))
} as ResolveFilename

// ── Everything below can now safely import the real auth seam. ─────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.ok) {
    console.error(args.error)
    process.exit(1)
  }

  requireDevTest()

  const { prisma } = await import("../src/lib/prisma")
  const { requestSignInCode, confirmSignInCode } = await import("../src/lib/auth/email")

  console.log("Sign-in code guessing probe (task 9a)")
  console.log("======================================")
  console.log(`Target address: ${args.args.email}`)
  console.log(`Attempt cap: ${args.args.maxAttempts}`)
  console.log("")

  if (args.args.mode === "send-code") {
    console.log("Requesting one sign-in code through the real requestSignInCode seam...")
    const req = await requestSignInCode(args.args.email)
    console.log(`Request result: ${req.result}`)
    if (req.result !== "ok") {
      console.log("")
      console.log(
        "STOP: the request step did not return ok, so there is no pending code to guess against. " +
          "No verify attempts were made."
      )
      await prisma.$disconnect()
      process.exit(1)
    }
    console.log("A real email has been sent to this address.")
    console.log("")
  } else {
    console.log("Skipping the request step: assuming a code is already pending for this address.")
    console.log("")
  }

  console.log(`Submitting up to ${args.args.maxAttempts} wrong codes through the real confirmSignInCode seam...`)
  console.log("")

  const startedAt = Date.now()
  const tally: Record<string, number> = {}
  const capturedLogLines: string[] = []
  const originalConsoleError = console.error
  console.error = (...consoleArgs: unknown[]) => {
    capturedLogLines.push(consoleArgs.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
  }

  let stoppedEarly: { attempt: number; result: string } | null = null
  let attemptsMade = 0

  try {
    for (let i = 1; i <= args.args.maxAttempts; i++) {
      attemptsMade = i
      const wrongCode = randomEightDigitCode()
      const outcome = await confirmSignInCode(args.args.email, wrongCode)
      tally[outcome.result] = (tally[outcome.result] ?? 0) + 1

      if (outcome.result !== "bad_code") {
        stoppedEarly = { attempt: i, result: outcome.result }
        break
      }

      // console.log is never patched, only console.error, so progress always
      // prints regardless of what confirmSignInCode logs on its own.
      if (i % 25 === 0 || i === args.args.maxAttempts) {
        console.log(`  ... ${i}/${args.args.maxAttempts} attempts, all bad_code so far`)
      }
    }
  } finally {
    console.error = originalConsoleError
  }

  const elapsedMs = Date.now() - startedAt

  console.log("")
  console.log("RESULT")
  console.log("------")
  console.log(`Attempts submitted: ${attemptsMade}`)
  for (const [result, count] of Object.entries(tally)) {
    console.log(`  ${result}: ${count}`)
  }
  if (stoppedEarly) {
    console.log("")
    console.log(
      `A wall appeared at attempt ${stoppedEarly.attempt}: confirmSignInCode returned "${stoppedEarly.result}" instead of the expected "bad_code".`
    )
    if (capturedLogLines.length > 0) {
      console.log("What the seam logged when that happened:")
      for (const line of capturedLogLines) console.log(`  ${line}`)
    }
  } else {
    console.log("")
    console.log(`No wall found within ${attemptsMade} wrong attempts. Every single one was classified bad_code.`)
  }
  console.log("")
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s (${(attemptsMade / (elapsedMs / 1000)).toFixed(1)} attempts/sec)`)

  await prisma.$disconnect()
}

function randomEightDigitCode(): string {
  return Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, "0")
}

// ── The database guard. Same shape as scripts/delete-person.ts. ────────────

function requireDevTest(): void {
  const verdict = judge(process.env, EXPECTED_DEV_TEST_REF)
  if (verdict.ok) {
    console.log(`Checkout confirmed dev-test (project ${verdict.ref}). Proceeding.`)
    console.log("")
    return
  }
  console.error("STOP: this checkout is NOT confirmed to be dev-test.")
  for (const p of verdict.problems) console.error(`  - ${p}`)
  console.error("Run npm run db:which and resolve it before running this script.")
  process.exit(1)
}

// ── Argument parsing (pure, so it is easy to reason about). ────────────────

interface ProbeArgs {
  email: string
  mode: "send-code" | "skip-request"
  maxAttempts: number
}

type ParsedArgs = { ok: true; args: ProbeArgs } | { ok: false; error: string }

const DEFAULT_MAX_ATTEMPTS = 200
const HARD_MAX_ATTEMPTS = 500

const USAGE = [
  "Usage:",
  "  npx tsx --env-file=.env scripts/probe-signin-rate.ts --email <address> --send-code",
  "  npx tsx --env-file=.env scripts/probe-signin-rate.ts --email <address> --skip-request",
  "",
  "Options:",
  "  --email <address>       required, every run, on purpose (see this file's doc comment)",
  "  --send-code              request one real sign-in code for --email, then guess against it",
  "  --skip-request            assume a code is already pending for --email; sends nothing",
  `  --max-attempts <n>        default ${DEFAULT_MAX_ATTEMPTS}, hard ceiling ${HARD_MAX_ATTEMPTS}`,
  "",
  "--send-code and --skip-request are mutually exclusive and exactly one is required.",
].join("\n")

function parseArgs(argv: string[]): ParsedArgs {
  let email: string | null = null
  let sendCode = false
  let skipRequest = false
  let maxAttempts = DEFAULT_MAX_ATTEMPTS

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--email") {
      email = argv[++i] ?? null
      if (email === null) return { ok: false, error: `--email needs a value.\n\n${USAGE}` }
    } else if (arg === "--send-code") {
      sendCode = true
    } else if (arg === "--skip-request") {
      skipRequest = true
    } else if (arg === "--max-attempts") {
      const raw = argv[++i]
      const n = raw ? Number.parseInt(raw, 10) : NaN
      if (!Number.isFinite(n) || n < 1) return { ok: false, error: `--max-attempts needs a positive integer.\n\n${USAGE}` }
      maxAttempts = Math.min(n, HARD_MAX_ATTEMPTS)
    } else {
      return { ok: false, error: `Unrecognized option: ${arg}\n\n${USAGE}` }
    }
  }

  if (!email) return { ok: false, error: `--email is required.\n\n${USAGE}` }
  if (sendCode === skipRequest) {
    return {
      ok: false,
      error: `Pass exactly one of --send-code or --skip-request.\n\n${USAGE}`,
    }
  }

  return { ok: true, args: { email, mode: sendCode ? "send-code" : "skip-request", maxAttempts } }
}

main().catch((e) => {
  console.error("\nUNCAUGHT:", e)
  process.exit(1)
})
