// Central module for tool naming. Everything that defines, parses, or
// validates a tool name imports from here — no other file hand-builds a
// name string.
//
// Two kinds of names exist, and only one of them ever reaches an MCP
// client's name check (project doc mcp-context-and-policy-v1, section 3):
//
// 1. Built-in tools (zeqqat_search, zeqqat_run, ...). These are the only
//    tools in tools/list. Claude's clients call them as
//    mcp__<connector name>__<our name> and validate that against
//    ^[a-zA-Z0-9_-]{1,64}$. A name outside it is silently dropped: the
//    connector shows as connected with zero tools. The zeqqat_ prefix is
//    there because the connector name is whatever the user typed
//    ("deployment"), so it can't be relied on to say "Zeqqat".
//
// 2. Catalog tools (imported API endpoints). Agents find them through
//    zeqqat_search and pass their operationId to zeqqat_run as an argument
//    value. They never appear in tools/list, so no client name rule, length
//    budget or hash suffix applies to them. Their human-facing name is the
//    canonical @org/target.type.action, used in the DB, UI, page URLs and,
//    later, to run workflows (which have no instance).

export const TOOL_TYPES = ["http", "workflow"] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

// Built-in names stay well inside the client limit: mcp__ (5) + the
// connector name (user-chosen, often 8 to 20 characters) + __ (2) + ours
// must fit in 64. Built-ins are short words, so 32 is plenty of room.
export const MAX_BUILTIN_NAME_LENGTH = 32;
const BUILTIN_PREFIX = "zeqqat_";

// Lowercase letters and digits, words joined by a single underscore. No
// uppercase, no hyphens, no leading/trailing/doubled underscores. Doubled
// underscores are forbidden because clients split on `__` to parse
// mcp__<server>__<tool>.
const SEGMENT_SOURCE = "[a-z0-9]+(?:_[a-z0-9]+)*";
const SEGMENT_PATTERN = new RegExp(`^${SEGMENT_SOURCE}$`);
const TYPE_SOURCE = `(?:${TOOL_TYPES.join("|")})`;

export function isValidSegment(s: string): boolean {
  return SEGMENT_PATTERN.test(s);
}

// A built-in tool's name: zeqqat_<action>. Throws on a bad action — a name
// that fails to build is a bug at the call site, not a runtime condition.
export function builtinToolName(action: string): string {
  if (!isValidSegment(action)) {
    throw new Error(`Invalid built-in tool name: action "${action}" must match ${SEGMENT_PATTERN}`);
  }
  const name = `${BUILTIN_PREFIX}${action}`;
  if (name.length > MAX_BUILTIN_NAME_LENGTH) {
    throw new Error(`Invalid built-in tool name: "${name}" is over ${MAX_BUILTIN_NAME_LENGTH} characters`);
  }
  return name;
}

export function isBuiltinToolName(name: string): boolean {
  return name.startsWith(BUILTIN_PREFIX) && isValidSegment(name) && name.length <= MAX_BUILTIN_NAME_LENGTH;
}

// Built-ins were named zeqqat-zeqqat-http-<action>-v1 before the zeqqat_
// prefix. Old call logs still carry those names; this reads them back.
const LEGACY_BUILTIN = /^zeqqat-zeqqat-http-([a-z0-9]+(?:_[a-z0-9]+)*)-v1$/;

export function builtinAction(name: string): string | null {
  if (isBuiltinToolName(name)) return name.slice(BUILTIN_PREFIX.length);
  const legacy = LEGACY_BUILTIN.exec(name);
  return legacy ? legacy[1] : null;
}

export type ToolNameParts = {
  org: string;
  target: string;
  type: ToolType;
  action: string;
};

// The human-facing form, used in the DB, UI and logs. No version:
// canonical names track the current definition.
export function toCanonical(parts: ToolNameParts): string {
  return `@${parts.org}/${parts.target}.${parts.type}.${parts.action}`;
}

// The dotted name with no org, as it appears in a page URL after the org:
// zeqqat.com/<org>/<target.type.action>. Tool names always contain two
// dots, and the other org-level routes (`mcp`, `c`) contain none, so the
// routes can never collide (naming doc v2, section 7).
export function toDotted(parts: Pick<ToolNameParts, "target" | "type" | "action">): string {
  return `${parts.target}.${parts.type}.${parts.action}`;
}

// A tool's page: /<org>/<target.type.action>. URLs drop the `@`.
export function toolPagePath(parts: ToolNameParts): string {
  return `/${parts.org}/${toDotted(parts)}`;
}

const DOTTED_PATTERN = new RegExp(`^(${SEGMENT_SOURCE})\\.(${TYPE_SOURCE})\\.(${SEGMENT_SOURCE})$`);

// Parses the URL segment after the org ("dokploy.http.application_deploy").
// An optional "@1.4.0" pin is split off and returned, never validated
// further here.
export function parseDotted(segment: string): { target: string; type: ToolType; action: string; pin: string | null } | null {
  const at = segment.indexOf("@");
  const name = at === -1 ? segment : segment.slice(0, at);
  const pin = at === -1 ? null : segment.slice(at + 1) || null;
  const m = DOTTED_PATTERN.exec(name);
  if (!m) return null;
  return { target: m[1], type: m[2] as ToolType, action: m[3], pin };
}

// Accepts the canonical @org/target.type.action or the bare dotted form
// (org then comes from the caller's context). Returns null for anything
// else — notably a raw operationId like "application.deploy", which
// lib/catalog.ts matches against api_endpoint.name instead.
export function parseToolRef(ref: string): { org: string | null; target: string; type: ToolType; action: string } | null {
  const trimmed = ref.trim();
  const canonical = /^@([^/]+)\/(.+)$/.exec(trimmed);
  if (canonical) {
    if (!isValidSegment(canonical[1])) return null;
    const d = parseDotted(canonical[2]);
    return d ? { org: canonical[1], target: d.target, type: d.type, action: d.action } : null;
  }
  const d = parseDotted(trimmed);
  return d ? { org: null, target: d.target, type: d.type, action: d.action } : null;
}

// Derives an action segment from an operationId, or from method+path when
// operationId is missing or sanitizes to nothing. Never shortened: catalog
// names have no length budget.
export function sanitizeOperationId(raw: string | undefined, method?: string, path?: string): string {
  const deriveFromRoute = () => `${method ?? ""} ${path ?? ""}`.trim();

  function normalize(input: string): string {
    // listRepos -> list_Repos, so the next step's lowercasing doesn't
    // collapse word boundaries that mattered.
    const camelSplit = input.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
    const lowered = camelSplit.toLowerCase();
    const replaced = lowered.replace(/[^a-z0-9]/g, "_");
    return replaced.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }

  const source = raw && raw.trim() ? raw : deriveFromRoute();
  const result = normalize(source);
  if (result) return result;

  // Empty after normalizing (e.g. raw was pure punctuation) — fall back
  // to the method+path derivation instead of returning nothing.
  return normalize(deriveFromRoute());
}

// One imported API endpoint's names, from its owning org, its integration
// (the target) and its raw operationId. An importer stores `action` and
// `major` on the api_endpoint row, alongside the raw operationId in
// `name`, which is what agents pass to zeqqat_run. Collisions between two
// operationIds that sanitize to the same action are resolved at import
// (_2, _3), never by truncating.
export function compileEndpointName(params: {
  orgSlug: string;
  integrationSlug: string;
  operationId: string | undefined;
  method?: string;
  path?: string;
  major?: number;
}): { action: string; major: number; canonical: string } {
  const major = params.major ?? 1;
  const action = sanitizeOperationId(params.operationId, params.method, params.path);
  const parts = { org: params.orgSlug, target: params.integrationSlug, type: "http" as const, action };
  for (const [label, value] of [["org", parts.org], ["target", parts.target], ["action", action]] as const) {
    if (!isValidSegment(value)) throw new Error(`Invalid tool name: ${label} segment "${value}" must match ${SEGMENT_PATTERN}`);
  }
  return { action, major, canonical: toCanonical(parts) };
}

// ---------- Policies ----------
// A policy's canonical name follows the tool scheme with type `policy`:
// @<namespace>/<integration slug>.policy.<name>. No version in the name;
// policies never appear in tools/list, so they have no wire name.

export function toPolicyCanonical(namespace: string, integrationSlug: string, name: string): string {
  return `@${namespace}/${integrationSlug}.policy.${name}`;
}

// A policy's page segment after the namespace: <integration>.policy.<name>.
export function policyPagePath(namespace: string, integrationSlug: string, name: string): string {
  return `/${namespace}/${integrationSlug}.policy.${name}`;
}

const POLICY_DOTTED = new RegExp(`^(${SEGMENT_SOURCE})\\.policy\\.(${SEGMENT_SOURCE})$`);

export function parsePolicyDotted(segment: string): { integrationSlug: string; name: string } | null {
  const m = POLICY_DOTTED.exec(segment);
  return m ? { integrationSlug: m[1], name: m[2] } : null;
}

// A typed policy name to a valid segment ("Read + deploy" -> read_deploy).
export function toPolicyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/g, "");
}
