#!/usr/bin/env node
// Blocks Claude Code from editing applied migrations and .env files.
// It reads the tool call as JSON on stdin, checks the target file path,
// and exits with code 2 (which tells Claude Code to block the edit) if the
// path is protected. schema.prisma is intentionally NOT protected, because
// editing it is the legitimate way to evolve the model; migrations are
// generated from it by the Prisma CLI, which this hook does not touch.

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0); // if we cannot parse the input, do not block
  }

  const path = (data && data.tool_input && data.tool_input.file_path) || "";

  const protectedPatterns = [
    /(^|\/)\.env(\.|$)/, // .env, .env.local, .env.production, etc.
    /(^|\/)prisma\/migrations\//, // any already-applied migration file
  ];

  const isProtected = protectedPatterns.some((re) => re.test(path));

  if (isProtected) {
    console.error(
      `Blocked: ${path} is a protected file (an applied migration or an env/secrets file). ` +
        `Do not edit it directly. Ask Jacob to make the change by hand. ` +
        `Note: schema.prisma is editable; migrations are generated from it via the Prisma CLI.`
    );
    process.exit(2);
  }

  process.exit(0);
});