import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AGENT_DOCS, DOC_PAGES, sectionsOf } from "./agent-docs";

// Search engines trust a sitemap's lastmod only while it moves when the
// page really changed. So each page without a date of its own (a blog post
// has one) gets a fingerprint of what it shows, and content/lastmod.json
// keeps the date that fingerprint last changed. `pnpm bump` refreshes it
// (scripts/lastmod.ts); a unit test fails while it is out of date.

export type LastmodEntry = { hash: string; date: string };
export type LastmodFile = Record<string, LastmodEntry>;

export const LASTMOD_PATH = path.join(process.cwd(), "content", "lastmod.json");

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function sha(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex").slice(0, 16);
}

// The source a page's own content comes from, by public path. Shared
// chrome (header, footer) is left out: a menu change isn't a page change.
export function pageFingerprints(): Record<string, string> {
  const out: Record<string, string> = {
    "/": sha(read("app/page.tsx"), read("components/AgentRotator.tsx")),
    "/docs": sha(read("app/docs/page.tsx"), JSON.stringify(DOC_PAGES)),
    "/docs/self-host": sha(read("app/docs/self-host/page.tsx")),
    "/docs/agents": sha(
      read("app/docs/agents/page.tsx"),
      JSON.stringify(DOC_PAGES),
      JSON.stringify(AGENT_DOCS.map((s) => [s.page, s.title])),
    ),
    "/terms": sha(read("app/terms/page.tsx")),
    "/privacy": sha(read("app/privacy/page.tsx")),
  };
  for (const p of DOC_PAGES) {
    out[`/docs/agents/${p.id}`] = sha(
      read("app/docs/agents/[page]/page.tsx"),
      JSON.stringify(p),
      JSON.stringify(sectionsOf(p.id)),
    );
  }
  return out;
}

export function readLastmod(): LastmodFile {
  try {
    return JSON.parse(fs.readFileSync(LASTMOD_PATH, "utf8")) as LastmodFile;
  } catch {
    return {};
  }
}

// The date a page last changed, or undefined if it isn't tracked.
export function lastmodOf(pagePath: string, file: LastmodFile = readLastmod()): Date | undefined {
  const d = file[pagePath]?.date;
  return d ? new Date(`${d}T00:00:00Z`) : undefined;
}

// New file contents: changed or new pages get `today`, the rest keep
// their date, pages that no longer exist drop out.
export function refreshLastmod(current: LastmodFile, today: string): { next: LastmodFile; changed: string[] } {
  const next: LastmodFile = {};
  const changed: string[] = [];
  for (const [p, hash] of Object.entries(pageFingerprints())) {
    const prev = current[p];
    if (prev && prev.hash === hash) next[p] = prev;
    else {
      next[p] = { hash, date: today };
      changed.push(p);
    }
  }
  return { next, changed };
}
