#!/usr/bin/env bash
# PostToolUse: after Claude edits a file, run only the unit and regression
# tests related to that file. This must stay fast (seconds). If it gets slow,
# make it do less; the full suite runs in before-stop.sh.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

case "$file" in
  "$CLAUDE_PROJECT_DIR"/node_modules/* | "$CLAUDE_PROJECT_DIR"/.next/*) exit 0 ;;
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;; # outside the project
esac
case "$file" in
  *.ts | *.tsx | *.mts | *.js | *.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

if ! output=$(pnpm exec vitest related "$file" --run --passWithNoTests 2>&1); then
  echo "Tests related to $file fail:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
exit 0
