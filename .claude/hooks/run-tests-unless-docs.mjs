#!/usr/bin/env node
// PostToolUse hook: auto-run the test suite after file edits, skipping pure
// documentation edits. A .md edit cannot change runtime behavior, so running
// 97 tests against the live dev database on every docs touch is cost without
// signal. Everything else (source, schema, config, tests) runs the full suite
// exactly as before.
//
// Reads the tool call as JSON on stdin (same contract as protect-paths.mjs),
// checks the target file path, and either exits 0 (docs, skip) or runs
// `npx vitest run` and exits 2 when the suite fails, which is what puts the
// failure in front of the agent that caused it.
//
// Exit 2 specifically, not the suite's own exit code. Claude Code only feeds a
// hook's output back to the agent on exit 2; every other non-zero code is
// reported to the human and the agent carries on none the wiser. This hook used
// to propagate vitest's exit 1 and its header used to claim that surfaced as
// hook feedback, which was false: a broken suite was invisible to the thing that
// broke it. Corrected 31 July 2026, from b1-coach PR #9.

import { spawnSync } from "node:child_process";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input);
  } catch {
    // If we cannot parse the input, fall through to running the tests:
    // the conservative default is the pre-existing behavior (always run).
  }

  const path = (data && data.tool_input && data.tool_input.file_path) || "";

  if (path.toLowerCase().endsWith(".md")) {
    process.exit(0); // docs edit: skip the suite
  }

  const result = spawnSync("npx", ["vitest", "run"], { stdio: "inherit" });

  if (result.status !== 0) {
    console.error(
      "The test suite failed after this edit. Run the test suite to see which " +
        "tests broke, and fix them before continuing."
    );
    process.exit(2);
  }

  process.exit(0);
});
