// Shared by lib/mcp-tools.ts and lib/executor.ts — both write to call_log
// and both need the same size guard before a request/response value goes
// into a jsonb column.

const MAX_JSON_CHARS = 20_000;

// A value from a scrubbed API response can still be arbitrarily large —
// scrubbing removes secrets, not size. Cap it before insert rather than
// let one call bloat call_log indefinitely; a stored marker beats a
// silently truncated JSON string that no longer parses as valid JSON.
export function capJson(value: unknown): unknown {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  if (text.length <= MAX_JSON_CHARS) return value;
  return { truncated: true, originalLength: text.length, preview: text.slice(0, MAX_JSON_CHARS) };
}
