#!/usr/bin/env bash
# QA for the test-gate split: proves the per-edit hook got fast and the per-task
# hook still runs everything. Drives both hooks with the same JSON Claude Code
# sends them, so what it shows is the real mechanism rather than a description
# of it.
#
# Run it from anywhere; it finds the repo itself. Takes about two minutes,
# almost all of it step 3, which is the full suite doing its job.
#
#   bash scripts/qa-test-hooks.sh
#
# Nothing here writes to the database or the repo. The only state it touches is
# the hooks' own stamp files in the system temp directory, which the hooks
# rewrite in normal use anyway.
#
# On the output filter, which is deliberately dull: the first version of this
# script filtered for two exact labels, and on the owner's terminal one of them
# came back empty while it matched on the machine that wrote it. A filter that
# can silently drop a line reads as a broken build. So this one uses plain
# fixed strings, and when it matches nothing it prints the raw tail instead of
# printing nothing. Same lesson as PRs #43 and #45, third time around.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1

say() { printf '\n%s\n' "$1"; }   # starts a block
and() { printf '%s\n' "$1"; }     # continues one, without the blank line

# Drive a hook with the JSON the harness would send, then show the summary.
# $1 = hook filename, $2 = the JSON payload.
drive() {
  local started out
  started=$(date +%s)
  out=$(printf '%s' "$2" | node ".claude/hooks/$1" 2>&1)

  if printf '%s\n' "$out" | /usr/bin/grep -F -e "Test Files" -e "Tests " -e "No test files"; then
    :
  elif [ -n "$out" ]; then
    and "   (no summary line found, so here is the raw tail)"
    printf '%s\n' "$out" | tail -12
  fi

  printf '   took %s seconds\n' "$(($(date +%s) - started))"
}

edit_payload() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/%s"},"cwd":"%s"}' "$ROOT" "$1" "$ROOT"
}

finish_payload() {
  printf '{"hook_event_name":"SubagentStop","cwd":"%s","stop_hook_active":false}' "$ROOT"
}

say "Repo: $ROOT"

# ---------------------------------------------------------------------------
say "STEP 1 of 4  A source-file edit. This used to run all 87 files."
and "            Expect: 2 files, 17 tests, a few seconds."
drive run-tests-unless-docs.mjs "$(edit_payload src/lib/events/ics.ts)"

# ---------------------------------------------------------------------------
say "STEP 2 of 4  A documentation edit. Expect no test output at all, and"
and "            near-zero seconds: a .md file cannot change what code does."
drive run-tests-unless-docs.mjs "$(edit_payload README.md)"

# ---------------------------------------------------------------------------
say "STEP 3 of 4  A task's agent finishes with step 1's edit still waiting."
and "            Expect: all 87 files, 873 tests, green, about 80 seconds."
and "            This is the gate that used to run after every single edit."
drive full-suite-on-subagent-stop.mjs "$(finish_payload)"

# ---------------------------------------------------------------------------
say "STEP 4 of 4  A second agent finishes and nothing new was edited, which is"
and "            every reviewer and explorer agent. Expect no output, under a"
and "            second, because there is nothing left for the suite to catch."
drive full-suite-on-subagent-stop.mjs "$(finish_payload)"

say "Done. Empty output under steps 2 and 4 is the pass, not a broken step."
and "Steps 1 and 3 should each show a Test Files line AND a Tests line; if"
and "either is missing you will see a raw tail instead of silence."
