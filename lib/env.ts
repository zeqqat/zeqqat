// Every absolute URL in the app derives from this one env var (spec
// section 16) — no hardcoded hostname anywhere.
export function publicUrl(): string {
  const url = process.env.ZEQQAT_PUBLIC_URL;
  if (!url) throw new Error("ZEQQAT_PUBLIC_URL is not set");
  return url;
}
