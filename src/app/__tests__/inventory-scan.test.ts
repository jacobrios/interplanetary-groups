import { execFileSync } from "child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { filesContaining } from "./inventory-scan"

// The inventory guards (screen-min-height, token-contrast) list every file
// that uses a token. They must see real work, committed or not, and must not
// see files the developer marked as throwaway in .git/info/exclude. Proved
// here in a scratch repository so no test writes into this project's src/.

let repo: string

function write(path: string, body: string) {
  mkdirSync(join(repo, path, ".."), { recursive: true })
  writeFileSync(join(repo, path), body)
}

// Inherited GIT_* variables (set when running inside a git hook) would point
// these commands at the real repository instead of the scratch one.
const cleanEnv = { ...process.env }
for (const key of Object.keys(cleanEnv)) {
  if (key.startsWith("GIT_")) delete cleanEnv[key]
}

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "ignore", env: cleanEnv })
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "inventory-scan-"))
  git("init", "-q")
  write("src/app/committed.tsx", "var(--x)")
  git("add", "-A")
  git("-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-qm", "seed")
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("filesContaining", () => {
  it("finds a committed file", () => {
    expect(filesContaining("var(--x)", ["*.tsx"], repo)).toEqual(["src/app/committed.tsx"])
  })

  it("finds a new file nobody has committed yet", () => {
    write("src/app/[id]/new.tsx", "var(--x)")
    expect(filesContaining("var(--x)", ["*.tsx"], repo)).toEqual([
      "src/app/[id]/new.tsx",
      "src/app/committed.tsx",
    ])
  })

  it("skips files marked as throwaway in .git/info/exclude", () => {
    write(".git/info/exclude", "src/app/zz-mock/\n")
    write("src/app/zz-mock/page.tsx", "var(--x)")
    expect(filesContaining("var(--x)", ["*.tsx"], repo)).toEqual(["src/app/committed.tsx"])
  })

  it("looks only under src and only at the listed extensions", () => {
    write("other/outside.tsx", "var(--x)")
    write("src/app/plain.ts", "var(--x)")
    expect(filesContaining("var(--x)", ["*.tsx"], repo)).toEqual(["src/app/committed.tsx"])
    expect(filesContaining("var(--x)", ["*.tsx", "*.ts"], repo)).toEqual([
      "src/app/committed.tsx",
      "src/app/plain.ts",
    ])
  })

  it("matches the pattern literally, not as a regular expression", () => {
    // A `.` in a regex matches any character, so without -F this would find
    // near.tsx. (Parentheses alone cannot prove it: basic regex treats them as
    // literal too, which is why the first version of this test could not fail.)
    write("src/app/near.tsx", "var(--xzy)")
    expect(filesContaining("var(--x.y)", ["*.tsx"], repo)).toEqual([])
  })

  it("fails loudly rather than passing when run from a folder with no src/", () => {
    expect(() => filesContaining("var(--x)", ["*.tsx"], join(repo, "src"))).toThrow(/no src/)
  })

  it("returns an empty list when nothing matches", () => {
    expect(filesContaining("nowhere", ["*.tsx"], repo)).toEqual([])
  })
})
