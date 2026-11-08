import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newWordsFor, queryWords, rank, stem, words, type Candidate } from "../../lib/search-rank";

// The bundled Dokploy catalog, as search sees it: operationId, summary,
// path, tags. Its manifest names tools by path (nameFrom: "path"), so
// /application.deploy is application.deploy. Keywords start empty.
const spec = JSON.parse(readFileSync(join(__dirname, "../../catalog/dokploy/openapi.json"), "utf8"));
const summaries: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, "../../catalog/dokploy/summaries.json"), "utf8"),
).summaries;
const catalog: Candidate[] = Object.entries(spec.paths as Record<string, Record<string, any>>).flatMap(([path, ops]) =>
  Object.values(ops).map((op) => ({
    name: path.slice(1),
    summary: summaries[path.slice(1)] ?? op.summary ?? null,
    path,
    tags: op.tags ?? [],
    keywords: [],
  })),
);

const top = (q: string, n = 3) => rank(queryWords(q), catalog).slice(0, n).map((r) => r.item.name);

describe("words and stem", () => {
  it("splits operationIds and camelCase", () => {
    expect(words("deployment.allByType")).toEqual(["deployment", "all", "by", "type"]);
  });
  it.each([
    ["deployments", "deployment"],
    ["deploying", "deploy"],
    ["applications", "application"],
    ["logs", "log"],
    ["finished", "finish"],
    ["access", "access"],
  ])("stems %s to %s", (w, s) => expect(stem(w)).toBe(s));
  it("drops stopwords and repeats", () => {
    expect(queryWords("list the projects with the applications").map((q) => q.word)).toEqual(["list", "projects", "applications"]);
  });
});

// The queries that returned nothing while dogfooding (open item, 2026-11-07).
describe("multi-word search over the Dokploy catalog", () => {
  it("deploy application", () => expect(top("deploy application")[0]).toBe("application.deploy"));
  it("list projects", () => expect(top("list projects")[0]).toBe("project.all"));
  it("list projects with applications", () => expect(top("list projects with applications")[0]).toBe("project.all"));
  it("finds the cheap deploy-status checks", () => {
    // Default search limit is 10.
    expect(top("deploy status", 10)).toContain("application.search");
    expect(top("deployments building now", 3)).toContain("deployment.queueList");
  });
  it("app logs", () => expect(top("read deployment logs", 3)).toContain("deployment.readLogs"));
  it("still answers one word", () => expect(top("deploy", 25)).toContain("application.deploy"));
  it("matches word starts only: all is not install", () => {
    expect(rank(queryWords("all"), [{ name: "server.install", summary: null, path: "/server.install", tags: [], keywords: [] }])).toEqual([]);
  });
  it("finds nothing for nonsense", () => expect(top("zzqx")).toEqual([]));
});

describe("learned keywords", () => {
  const queue = catalog.find((c) => c.name === "deployment.queueList")!;
  it("ranks a tool by a learned keyword", () => {
    const withKeyword = catalog.map((c) => (c === queue ? { ...c, keywords: ["finish"] } : c));
    expect(rank(queryWords("is it finished"), withKeyword)[0].item.name).toBe("deployment.queueList");
  });
  it("learns only words that don't already describe the tool", () => {
    expect(newWordsFor("is my deploy finished yet", queue)).toEqual(["finish", "yet"]);
  });
  it("never learns ids, app names with digits, or short words", () => {
    expect(newWordsFor("zeqqat-gateway v2 M5SntWCbl ok my_app", queue)).toEqual([]);
  });
});
