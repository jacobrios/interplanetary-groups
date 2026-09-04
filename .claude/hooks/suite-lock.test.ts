// Tests for suite-lock.mjs, the vitest globalSetup that keeps two suite runs
// off one database at the same time.
//
// Every test injects the clock, the sleep and the liveness probe, so none of
// them waits on real time or depends on a real process id. The lock file
// itself is real, because atomic exclusive create is the thing under test and
// faking the filesystem would test the fake.
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { acquire, lockPath, HELD_ENV } from "./suite-lock.mjs"

const ROOT = "/tmp/suite-lock-test-project"
const PATH = lockPath(ROOT)

beforeEach(() => {
  mkdirSync(dirname(PATH), { recursive: true })
  rmSync(PATH, { force: true })
})
afterEach(() => rmSync(PATH, { force: true }))

describe("acquire", () => {
  it("takes a free lock and records the holder", async () => {
    const release = await acquire({ root: ROOT, pid: 111 })
    expect(existsSync(PATH)).toBe(true)
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111)
    release()
    expect(existsSync(PATH)).toBe(false)
  })

  it("waits while a live holder keeps the lock, then takes it", async () => {
    writeFileSync(PATH, JSON.stringify({ pid: 222, at: Date.now() }))
    let polls = 0
    const promise = acquire({
      root: ROOT,
      pid: 111,
      isAlive: (pid) => pid === 222 && polls < 3,
      sleep: async () => {
        polls++
      },
    })
    const release = await promise
    expect(polls).toBe(3) // it really waited rather than barging in
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111)
    release()
  })

  it("steals a lock whose holder is gone", async () => {
    writeFileSync(PATH, JSON.stringify({ pid: 999, at: Date.now() }))
    const release = await acquire({ root: ROOT, pid: 111, isAlive: () => false })
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111)
    release()
  })

  it("steals a lock older than the stale window even if the pid looks alive", async () => {
    const t0 = 1_000_000_000_000
    writeFileSync(PATH, JSON.stringify({ pid: 222, at: t0 }))
    const release = await acquire({
      root: ROOT,
      pid: 111,
      now: () => t0 + 600_001,
      isAlive: () => true,
    })
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111)
    release()
  })

  it("steals an unreadable lock rather than blocking on it forever", async () => {
    writeFileSync(PATH, "half-written garbage")
    const release = await acquire({ root: ROOT, pid: 111, isAlive: () => true })
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111)
    release()
  })

  it("throws a message naming the wait, not a test, when it gives up", async () => {
    const t0 = 1_000_000_000_000
    let t = t0
    writeFileSync(PATH, JSON.stringify({ pid: 222, at: t0 }))
    await expect(
      acquire({
        root: ROOT,
        pid: 111,
        waitMs: 1000,
        now: () => t,
        isAlive: () => true,
        sleep: async () => {
          t += 400
        },
      })
    ).rejects.toThrow(/waited 1s for another test run/)
    // The suite must be able to tell this apart from a real failure.
    expect(existsSync(PATH)).toBe(true) // the other run still holds it
  })

  it("release does not remove a lock that has been taken over", async () => {
    const release = await acquire({ root: ROOT, pid: 111 })
    writeFileSync(PATH, JSON.stringify({ pid: 333, at: Date.now() }))
    release()
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(333)
  })

  it("keys the lock per project, so two projects never block each other", () => {
    expect(lockPath("/tmp/project-a")).not.toBe(lockPath("/tmp/project-b"))
  })
})

// A suite can legitimately spawn a nested vitest in the same checkout; this
// project's own run-tests-unless-docs test does exactly that. Without these,
// the child waits for a lock its parent holds and the suite hangs. Found by
// adopting the first version of this file, which deadlocked on contact.
describe("re-entrancy", () => {
  it("lets a nested run through instead of waiting for its own parent", async () => {
    const env: Record<string, string> = {}
    const outer = await acquire({ root: ROOT, pid: 111, env })
    const inner = await acquire({ root: ROOT, pid: 222, env, waitMs: 0 })
    inner()
    expect(JSON.parse(readFileSync(PATH, "utf8")).pid).toBe(111) // parent's lock survives
    outer()
    expect(existsSync(PATH)).toBe(false)
    expect(env[HELD_ENV]).toBeUndefined()
  })

  it("marks the tree with this project's lock path, so children inherit it", async () => {
    const env: Record<string, string> = {}
    const release = await acquire({ root: ROOT, pid: 111, env })
    expect(env[HELD_ENV]).toBe(lockPath(ROOT))
    release()
  })

  it("still locks a DIFFERENT project reached from inside a held run", async () => {
    const other = "/tmp/suite-lock-test-other"
    rmSync(lockPath(other), { force: true })
    const env: Record<string, string> = {}
    const outer = await acquire({ root: ROOT, pid: 111, env })
    const inner = await acquire({ root: other, pid: 222, env })
    expect(existsSync(lockPath(other))).toBe(true)
    inner()
    outer()
  })

  it("ignores a marker belonging to some other project", async () => {
    const env: Record<string, string> = { [HELD_ENV]: "/some/other/projects/lock" }
    const release = await acquire({ root: ROOT, pid: 111, env })
    expect(existsSync(PATH)).toBe(true)
    release()
  })
})
