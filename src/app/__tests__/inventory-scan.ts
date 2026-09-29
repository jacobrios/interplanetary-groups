import { execFileSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

/**
 * Every file under src/ whose name matches one of `globs` and whose text
 * contains `pattern`, sorted, as paths relative to `cwd`.
 *
 * Committed and not-yet-committed files both count, because the stop hook runs
 * these guards mid-build, before anything is committed. Files named in
 * .gitignore or .git/info/exclude do not, so a throwaway design preview can sit
 * in src/ without turning the inventory guards red (28 Sept 2026: an excluded
 * src/app/zz-mock/ did exactly that on every turn under a plain `grep -r`).
 *
 * The email guard (no-email-address-on-screen.test.tsx) deliberately does NOT
 * use this: it keeps scanning every file, previews included, because a missed
 * address read costs far more than a false alarm on a mock.
 *
 * No shell, so the bracketed route directories cannot be glob-expanded.
 */
export function filesContaining(
  pattern: string,
  globs: string[],
  cwd: string = process.cwd()
): string[] {
  // git grep exits 1 both for "no match" and for "no file matched the path",
  // so a wrong working folder would read as a clean pass. The old grep -r
  // failed loudly there; keep that.
  if (!existsSync(join(cwd, "src"))) throw new Error(`no src/ folder in ${cwd}`)
  // `src/*.tsx` in a git pathspec matches at any depth under src/, since `*`
  // crosses `/` there. `-F` matches the pattern as plain text, so a `.` or `*`
  // in a future pattern is not read as a regular expression.
  const pathspecs = globs.map((g) => `src/${g}`)
  try {
    const out = execFileSync(
      "git",
      ["grep", "-l", "-F", "--untracked", pattern, "--", ...pathspecs],
      { cwd, encoding: "utf8" }
    )
    return out.split("\n").filter(Boolean).sort()
  } catch (err) {
    // git grep exits 1 for "no match", which is an answer, not an error.
    if ((err as { status?: number }).status === 1) return []
    throw err
  }
}
