import { defineConfig, configDefaults } from "vitest/config"
import { config } from "dotenv"
import path from "path"

// Load .env synchronously at config time so DATABASE_URL is in process.env
// before any test file imports src/lib/prisma.ts (which reads it at module load).
config()

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Testing Library's automatic cleanup does not register itself here,
    // because it looks for a global `afterEach`, and `globals` is off: it is
    // vitest's default and this repo deliberately leaves it that way, since
    // every test file imports describe/it/expect by name. Do not go looking
    // for a `globals` key above; there has never been one. vitest.setup.ts
    // registers cleanup by hand, and the reasoning, along with the failure it
    // was leaving behind, is in that file's header.
    setupFiles: ["./vitest.setup.ts"],
    // Most of this suite drives sequential Prisma round-trips against the
    // remote dev-test Supabase, and vitest's 5000ms default is sized for tests
    // that talk to something on the same machine. Measured on the proposals
    // promote file, each DB test lands between 4.2s and 5.4s, so the default
    // cut through the middle of that spread and files failed on the clock, not
    // on assertions (proposals/promote in PR #43, gauges/promote on 4 Aug).
    // 30s is roughly five times the observed worst case: headroom for remote
    // latency spiking on a bad network moment, still short enough that a
    // genuine hang surfaces in half a minute instead of stalling the suite.
    //
    // If a single file ever needs its own value again: a vi.setConfig at module
    // scope silently wins over this setting, and the same call inside beforeAll
    // or beforeEach runs, looks right, and quietly does nothing, because vitest
    // bakes each test's timeout in when it collects the file.
    testTimeout: 30_000,
    // The same reasoning, applied to the hooks. testTimeout above governs the
    // test body; setup and teardown are governed separately by hookTimeout,
    // which stayed at vitest's 10s default. Cleanup hooks in this suite do the
    // same sequential Prisma deletes against the same remote database, so they
    // were being cut off by a limit sized for a local one: digest/run and
    // orbit/endgame both failed on "Hook timed out in 10000ms" while every
    // assertion in them passed. Matched to testTimeout so one number covers the
    // whole file rather than the body alone.
    hookTimeout: 30_000,
    // A git worktree is a second checkout of this repo, and Claude Code places
    // them at .claude/worktrees/ by default: inside the project. Without this,
    // vitest walks into that copy and runs a duplicate of the entire suite,
    // while repo-scanning tests count the copy's files as new violations. One
    // worktree on 21 Aug 2026 produced five consecutive false failures of the
    // full-suite gate, and a gate that cries wolf stops being read.
    //
    // configDefaults.exclude is spread deliberately: assigning `exclude` REPLACES
    // vitest's defaults rather than adding to them, so writing this as a bare
    // array would quietly re-enable scanning node_modules and dist.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
})
