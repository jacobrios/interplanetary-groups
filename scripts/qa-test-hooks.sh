#!/usr/bin/env bash
# QA for the test-gate split: proves the per-edit hook got fast and the per-task
# hook still runs everything. Drives both hooks exactly as Claude Code drives
# them, with the same JSON on stdin.
#
# Run it from anywhere; it finds the repo itself. Takes about two minutes,
# almost all of it step 3, which is the full suite doing its job.
#
#   bash scripts/qa-test-hooks.sh
#
# Nothing here writes to the database or the repo. The only state it touches is
# the hooks' own stamp files in the system temp directory, which the hooks
# rewrite in normal use anyway.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1

say() { printf '\n%s\n' "$1"; }   # starts a block
and() { printf '%s\n' "$1"; }     # continues one, without the blank line
elapsed() { printf '   took %s seconds\n' "$(($(date +%s) - $1))"; }

say "Repo: $ROOT"

# ---------------------------------------------------------------------------
say "STEP 1 of 4  A source-file edit. This used to run all 87 files."
and "            Expect: 2 files, 17 tests, a few seconds."
t=$(date +%s)
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/src/lib/events/ics.ts"},"cwd":"%s"}' "$ROOT" "$ROOT" |
  node .claude/hooks/run-tests-unless-docs.mjs 2>&1 | grep -E "Test Files|Tests +[0-9]"
elapsed "$t"

# ---------------------------------------------------------------------------
say "STEP 2 of 4  A documentation edit. Expect no test output at all, and"
and "            near-zero seconds: a .md file cannot change what code does."
t=$(date +%s)
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/README.md"},"cwd":"%s"}' "$ROOT" "$ROOT" |
  node .claude/hooks/run-tests-unless-docs.mjs 2>&1 | grep -E "Test Files|Tests +[0-9]"
elapsed "$t"

# ---------------------------------------------------------------------------
say "STEP 3 of 4  A task's agent finishes with step 1's edit still waiting."
and "            Expect: all 87 files, 873 tests, green, about 80 seconds."
and "            This is the gate that used to run after every single edit."
t=$(date +%s)
printf '{"hook_event_name":"SubagentStop","cwd":"%s","stop_hook_active":false}' "$ROOT" |
  node .claude/hooks/full-suite-on-subagent-stop.mjs 2>&1 | grep -E "Test Files|Tests +[0-9]"
elapsed "$t"

# ---------------------------------------------------------------------------
say "STEP 4 of 4  A second agent finishes and nothing new was edited, which is"
and "            every reviewer and explorer agent. Expect no output, under a"
and "            second, because there is nothing left for the suite to catch."
t=$(date +%s)
printf '{"hook_event_name":"SubagentStop","cwd":"%s","stop_hook_active":false}' "$ROOT" |
  node .claude/hooks/full-suite-on-subagent-stop.mjs 2>&1 | grep -E "Test Files|Tests +[0-9]"
elapsed "$t"

say "Done. Empty output under steps 2 and 4 is the pass, not a broken step."
