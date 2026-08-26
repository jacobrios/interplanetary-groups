// scripts/spike-email-auth.ts
//
// TASK 1 SPIKE for the email sign-in slice. Hand-run, never part of the test
// suite: it talks to the real Supabase auth service and sends real email.
//
// It exists to answer six questions the plan rests on, rather than guessing
// them. See docs/superpowers/specs/2026-08-25-email-sign-in-design.md, task 1.
//
// Usage (dev-test only; the guard below refuses anything else):
//   npx tsx --env-file=.env scripts/spike-email-auth.ts probe
//   npx tsx --env-file=.env scripts/spike-email-auth.ts attach <email>
//   npx tsx --env-file=.env scripts/spike-email-auth.ts confirm <email> <code>
//   npx tsx --env-file=.env scripts/spike-email-auth.ts signin <email>
//   npx tsx --env-file=.env scripts/spike-email-auth.ts verify-signin <email> <code>

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const DEV_TEST_REF = "pxbewardwvoyqqcvogel"
const SESSION_FILE = join(tmpdir(), "ipg-spike-session.json")

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/** Two databases, never crossed. This script sends mail and mutates auth rows. */
function assertDevTest(url: string): string {
  const ref = new URL(url).hostname.split(".")[0]
  if (ref !== DEV_TEST_REF) {
    console.error(`REFUSING: project ref is "${ref}", expected dev-test "${DEV_TEST_REF}".`)
    process.exit(1)
  }
  return ref
}

function client(): SupabaseClient {
  const url = env("NEXT_PUBLIC_SUPABASE_URL")
  assertDevTest(url)
  return createClient(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Full error shape, not a friendly string: knowing the shape is the point. */
function show(label: string, value: unknown) {
  console.log(`\n--- ${label}`)
  console.log(JSON.stringify(value, null, 2))
}

function saveSession(s: { access_token: string; refresh_token: string } | null) {
  if (!s) return
  writeFileSync(SESSION_FILE, JSON.stringify(s), { mode: 0o600 })
  console.log(`\n[session saved to ${SESSION_FILE}]`)
}

async function restoreSession(sb: SupabaseClient) {
  if (!existsSync(SESSION_FILE)) throw new Error(`No saved session. Run "attach" first.`)
  const s = JSON.parse(readFileSync(SESSION_FILE, "utf8"))
  const { data, error } = await sb.auth.setSession(s)
  if (error) throw error
  return data.user
}

// ── Q1, Q4, Q6: reachable with no inbox ──────────────────────────────────────
async function probe() {
  const sb = client()
  console.log(`Project ref: ${assertDevTest(env("NEXT_PUBLIC_SUPABASE_URL"))} (dev-test)`)

  const anon = await sb.auth.signInAnonymously()
  show("Q1a signInAnonymously()", {
    error: anon.error,
    userId: anon.data.user?.id,
    is_anonymous: anon.data.user?.is_anonymous,
    email: anon.data.user?.email,
  })

  // Q4: an unknown address must be refused, and the copy depends on how.
  const unknown = `spike-nobody-${Date.now()}@example.com`
  const otp = await sb.auth.signInWithOtp({
    email: unknown,
    options: { shouldCreateUser: false },
  })
  show(`Q4 signInWithOtp(unknown, shouldCreateUser:false) [${unknown}]`, {
    error: otp.error,
    errorCode: otp.error?.code,
    status: otp.error?.status,
    data: otp.data,
  })
}

// ── Q1, Q3: sends real mail to a real inbox ──────────────────────────────────
async function attach(email: string) {
  const sb = client()
  const anon = await sb.auth.signInAnonymously()
  if (anon.error) return show("signInAnonymously FAILED", anon.error)
  saveSession(anon.data.session as never)
  console.log(`anonymous user: ${anon.data.user?.id}`)

  const upd = await sb.auth.updateUser({ email })
  show("Q1b updateUser({ email }) on an anonymous user", {
    error: upd.error,
    errorCode: upd.error?.code,
    status: upd.error?.status,
    user: upd.data.user
      ? {
          id: upd.data.user.id,
          email: upd.data.user.email,
          new_email: (upd.data.user as { new_email?: string }).new_email,
          is_anonymous: upd.data.user.is_anonymous,
        }
      : null,
  })
  console.log("\nCheck the inbox. Q3: did it arrive as a 6-digit CODE or a LINK?")
}

// ── Q2: which verifyOtp type does an anonymous attach need? ──────────────────
async function confirm(email: string, code: string) {
  const types = ["email_change", "email", "signup", "magiclink"] as const
  for (const type of types) {
    const sb = client()
    try {
      await restoreSession(sb)
    } catch (e) {
      console.log(`(no session to restore: ${(e as Error).message})`)
    }
    const res = await sb.auth.verifyOtp({ email, token: code, type: type as never })
    show(`Q2 verifyOtp(type: "${type}")`, {
      error: res.error,
      errorCode: res.error?.code,
      status: res.error?.status,
      userId: res.data.user?.id,
      email: res.data.user?.email,
      is_anonymous: res.data.user?.is_anonymous,
    })
    if (!res.error) {
      console.log(`\n*** WORKS: type "${type}" ***`)
      saveSession(res.data.session as never)
      return
    }
  }
  console.log("\nNone of the candidate types worked. Do not guess; re-plan.")
}

// ── Q5: sign-in returns the ORIGINAL user, matching the Prisma row ───────────
async function signin(email: string) {
  const sb = client()
  const res = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  show("Q5a signInWithOtp(known email, shouldCreateUser:false)", {
    error: res.error,
    errorCode: res.error?.code,
    status: res.error?.status,
    data: res.data,
  })
}

async function verifySignin(email: string, code: string) {
  const sb = client()
  const res = await sb.auth.verifyOtp({ email, token: code, type: "email" })
  show('Q5b verifyOtp(type: "email")', {
    error: res.error,
    errorCode: res.error?.code,
    userId: res.data.user?.id,
    email: res.data.user?.email,
    is_anonymous: res.data.user?.is_anonymous,
  })
  console.log("\nCompare userId against the id printed by `attach`. They MUST match.")
}

const [cmd, a, b] = process.argv.slice(2)
const run = async () => {
  switch (cmd) {
    case "probe": return probe()
    case "attach": return attach(a)
    case "confirm": return confirm(a, b)
    case "signin": return signin(a)
    case "verify-signin": return verifySignin(a, b)
    default:
      console.log("Commands: probe | attach <email> | confirm <email> <code> | signin <email> | verify-signin <email> <code>")
  }
}
run().catch((e) => {
  console.error("\nUNCAUGHT:", e)
  process.exit(1)
})
