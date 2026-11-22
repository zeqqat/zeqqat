// What the dashboard may show of an API key: its prefix and its last 4
// characters, never the middle. A prefix is what Dokploy puts in front of a
// key when you set one ("zqprod_..."), so it runs up to the first _ or -
// in the first 21 characters; a key with none shows its first 4. Short keys
// show less, so the hint never gives away most of a key.
export type KeyHint = { start: string; end: string };

export function keyHint(key: string): KeyHint {
  const k = key.trim();
  if (k.length < 12) return { start: "", end: k.length >= 8 ? k.slice(-2) : "" };
  const prefix = /^[A-Za-z0-9]{1,20}[_-]/.exec(k)?.[0];
  const start = prefix && prefix.length <= k.length - 8 ? prefix : k.slice(0, 4);
  return { start, end: k.slice(-4) };
}
