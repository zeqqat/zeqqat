#!/usr/bin/env bash
# Stop: before Claude finishes, run the full checks, plus browser tests when
# UI code changed. Exit 2 blocks Claude from finishing. After 3 failed
# attempts in a row it stops blocking and hands over to a human, so a check
# Claude can't fix doesn't trap it in a loop.
set -uo pipefail

MAX_ATTEMPTS=3

session_id=$(jq -r '.session_id // "unknown"')
counter="${TMPDIR:-/tmp}/zeqqat-stop-attempts-${session_id}"

cd "$CLAUDE_PROJECT_DIR" || exit 0

log=$(mktemp)
trap 'rm -f "$log"' EXIT

run_checks() {
  pnpm check >"$log" 2>&1 || return 1

  # Browser tests are slow, so only run them when UI code changed on this
  # branch: committed since it left main, uncommitted, or untracked.
  local base
  base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || echo HEAD)
  if {
    git diff --name-only "$base"
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | grep -qE '^(app|components)/'; then
    pnpm test:e2e >>"$log" 2>&1 || return 1
  fi
}

if run_checks; then
  rm -f "$counter"
  exit 0
fi

attempts=$(($(cat "$counter" 2>/dev/null || echo 0) + 1))

if [ "$attempts" -gt "$MAX_ATTEMPTS" ]; then
  rm -f "$counter"
  jq -n --arg n "$MAX_ATTEMPTS" \
    '{systemMessage: "Checks still fail after \($n) attempts and need human attention. Run pnpm check (and pnpm test:e2e if UI changed) to see the failures."}'
  exit 0
fi

echo "$attempts" >"$counter"
echo "Checks failed (attempt $attempts of $MAX_ATTEMPTS). Fix them before finishing. Last lines of output:" >&2
tail -30 "$log" >&2
exit 2
