// Where to go after signing in, from ?next=. Only a path on this site:
// "//evil.com" and "/\evil.com" are other sites to a browser, so they fall
// back to the fallback ("" means none: the caller sends people to their
// own account page, /<username>).
export function safeNext(next: string | string[] | undefined, fallback = ""): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next.slice(0, 2000);
}
