#!/bin/bash
# Before-and-after demonstration for the protect-paths hook.
#
# This is the one check the test suite deliberately cannot do. The suite proves
# the guard behaves correctly today; this proves the guard's behavior CHANGED,
# by running every case against the hook as it stood before the fix and against
# the hook as it stands now, side by side. A check that cannot fail is not
# evidence, and the "before" column is what makes this one able to fail.
#
# The old hook is pulled from a pinned commit rather than from main, so this
# keeps working and keeps meaning the same thing after the fix is merged.
#
# Read-only. It writes nothing inside the repo, never opens .env or any
# migration file, and removes the one temp file it makes.

set -u

# The merge of PR #44: the last commit before path normalization landed.
BEFORE_REF="73ee046"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || { echo "cannot find the repo"; exit 1; }

NEW="$REPO/.claude/hooks/protect-paths.mjs"
[ -f "$NEW" ] || { echo "cannot find the hook at $NEW"; exit 1; }

OLD="$(mktemp -t oldhook)" || exit 1
trap 'rm -f "$OLD"' EXIT
git show "$BEFORE_REF:.claude/hooks/protect-paths.mjs" > "$OLD" 2>/dev/null || {
  echo "could not extract the pre-fix hook from $BEFORE_REF"; exit 1; }

PASS=0
FAIL=0

# Run a hook with a file_path and echo its exit code.
verdict() {
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s"}}' "$2" \
    | node "$1" > /dev/null 2>&1
  echo $?
}

# check <label> <path> <expected-before> <expected-now>
check() {
  label="$1"; p="$2"; want_old="$3"; want_new="$4"
  got_old="$(verdict "$OLD" "$p")"
  got_new="$(verdict "$NEW" "$p")"
  if [ "$got_old" = "$want_old" ] && [ "$got_new" = "$want_new" ]; then
    PASS=$((PASS+1)); status="ok  "
  else
    FAIL=$((FAIL+1)); status="FAIL"
  fi
  old_word="allowed"; [ "$got_old" = "2" ] && old_word="BLOCKED"
  new_word="allowed"; [ "$got_new" = "2" ] && new_word="BLOCKED"
  printf '  %s  before: %-7s  now: %-7s  %s\n' "$status" "$old_word" "$new_word" "$label"
}

M="20260801120000_add_gauge/migration.sql"

echo ""
echo "=============================================================="
echo " 1. The holes this closed."
echo "    Every one of these names an already-applied migration."
echo "=============================================================="
check "a double slash"                   "prisma//migrations/$M"          0 2
check "a here-segment"                   "prisma/./migrations/$M"         0 2
check "a step sideways and back"         "prisma/schema/../migrations/$M" 0 2
check "several redundant slashes"        "prisma///migrations//$M"        0 2
check "case plus a double slash"         "PRISMA//Migrations/$M"          0 2
check "an absolute path with both"       "/Users/me/app//prisma/./migrations/$M" 0 2
check "a long s instead of an s"         "priſma/migrations/$M"           0 2
check "that fold one folder along"       "prisma/migrationſ/$M"           0 2
check "a fold, a case change and two path tricks" "PRIſMA//Migrations/./$M" 0 2

echo ""
echo "=============================================================="
echo " 2. Already refused, and still refused. Nothing regressed."
echo "=============================================================="
check "a migration, spelled plainly"     "prisma/migrations/$M"           2 2
check "a migration, capitalised"         "prisma/Migrations/$M"           2 2
check "the secrets file"                 ".env"                           2 2
check "a local secrets override"         ".env.local"                     2 2
check "the secrets file, shouting"       ".ENV.local"                     2 2
check "a real secrets file that only starts like the example" ".env.example.local" 2 2

echo ""
echo "=============================================================="
echo " 3. Still editable. A guard that over-blocks is also wrong."
echo "=============================================================="
check "the schema"                       "prisma/schema.prisma"           0 0
check "the build notes"                  "docs/build-notes.md"            0 0
check "ordinary product code"            "src/lib/orbit/normalize.ts"     0 0
check "the committed placeholder file"   ".env.example"                   0 0
check "a package that merely ends in prisma" "node_modules/@prisma/migrations/index.js" 0 0
check "a French folder name"             "src/lib/café/index.ts"          0 0

echo ""
echo "=============================================================="
echo " 4. The one thing this deliberately UNBLOCKED."
echo "    This path writes schema.prisma, which is editable on"
echo "    purpose. The old guard refused it by accident."
echo "=============================================================="
check "a path that reads like a migration but writes the schema" \
      "prisma/migrations/x/../../schema.prisma" 2 0

echo ""
echo "=============================================================="
echo " 5. Malformed input must not crash the guard into letting"
echo "    a write through. Exit 1 would do exactly that."
echo "=============================================================="
for payload in '{"tool_input":{"file_path":["prisma/migrations/x.sql"]}}' \
               '{"tool_input":{"file_path":123}}' \
               '{"tool_input":{}}' \
               'not json at all'; do
  code="$(printf '%s' "$payload" | node "$NEW" > /dev/null 2>&1; echo $?)"
  if [ "$code" = "1" ]; then
    FAIL=$((FAIL+1)); printf '  FAIL  crashed (exit 1) on: %s\n' "$payload"
  else
    PASS=$((PASS+1)); printf '  ok    exit %s, no crash, on: %s\n' "$code" "$payload"
  fi
done

echo ""
echo "=============================================================="
echo " 6. The refusal explains itself, rather than just failing."
echo "=============================================================="
MSG="$(printf '{"tool_input":{"file_path":"prisma/schema/../migrations/%s"}}' "$M" \
       | node "$NEW" 2>&1 >/dev/null)"
echo "  The message the agent receives:"
echo ""
echo "    $MSG"
echo ""
if echo "$MSG" | grep -q "prisma/migrations/" && echo "$MSG" | grep -q "schema.prisma is editable"; then
  PASS=$((PASS+1)); echo "  ok    it names the real file it landed on, and the way forward"
else
  FAIL=$((FAIL+1)); echo "  FAIL  the message did not name the real file or the way forward"
fi

echo ""
echo "=============================================================="
echo " 7. These sneaky spellings really do reach the real migration"
echo "    on this Mac. Not theoretical: same file, same inode."
echo "=============================================================="
REAL_DIR="$(ls prisma/migrations 2>/dev/null | head -1)"
if [ -n "$REAL_DIR" ]; then
  node -e '
    const fs=require("fs"); const d=process.argv[1];
    const real="prisma/migrations/"+d+"/migration.sql";
    if(!fs.existsSync(real)){ console.log("  (no migration.sql to compare against)"); process.exit(0); }
    const ino=fs.statSync(real).ino;
    const spellings=["prisma//migrations/"+d+"/migration.sql",
                     "prisma/./migrations/"+d+"/migration.sql",
                     "priſma/migrations/"+d+"/migration.sql",
                     "prisma/migrationſ/"+d+"/migration.sql"];
    for(const s of spellings){
      let same=false; try{ same = fs.statSync(s).ino===ino; }catch{}
      console.log("  "+(same?"same file as the real migration":"does not resolve   ")+"  "+s);
    }
  ' "$REAL_DIR"
else
  echo "  (no migrations folder found)"
fi

echo ""
echo "=============================================================="
echo " 8. The ~/.claude template copy is byte-identical."
echo "=============================================================="
T="$HOME/.claude/templates/project-safety-nets"
for f in protect-paths.mjs protect-paths.test.ts; do
  if [ -f "$T/$f" ]; then
    a="$(shasum -a 256 ".claude/hooks/$f" | cut -d' ' -f1)"
    b="$(shasum -a 256 "$T/$f" | cut -d' ' -f1)"
    if [ "$a" = "$b" ]; then
      PASS=$((PASS+1)); printf '  ok    identical: %s\n' "$f"
    else
      FAIL=$((FAIL+1)); printf '  FAIL  drifted:   %s\n' "$f"
    fi
  else
    printf '  skipped: no template copy on this machine (%s)\n' "$f"
  fi
done

echo ""
echo "=============================================================="
printf ' %s passed, %s failed\n' "$PASS" "$FAIL"
echo "=============================================================="
echo ""
echo " Section 1's 'before' column is the guard at $BEFORE_REF letting"
echo " all nine through. That column is what proves these checks can"
echo " fail, so a clean run is evidence rather than decoration."
echo ""
[ "$FAIL" -eq 0 ] || exit 1
