// Where to go after signing in, from ?next=. Only a path on this site:
// "//evil.com" and "/\evil.com" are other sites to a browser, so they fall
// back to the dashboard.
export function safeNext(next: string | string[] | undefined, fallback = "/app"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next.slice(0, 2000);
}
