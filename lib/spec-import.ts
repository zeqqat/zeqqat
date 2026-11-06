// Adds an app to an org's catalog from a link to its OpenAPI spec (and,
// optionally, its docs). The same function backs the dashboard form, the
// HTTP API (POST /api/integrations/import) and the zeqqat_import MCP tool.
//
// What it does, in order:
// 1. Fetches the spec safely (fetchPublic): http(s) only, no private
//    addresses on the hosted edition, size and time limits, redirects
//    re-checked hop by hop.
// 2. Parses JSON or YAML and requires OpenAPI 3.x (Swagger 2 is refused
//    with a clear message rather than imported badly).
// 3. Guesses each endpoint's kind (guessKinds). Bundled catalogs get kinds
//    by hand; an imported one gets a guess from the method and the name,
//    and anything that looks destructive lands in `delete`, the bucket no
//    default grant allows. Re-importing reapplies the guess.
// 4. Imports through the same importSpec the official catalog uses, under
//    the caller's org, as @<org>/<slug>.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { db } from "../db";
import { integration } from "../db/schema";
import { importSpec, type ImportSummary } from "./catalog-import";
import { edition } from "./edition";
import type { Kind, KindMap } from "./importer/openapi";
import { normalizeSlug } from "./username";

const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;

export class ImportError extends Error {}

// ---------- safe fetching ----------

// Loopback, private, link-local, CGNAT, unique-local and metadata ranges.
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

async function checkHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportError("The link must start with https:// or http://.");
  }
  // A self-hosted Zeqqat may import specs from its own network.
  if (edition() === "self-hosted") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new ImportError(`Couldn't find ${url.hostname}. Check the link.`);
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ImportError("That link points at a private network address, which zeqqat.com can't fetch.");
  }
}

export async function fetchPublic(raw: string): Promise<{ text: string; finalUrl: string; contentType: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That isn't a valid link.");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Zeqqat", accept: "application/json, application/yaml, text/yaml, */*" },
      });
    } catch {
      clearTimeout(timer);
      throw new ImportError(`Couldn't reach ${url.host}.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new ImportError(`${url.host} answered ${res.status} for that link.`);
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new ImportError("That spec is larger than 15 MB.");
    const buf = await res.arrayBuffer().finally(() => clearTimeout(timer));
    if (buf.byteLength > MAX_BYTES) throw new ImportError("That spec is larger than 15 MB.");
    return { text: new TextDecoder().decode(buf), finalUrl: url.toString(), contentType: res.headers.get("content-type") ?? "" };
  }
  throw new ImportError("That link redirects too many times.");
}

// The connection test for an instance of an imported app. There is no
// endpoint every API shares, so it only checks the address answers at all
// (any HTTP status counts) and isn't private on the hosted edition. A bad
// key shows up on the agent's first call instead.
export async function testAppConnection(raw: string): Promise<{ status: "ok" | "unreachable" | "invalid"; baseUrl?: string; message?: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { status: "invalid", message: "That URL isn't valid. Include https://." };
  }
  try {
    await checkHost(url);
  } catch (err) {
    return { status: "invalid", message: err instanceof ImportError ? err.message : "That URL can't be used." };
  }
  const baseUrl = url.toString().replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(baseUrl, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "user-agent": "Zeqqat" } });
    return { status: "ok", baseUrl };
  } catch {
    return { status: "unreachable", baseUrl, message: `Couldn't reach ${url.host}. Check the URL.` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- parsing ----------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

export function parseSpec(text: string): Obj {
  let doc: unknown;
  const trimmed = text.trimStart();
  try {
    doc = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(text, { maxAliasCount: 1000 });
  } catch {
    throw new ImportError("That link isn't a JSON or YAML file. Link to the raw spec file, not a docs page.");
  }
  const root = obj(doc);
  if (typeof root.swagger === "string") {
    throw new ImportError("That's a Swagger 2 spec. Zeqqat reads OpenAPI 3; most apps publish one, or convert it at converter.swagger.io.");
  }
  if (typeof root.openapi !== "string" || !/^3\./.test(root.openapi)) {
    throw new ImportError("That file isn't an OpenAPI 3 spec (no openapi: 3.x field). Link to the raw spec file.");
  }
  if (Object.keys(obj(root.paths)).length === 0) throw new ImportError("That spec has no endpoints.");
  return root;
}

// ---------- kinds ----------

const DELETE_WORDS = /(^|[^a-z])(delete|remove|destroy|purge|wipe|drop|erase|revoke|cancel|terminate|uninstall|reset|rebuild)/i;
const READ_WORDS = /(^|[^a-z])(get|list|search|query|find|read|fetch|retrieve|lookup|count|check|validate|preview|export|describe|show|stats)/i;
const CREATE_WORDS = /(^|[^a-z])(create|add|new|insert|register|upload|import|generate|post)/i;

// The guess for one endpoint. Method first, then the name and path when the
// method says little (a POST that searches, a POST that deletes). When in
// doubt it picks the more restrictive kind.
export function guessKind(method: string, name: string, path: string): Kind {
  const text = `${name} ${path.replace(/[{}]/g, "")}`.replace(/([a-z])([A-Z])/g, "$1_$2");
  const m = method.toUpperCase();
  if (m === "DELETE" || DELETE_WORDS.test(text)) return "delete";
  if (m === "GET") return "read";
  if (m === "POST") {
    if (READ_WORDS.test(name.replace(/([a-z])([A-Z])/g, "$1_$2")) && !CREATE_WORDS.test(name)) return "read";
    return /\{[^}]+\}\/?$/.test(path) ? "edit" : "create";
  }
  return "edit"; // PUT, PATCH
}

export function guessKinds(doc: Obj, nameFrom: "operationId" | "path"): KindMap {
  const kinds: KindMap = {};
  for (const [path, item] of Object.entries(obj(doc.paths))) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = obj(obj(item)[method]);
      if (!obj(item)[method]) continue;
      const opId = typeof op.operationId === "string" && op.operationId ? op.operationId : null;
      const name = nameFrom === "path" ? path.replace(/^\/+/, "") : (opId ?? `${method.toUpperCase()} ${path}`);
      kinds[name] = { kind: guessKind(method, name, path), reason: "guessed at import" };
    }
  }
  return kinds;
}

// ---------- metadata ----------

// The API's address from the spec's first absolute server URL, origin only
// (endpoint paths already carry the server's base path).
export function defaultBaseUrl(doc: Obj, specUrl: string): string | null {
  const first = Array.isArray(doc.servers) ? obj(doc.servers[0]).url : undefined;
  if (typeof first !== "string" || !first || first.includes("{")) return null;
  try {
    const u = new URL(first, specUrl);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

// Where the app's logo may be, best first: the spec's x-logo, the owner's
// GitHub avatar when the spec lives on GitHub (Stripe's and GitHub's do),
// then the favicon of the docs site, the API's site and the spec's host.
export function logoCandidates(doc: Obj, specUrl: string, docsUrl: string | null, baseUrl: string | null): string[] {
  const out: string[] = [];
  const xLogo = obj(obj(doc.info)["x-logo"]).url;
  if (typeof xLogo === "string" && /^https:\/\//.test(xLogo)) out.push(xLogo);
  try {
    const u = new URL(specUrl);
    const owner = u.pathname.split("/")[1];
    if ((u.hostname === "raw.githubusercontent.com" || u.hostname === "github.com") && owner) {
      out.push(`https://github.com/${owner}.png?size=64`);
    }
  } catch {
    // not a URL; nothing to add
  }
  const favicon = (raw: string | null) => {
    if (!raw) return;
    try {
      const host = new URL(raw).hostname.replace(/^(api|docs|developer|developers)\./, "");
      out.push(`https://${host}/favicon.ico`);
    } catch {
      // ignore
    }
  };
  favicon(docsUrl);
  favicon(baseUrl);
  favicon(specUrl);
  return [...new Set(out)].filter((l) => !l.startsWith("https://raw.githubusercontent.com/"));
}

// The first candidate that answers with an image, so the UI never shows a
// broken one; null falls back to the app's initial.
async function findLogo(candidates: string[]): Promise<string | null> {
  for (const url of candidates.slice(0, 4)) {
    try {
      await checkHost(new URL(url));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Zeqqat" } }).finally(() => clearTimeout(timer));
      if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
        await res.body?.cancel();
        return res.url || url;
      }
      await res.body?.cancel();
    } catch {
      // try the next one
    }
  }
  return null;
}

// ---------- import ----------

export type ImportRequest = {
  organizationId: string;
  orgSlug: string;
  specUrl: string;
  docsUrl?: string | null;
  name?: string | null;
  slug?: string | null;
};

export type ImportResult = ImportSummary & {
  slug: string;
  name: string;
  ref: string;
  kinds: Record<Kind, number>;
  baseUrl: string | null;
  updated: boolean;
};

export async function importFromUrl(req: ImportRequest): Promise<ImportResult> {
  const docsUrl = req.docsUrl?.trim() || null;
  if (docsUrl) {
    try {
      new URL(docsUrl);
    } catch {
      throw new ImportError("The docs link isn't a valid link.");
    }
  }
  const { text, finalUrl } = await fetchPublic(req.specUrl);
  const doc = parseSpec(text);
  const info = obj(doc.info);
  const title = (req.name?.trim() || (typeof info.title === "string" ? info.title : "") || new URL(finalUrl).hostname).slice(0, 80);
  const slug = normalizeSlug(req.slug?.trim() || title.replace(/\b(api|openapi|rest|spec|v\d+)\b/gi, " ")) || normalizeSlug(title);
  if (slug.length < 2) throw new ImportError("Couldn't make a short name from the spec's title. Pass a name.");

  // Whether a path or the operationId names the tools: operationIds unless
  // most operations lack them.
  let ops = 0;
  let withId = 0;
  for (const item of Object.values(obj(doc.paths))) {
    for (const m of ["get", "post", "put", "patch", "delete"]) {
      const op = obj(obj(item)[m]);
      if (!obj(item)[m]) continue;
      ops++;
      if (typeof op.operationId === "string" && op.operationId) withId++;
    }
  }
  const nameFrom: "operationId" | "path" = withId >= ops / 2 ? "operationId" : "path";
  const kinds = guessKinds(doc, nameFrom);
  const baseUrl = defaultBaseUrl(doc, finalUrl);
  const logoUrl = await findLogo(logoCandidates(doc, req.specUrl.trim(), docsUrl, baseUrl));

  const existing = await db.query.integration.findFirst({
    where: and(eq(integration.organizationId, req.organizationId), eq(integration.slug, slug)),
  });
  if (existing?.official) throw new ImportError(`@${req.orgSlug}/${slug} is a bundled integration and can't be replaced by an import.`);

  // importSpec stores the raw text's hash; it parses JSON, so YAML goes in
  // as its JSON form.
  const rawSpec = text.trimStart().startsWith("{") ? text : JSON.stringify(doc);
  const summary = await db.transaction(async (tx) => {
    const s = await importSpec(tx, {
      organizationId: req.organizationId,
      orgSlug: req.orgSlug,
      integrationSlug: slug,
      integrationName: existing?.name ?? title,
      official: false,
      rawSpec,
      sourceUrl: finalUrl,
      release: typeof info.version === "string" ? info.version : null,
      kinds,
      nameFrom,
    });
    await tx
      .update(integration)
      .set({
        specUrl: req.specUrl.trim(),
        docsUrl: docsUrl ?? existing?.docsUrl ?? null,
        logoUrl: logoUrl ?? existing?.logoUrl ?? null,
        defaultBaseUrl: baseUrl,
      })
      .where(eq(integration.id, s.integrationId));
    return s;
  });

  const counts: Record<Kind, number> = { read: 0, create: 0, edit: 0, delete: 0 };
  for (const v of Object.values(kinds)) counts[typeof v === "string" ? v : v.kind]++;
  return {
    ...summary,
    // Every kind is a guess here, so "unclassified" (which means "no kind
    // given") doesn't apply.
    unclassified: [],
    slug,
    name: existing?.name ?? title,
    ref: `@${req.orgSlug}/${slug}`,
    kinds: counts,
    baseUrl,
    updated: !!existing,
  };
}
