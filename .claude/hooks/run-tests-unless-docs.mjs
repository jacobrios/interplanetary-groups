#!/usr/bin/env node
// PostToolUse hook: auto-run the test suite after file edits, skipping pure
// documentation edits. A .md edit cannot change runtime behavior, so running
// 97 tests against the live dev database on every docs touch is cost without
// signal. Everything else (source, schema, config, tests) runs the full suite
// exactly as before.
//
// Reads the tool call as JSON on stdin (same contract as protect-paths.mjs),
// checks the target file path, and either exits 0 (docs, skip) or runs
// `npx vitest run` and propagates its exit code so a failing suite still
// surfaces as hook feedback.

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
  process.exit(result.status ?? 1);
});
