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
    // Serializes LOCK-TAKING suite runs for this checkout, so two independent
    // runs never contend for the single dev-test database. That wording is
    // exact and the weaker claim is the true one: it is NOT "two vitest
    // processes never overlap here". run-tests-unless-docs.test.ts:248 spawns
    // a nested `vitest related` that skips the lock by design (see the
    // re-entrancy note below), and what that child selects reaches
    // calendar.ics/route.test.ts, which does real Prisma work against this
    // same database while the parent suite runs. So one nested run overlaps
    // on EVERY full-suite run. That predates this lock and is unchanged by
    // it; it is written down because the incident below has exactly that
    // shape, and a reader who believed the stronger claim would rule it out
    // wrongly. Adopted from
    // ~/.claude/templates/project-safety-nets/suite-lock.mjs on 3 Sept 2026,
    // after a subagent's own `npm test` ran at the moment the stop hook ran
    // the suite: connections ran out, a Prisma transaction could not start,
    // and the suite went red naming invite-token.test.ts, a file nobody had
    // touched. Run alone seconds later it was 1704 of 1704. A red suite
    // pointing at innocent code sends whoever reads it to debug something
    // that was never broken, which is why this is machinery and not a habit.
    //
    // A globalSetup rather than a lock inside the stop hook, and that is the
    // load-bearing choice rather than an implementation detail: a lock only
    // works if every party takes it, and one of the two colliding parties is
    // an agent typing `npm test`, which never calls into a hook. vitest reads
    // this config at the start of every invocation, whoever started it, so
    // both parties take it. Do not "simplify" this into the hook.
    //
    // Scope, worth knowing before trusting it: since 24 Sept 2026 the lock is
    // keyed on the git REPOSITORY, not on process.cwd(), so every worktree of
    // this repo takes turns on the one dev-test database. (Before that it was
    // per checkout and two worktrees did not block each other.) The limit that
    // remains: this file loads the lock from each checkout's own branch, so a
    // worktree cut before that change still runs the old per-folder lock until
    // it catches up with main, and the two do not see each other.
    //
    // WHAT THIS DOES AND DOES NOT RECLAIM, because the earlier version of this
    // comment claimed more than the mechanism delivers and that is this repo's
    // recurring sin. A holder writes a heartbeat every few seconds, and its lock
    // is taken only when the holder is GONE or its main event loop has been
    // blocked for the silence window. It does NOT reclaim the ordinary ways a
    // run wedges: an await that never settles, a hung setup or teardown, a
    // database disconnect that never returns. Every one of those leaves the
    // event loop turning, so the heartbeat keeps beating and the lock keeps
    // reading as healthy. The concrete in-repo instance is
    // run-tests-unless-docs.test.ts's spawnSync with no timeout, which blocks a
    // pool worker outright while this process beats on.
    //
    // A run on this checkout was once blocked for 308 minutes behind a holder
    // that ps showed alive and idle. Nobody ever established whether that
    // holder's loop was turning, so nobody knows whether a heartbeat would have
    // freed it. If it happens again, get a stack from the holder and find out
    // BEFORE touching the silence window; tuning that number against an
    // undiagnosed incident is how the last two versions of this file were
    // designed.
    globalSetup: ["./.claude/hooks/suite-lock.mjs"],
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
