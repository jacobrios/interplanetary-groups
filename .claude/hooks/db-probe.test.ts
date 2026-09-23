// The probe answers one question before the full suite runs: is the database
// answering at all? It has to answer it through the same door the tests use,
// the `pg` driver with DATABASE_URL as the test runner sees it, because a
// pooler that is up but refusing logins is exactly the outage this exists for,
// and a check that only asked "is the server there" would call it healthy.
//
// Two layers, like the hooks' own tests. The pure pieces (where the URL comes
// from, which code gets printed) are tested directly. The script itself is run
// for real against an address nothing listens on, which is the only way to
// prove it gives up quickly and says why, rather than hanging the stop hook.

import { spawnSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { errorCode, resolveDatabaseUrl } from "./db-probe.mjs"

const PROBE = fileURLToPath(new URL("./db-probe.mjs", import.meta.url))
const DEAD = "postgresql://nobody:nobody@127.0.0.1:1/none"

const cleanup: string[] = []
afterEach(() => {
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true })
})
function dir() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "db-probe-")))
  cleanup.push(d)
  return d
}

describe("which DATABASE_URL the probe checks", () => {
  it("prefers the environment, the same way the test runner's dotenv does", () => {
    const root = dir()
    writeFileSync(join(root, ".env"), "DATABASE_URL=postgresql://from-file/db\n")
    expect(resolveDatabaseUrl(root, { DATABASE_URL: "postgresql://from-env/db" })).toBe(
      "postgresql://from-env/db"
    )
  })

  it("falls back to the project's .env, quotes and all", () => {
    const root = dir()
    writeFileSync(join(root, ".env"), 'OTHER=1\nDATABASE_URL="postgresql://from-file/db"\n')
    expect(resolveDatabaseUrl(root, {})).toBe("postgresql://from-file/db")
  })

  it("reports none when neither has one, which means there is nothing to check", () => {
    expect(resolveDatabaseUrl(dir(), {})).toBeNull()
  })
})

describe("the code the probe reports", () => {
  it("lifts the pooler's own code out of its message", () => {
    const err = new Error("(ECIRCUITBREAKER) too many authentication failures")
    expect(errorCode(err)).toBe("ECIRCUITBREAKER")
  })

  it("uses the driver's code when the message carries none", () => {
    expect(errorCode(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }))).toBe(
      "ECONNREFUSED"
    )
  })

  it("never returns an empty code", () => {
    expect(errorCode(new Error("?"))).toBe("ERROR")
  })
})

describe("the probe, run for real", () => {
  it("says unreachable, with a code, quickly, when nothing answers", () => {
    const started = Date.now()
    const r = spawnSync(process.execPath, [PROBE], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: DEAD },
      encoding: "utf8",
    })
    expect(r.status).toBe(1)
    expect(r.stdout.trim()).toMatch(/^E[A-Z]+$/)
    expect(Date.now() - started).toBeLessThan(8_000)
  })

  it("steps aside when the project has no database driver to check with", () => {
    const root = dir()
    writeFileSync(join(root, "package.json"), "{}")
    const r = spawnSync(process.execPath, [PROBE], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: DEAD },
      encoding: "utf8",
    })
    expect(r.status).toBe(3)
  })

  it("steps aside when there is no DATABASE_URL at all", () => {
    const root = dir()
    const env = { ...process.env }
    delete env.DATABASE_URL
    const r = spawnSync(process.execPath, [PROBE], { cwd: root, env, encoding: "utf8" })
    expect(r.status).toBe(3)
  })
})
