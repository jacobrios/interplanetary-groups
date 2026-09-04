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
// A child process inherits that variable (spawn inherits the environment by
// default, so no call site changes), sees this project's own path, and skips
// acquiring. The guarantee is unchanged, one suite per checkout, because a
// process that inherited the marker is provably inside the run that holds it.
// Keying on the path rather than a bare flag matters: a nested run against a
// DIFFERENT project still locks that project normally.
//
// WIRING (per project, in vitest.config.ts):
//   globalSetup: ["./.claude/hooks/suite-lock.mjs"]

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const LOCK_DIR = join(tmpdir(), "claude-suite-locks")

// Longer than any suite this is meant to guard. A lock older than this is
// assumed abandoned by a killed process, because a stuck lock nobody can clear
// would take the suite down permanently, which is worse than a rare collision.
const STALE_MS = 600_000

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
  if (now - Number(holder.at || 0) > STALE_MS) return true
  return !alive(holder.pid, isAlive)
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
      writeFileSync(path, JSON.stringify({ pid, at: now() }), { flag: "wx" })
      // Set before returning, so anything this run spawns inherits the marker.
      env[HELD_ENV] = path
      return () => {
        // Release only our own lock. If ours went stale and someone else took
        // it, deleting would hand a third run a lock nobody holds.
        const held = readHolder(path)
        if (held && held.pid === pid) rmSync(path, { force: true })
        if (env[HELD_ENV] === path) delete env[HELD_ENV]
      }
    } catch {
      const holder = readHolder(path)
      if (stale(holder, now(), isAlive)) {
        rmSync(path, { force: true })
        continue
      }
      if (now() - startedWaiting >= waitMs) {
        throw new Error(
          `suite-lock: waited ${Math.round(waitMs / 1000)}s for another test run ` +
            `(pid ${holder && holder.pid}) and gave up. No test failed; the suite ` +
            `never started. Check whether a suite is stuck, then re-run.`
        )
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
