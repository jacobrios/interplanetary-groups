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
  local started out code
  started=$(date +%s)
  out=$(printf '%s' "$2" | node ".claude/hooks/$1" 2>&1)
  code=$?

  if printf '%s\n' "$out" | /usr/bin/grep -F -e "Test Files" -e "Tests " -e "No test files"; then
    :
  elif [ -n "$out" ]; then
    and "   (no summary line found, so here is the raw tail)"
    printf '%s\n' "$out" | tail -12
  fi

  # The exit code is the whole contract with Claude Code: 2 is the only value it
  # feeds back to the agent that caused the failure. Printed on every step so
  # step 5 has something to be compared against.
  printf '   exit code %s, took %s seconds\n' "$code" "$(($(date +%s) - started))"
  return "$code"
}

edit_payload() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/%s"},"cwd":"%s"}' "$ROOT" "$1" "$ROOT"
}

finish_payload() {
  printf '{"hook_event_name":"SubagentStop","cwd":"%s","stop_hook_active":false}' "$ROOT"
}

say "Repo: $ROOT"

# ---------------------------------------------------------------------------
say "STEP 1 of 5  A source-file edit. This used to run the whole suite."
and "            Expect: a couple of files, a handful of tests, a few seconds,"
and "            exit code 0."
drive run-tests-unless-docs.mjs "$(edit_payload src/lib/events/ics.ts)"

# ---------------------------------------------------------------------------
say "STEP 2 of 5  A documentation edit. Expect no test output at all, and"
and "            near-zero seconds: a .md file cannot change what code does."
drive run-tests-unless-docs.mjs "$(edit_payload README.md)"

# ---------------------------------------------------------------------------
say "STEP 3 of 5  A task's agent finishes with step 1's edit still waiting."
and "            Expect: the whole suite, green, roughly 80 seconds, exit 0."
and "            This is the gate that used to run after every single edit."
step3=0
drive full-suite-on-subagent-stop.mjs "$(finish_payload)" || step3=$?

# ---------------------------------------------------------------------------
say "STEP 4 of 5  A second agent finishes and nothing new was edited, which is"
and "            every reviewer and explorer agent. Expect no output, under a"
and "            second, because there is nothing left for the suite to catch."
if [ "$step3" -ne 0 ]; then
  and "            NOTE: step 3 did not come back clean, so the debt was not"
  and "            cleared and this step will run the whole suite again. That"
  and "            is correct behavior, not a broken step."
fi
drive full-suite-on-subagent-stop.mjs "$(finish_payload)"

# ---------------------------------------------------------------------------
say "STEP 5 of 5  The part that matters most: a failure has to come back as"
and "            exit code 2, the only code Claude Code shows the agent that"
and "            caused it. This edits nothing; it points the hook at a file"
and "            whose tests are deliberately made to fail."
# The failing test has to live INSIDE the project, or the test runner never
# collects it and the step proves nothing. It is removed on the way out however
# this script ends, including a Ctrl-C. If you ever find this file lying around,
# a run was killed hard: delete it, it is not part of the suite.
broken="$ROOT/.claude/hooks/qa-deliberate-failure.test.ts"
trap 'rm -f "$broken"' EXIT INT TERM
cat > "$broken" <<'FAILING'
// Written and deleted by scripts/qa-test-hooks.sh. Not part of the suite.
import { expect, it } from "vitest"
it("fails on purpose, so the QA script can show the gate reporting failure", () => {
  expect(1).toBe(2)
})
FAILING
and "            Expect: 1 failed test, and exit code 2."
drive run-tests-unless-docs.mjs "$(edit_payload .claude/hooks/qa-deliberate-failure.test.ts)" || true
rm -f "$broken"

say "Done. Empty output under steps 2 and 4 is the pass, not a broken step."
and "Steps 1 and 3 should each show a Test Files line AND a Tests line; if"
and "either is missing you will see a raw tail instead of silence."
and ""
and "The two numbers to check: steps 1 to 4 all end in exit code 0, and step"
and "5 ends in exit code 2. Exit 2 is what puts a broken suite in front of the"
and "agent that broke it; any other number and the failure reaches nobody."
