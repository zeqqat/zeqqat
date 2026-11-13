import { describe, expect, it } from "vitest";
import { pageFingerprints, readLastmod, refreshLastmod } from "../../lib/lastmod";

describe("sitemap lastmod", () => {
  it("content/lastmod.json matches every page's current content", () => {
    // A page changed without its date moving. `pnpm bump` fixes this; so
    // does `pnpm lastmod` on its own.
    const file = readLastmod();
    const stale = Object.entries(pageFingerprints())
      .filter(([p, hash]) => file[p]?.hash !== hash)
      .map(([p]) => p);
    expect(stale, "run pnpm lastmod").toEqual([]);
  });

  it("dates only the pages that changed", () => {
    const current = refreshLastmod({}, "2026-01-01").next;
    const keep = Object.keys(current)[0];
    const edited = Object.keys(current)[1];
    current[edited] = { hash: "old", date: "2026-01-01" };
    const { next, changed } = refreshLastmod(current, "2026-02-02");
    expect(changed).toEqual([edited]);
    expect(next[edited].date).toBe("2026-02-02");
    expect(next[keep].date).toBe("2026-01-01");
  });
});
