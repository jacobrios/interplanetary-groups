// Serializes test-suite runs for one project, so two runs never contend for a
// single dev database. Wired as a vitest `globalSetup`, NOT as a Claude hook.
//
// THE INCIDENT (3 September 2026, interplanetary-groups)
// A subagent was running `npm test` as its own verification at the moment
// `full-suite-on-subagent-stop.mjs` fired and ran the suite too. That project
// has one dev-test database. The two runs contended for connections until a
// Prisma transaction could not start, and the suite went red naming
// `invite-token.test.ts`, a file nobody had touched. Run alone seconds later:
// 1704 of 1704 across 146 files.
//
// The misleading name is what makes this worth machinery rather than a habit.
// A red suite pointing at innocent code sends whoever reads it to debug
// something that was never broken, and the product manager cannot tell that
// report from a real one.
//
// WHY globalSetup AND NOT THE HOOK
// This is the load-bearing choice. A lock only works if every party takes it,
// and the two colliding parties are the hook's run and an agent's own typed
// `npm test`. A lock inside the hook covers one of them, so the collision
// survives in the case that actually happened. vitest reads its config at the
// start of every invocation, whoever started it, so a lock here covers both.
//
// Two consequences worth knowing. It protects a session that is already
// running, because the config is read per invocation rather than at session
// start, unlike a hook. And the hook file needs no change at all, so adopting
// this adds a file rather than editing one.
//
// WHY IT WAITS RATHER THAN TRUSTING
// The obvious cheaper design is to skip when another run is in flight and
// trust its result. That quietly weakens the gate: the other run may have
// started before the last edit, so its green does not cover the current tree.
// Waiting costs one extra suite length of background time, which is time
// nobody is sitting through. Trusting costs a gate that reports green without
// having checked.
//
// FAILING RATHER THAN PROCEEDING ON TIMEOUT
// If the wait times out, this throws instead of running anyway. Running anyway
// would reintroduce the exact misleading red this exists to prevent, while a
// throw says plainly what happened and names no innocent file.
//
// RE-ENTRANCY, AND WHY IT IS NOT OPTIONAL
// A suite can legitimately spawn a nested `vitest` in the same checkout.
// interplanetary-groups does exactly that: one test spawns `vitest related`
// for real, as the only proof that the per-edit gate selects what it claims
// to. Without re-entrancy the child waits for a lock its own parent holds, the
// parent waits for the child, and the whole suite hangs for the full timeout.
// Found on 3 September 2026 by adopting this file into that project, which is
// the only way it could have been found: the first version was never run
// against the suite it was written for, and it deadlocked on contact.
//
// A run that takes the lock records the lock path in an environment variable.
// A nested run sees this project's own path and skips acquiring. Keying on the
// path rather than a bare flag matters: a nested run against a DIFFERENT project
// still locks that project normally.
//
// HOW THE MARKER REACHES THE CHILD, stated precisely because the obvious answer
// is wrong and would misdirect whoever debugs this next. globalSetup runs in the
// vitest main process; the nested spawn happens in a pool worker, whose
// environment is rebuilt from process.env when the worker starts its tests,
// after global setup has run. So it depends on that ordering inside vitest, not
// on plain parent-to-child inheritance. (Reported by the reviewing session on
// 4 September 2026 from reading vitest's own code; not independently confirmed
// here.) If a future vitest snapshots worker environments earlier, the deadlock
// returns, and the symptom is a nested run waiting out WAIT_MS.
//
// WHAT THE GUARANTEE ACTUALLY IS, since the first version of this comment
// overclaimed it in exactly the shape of the incident it was written for. This
// delivers one LOCK-TAKING suite per checkout, not one suite per checkout. A
// nested run skips the lock by design and can still do real database work
// alongside its parent: in interplanetary-groups the nested `vitest related`
// reaches a route test that creates users, groups and events through Prisma
// while the parent suite runs. That predates this file and is not made worse by
// it, but a comment claiming the hole is closed is worse than the hole.
//
// WATCH MODE HOLDS THE LOCK, and that is correct. `vitest --watch` runs
// globalSetup once and tears it down only on close, so a watcher owns the lock
// for as long as it runs. It keeps beating while it does, so it reads as running
// rather than stuck and is never stolen from. Every other run in that checkout
// waits and then throws, which is honest: something really is using the database.
// Worth knowing before leaving a watcher running next to an agent that runs
// suites, because the agent will be told to wait rather than told why.
//
// WIRING (per project, in vitest.config.ts):
//   globalSetup: ["./.claude/hooks/suite-lock.mjs"]

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const LOCK_DIR = join(tmpdir(), "claude-suite-locks")

// A holder must prove it is WORKING, not merely existing. It touches its lock
// file every BEAT_MS while it runs, and a lock goes stale when its holder is
// gone or has been silent for SILENT_MS.
//
// Three states, and every one of them resolves without a human. That last part
// is Jacob's ruling on 4 September 2026: he does not want to be a gate on code
// execution, so no design that ends in "until somebody notices" is acceptable.
//   - alive and touching:        running, so wait
//   - alive and long silent:     stuck, so steal
//   - gone:                      steal
//
// Two earlier versions each collapsed a pair of those. Stealing any lock older
// than ten minutes treated a healthy `vitest --watch` as abandoned and silently
// put two suites back on one database. Liveness alone then treated a wedged run
// as healthy: an overnight suite here held the lock for 308 minutes, alive and
// idle, confirmed with ps, and blocked every run after it until a human killed
// it. Silence separates the two; neither age nor liveness can.
//
// The numbers are picked against measurements rather than roundness. The suite
// this guards runs 71 to 84 seconds, WAIT_MS is 300s, and the stop hook's budget
// is 600s. BEAT_MS at 5s means SILENT_MS at 120s is twenty-four missed beats, so
// a wrongly stolen lock needs a two-minute event-loop stall in a run whose whole
// length is under 90 seconds. And 120s sits well inside WAIT_MS, so a waiting run
// reclaims a stuck lock rather than waiting out its timeout and failing.
//
// Stated as silence, not as age, deliberately: age is a property of the run and
// varies per project, while silence is a property of the holder being stuck and
// does not.
const BEAT_MS = 5_000
const SILENT_MS = 120_000

// Shorter than the stop hook's own 600s budget, so a wait cannot silently
// consume it and turn into an invisible timeout on the hook instead.
const WAIT_MS = 300_000

const POLL_MS = 250

/**
 * Marks the process tree that already holds a lock. Its value is the lock path,
 * so the marker is per project rather than global.
 */
export const HELD_ENV = "CLAUDE_SUITE_LOCK_HELD"

/** Where this project's lock lives. Exported so tests can inspect and corrupt it. */
export function lockPath(root) {
  const key = createHash("sha256").update(resolve(String(root))).digest("hex").slice(0, 16)
  return join(LOCK_DIR, `${key}.lock`)
}

function readHolder(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    // Unreadable or half-written: treat as abandoned. A lock we cannot parse is
    // a lock we can never legitimately release.
    return null
  }
}

function alive(pid, isAlive) {
  if (isAlive) return isAlive(pid)
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stale(holder, now, isAlive) {
  if (!holder || typeof holder.pid !== "number") return true
  if (!alive(holder.pid, isAlive)) return true
  // `beat` falls back to `at` so a lock written by an older version, which never
  // touched itself, is judged by when it was taken rather than read as silent
  // from birth.
  const lastHeard = Number(holder.beat ?? holder.at ?? 0)
  return now - lastHeard > SILENT_MS
}

/**
 * Take the lock, waiting for a run already in flight. Resolves to a release
 * function. Throws if the wait exceeds WAIT_MS.
 *
 * The clock, the sleep and the liveness probe are injectable so the tests
 * neither wait on real time nor depend on real process ids.
 */
export async function acquire({
  root,
  pid = process.pid,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  isAlive,
  waitMs = WAIT_MS,
  env = process.env,
  // Injectable so tests can drive the heartbeat by hand instead of waiting on a
  // real timer, and so a test can assert that a silent holder is reclaimed.
  startBeat = (touch) => {
    const timer = setInterval(() => {
      if (!touch()) clearInterval(timer)
    }, BEAT_MS)
    if (typeof timer.unref === "function") timer.unref()
    return { stop: () => clearInterval(timer) }
  },
  // Injectable so a test can force a non-EEXIST failure, which is the path that
  // used to spin forever and cannot be provoked from a normal filesystem.
  write = (p, data) => writeFileSync(p, data, { flag: "wx" }),
} = {}) {
  const path = lockPath(root)

  // Already inside a run holding this project's lock: take no lock, and release
  // nothing on teardown, so a nested run cannot free its parent's.
  if (env[HELD_ENV] === path) return () => {}

  mkdirSync(LOCK_DIR, { recursive: true })
  const startedWaiting = now()

  for (;;) {
    try {
      // 'wx' fails when the file exists, which is what makes this atomic
      // between two processes racing to create it.
      const takenAt = now()
      write(path, JSON.stringify({ pid, at: takenAt, beat: takenAt }))

      // Prove we are still working, rather than merely still existing. Rewrites
      // only our own lock: if ours went stale and someone else took it, beating
      // on would resurrect a lock we no longer hold. unref'd so a forgotten
      // interval can never be the thing keeping a process alive.
      const beat = startBeat(() => {
        const held = readHolder(path)
        if (!held || held.pid !== pid) return false
        try {
          writeFileSync(path, JSON.stringify({ ...held, beat: now() }))
        } catch {
          // A failed touch is not worth taking the suite down for. Miss enough
          // of them and this holder reads as stuck, which is the right answer.
        }
        return true
      })

      // Set before returning, so anything this run spawns inherits the marker.
      env[HELD_ENV] = path
      return () => {
        beat.stop()
        // Release only our own lock. If ours went stale and someone else took
        // it, deleting would hand a third run a lock nobody holds.
        const held = readHolder(path)
        if (held && held.pid === pid) rmSync(path, { force: true })
        if (env[HELD_ENV] === path) delete env[HELD_ENV]
      }
    } catch (err) {
      // Only "the file already exists" means someone else holds the lock. Every
      // other failure (read-only lock dir, disk full, EACCES, EMFILE) used to
      // fall through readHolder -> null -> stale -> a no-op remove -> continue,
      // with no sleep and no elapsed check, which is a tight 100% CPU spin that
      // never times out: a silent permanent hang inside the file whose job is
      // making failures legible. Found by review on 4 September 2026.
      if (err && err.code && err.code !== "EEXIST") throw err

      // Above the stale branch on purpose. When it sat below, any path that
      // reached `continue` skipped it entirely, which is what made the spin
      // unbounded rather than merely wasteful.
      const holder = readHolder(path)
      if (now() - startedWaiting >= waitMs) {
        throw new Error(
          `suite-lock: waited ${Math.round(waitMs / 1000)}s for another test run ` +
            `(pid ${holder && holder.pid}) and gave up. No test failed; the suite ` +
            `never started. Check whether a suite is stuck, then re-run.`
        )
      }

      if (stale(holder, now(), isAlive)) {
        rmSync(path, { force: true })
        continue
      }
      await sleep(POLL_MS)
    }
  }
}

/** vitest globalSetup: hold the lock for the whole run, release on teardown. */
export default async function setup() {
  const release = await acquire({ root: process.cwd() })
  return () => release()
}
