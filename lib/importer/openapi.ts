// OpenAPI 3.0/3.1 -> api_endpoint rows. Pure: no database, no network, no
// clock, so it is tested against the bundled spec directly. Persisting the
// result lives in lib/catalog-import.ts.
//
// Rules (Project context doc, section 9): parse leniently and record
// problems per endpoint in `importWarnings`; never abort a whole import
// over one bad endpoint. GET parameters and POST bodies collapse into one
// `inputSchema`, because the executor (lib/executor.ts) sends everything as
// query string on GET/DELETE and as a JSON body otherwise.

import { compileEndpointName } from "../tool-names";
import { deref, type DerefIssue } from "./deref";

export type Kind = "read" | "create" | "edit" | "delete";
export const KINDS: readonly Kind[] = ["read", "create", "edit", "delete"];

// Hand-assigned kind per endpoint name, with an optional reason for
// classifications that aren't obvious from the name (catalog/<slug>/kinds.json).
export type KindMap = Record<string, Kind | { kind: Kind; reason?: string }>;

// The kind given to an endpoint the kind map doesn't cover yet (a new
// endpoint in a later spec). `delete` is the bucket no default grant
// allows, so an unclassified endpoint can't run until someone classifies
// it or explicitly allows delete.
export const UNCLASSIFIED_KIND: Kind = "delete";

export type CredentialScheme = { type: "apiKey"; in: "header"; name: string } | { type: "bearer" } | { type: "none" };

export type ImportedEndpoint = {
  name: string;
  action: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  pathParams: string[];
  credentialScheme: CredentialScheme;
  kind: Kind;
  importWarnings: string[];
};

export type ConvertOptions = {
  orgSlug: string;
  integrationSlug: string;
  kinds: KindMap;
  // Where the endpoint's `name` (what agents pass to zeqqat_run) comes
  // from. "operationId" is the default. "path" is for tRPC-style APIs like
  // Dokploy's, whose path is the procedure name (`/application.stop`) and
  // whose operationId is a hyphenated copy of it (`application-stop`).
  nameFrom?: "operationId" | "path";
  // Existing rows of this integration, name -> action. An endpoint that
  // already exists keeps its action (written once, never changed); a new
  // one never takes an action an existing row holds.
  existingActions?: Map<string, string>;
  // Summaries written for endpoints whose spec has none (Dokploy's has
  // none at all), keyed by endpoint name (catalog/<slug>/summaries.json).
  // The spec's own summary wins when it has one.
  summaries?: Record<string, string>;
};

export type ConvertResult = {
  endpoints: ImportedEndpoint[];
  // Problems with the document as a whole (not tied to one endpoint).
  warnings: string[];
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const SKIPPED_METHODS = ["head", "options", "trace"] as const;
const JSON_MEDIA = /^application\/(?:[\w.+-]*\+)?json(?:\s*;.*)?$/i;

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

// The path part of the first server URL, without a trailing slash: "/api"
// for "https://your-dokploy-instance.com/api". The host is never used (the
// instance row supplies it), only the base path the API lives under.
export function basePathOf(doc: Obj): string {
  const first = Array.isArray(doc.servers) ? asObj(doc.servers[0]).url : undefined;
  if (typeof first !== "string" || !first) return "";
  let path: string;
  try {
    path = new URL(first, "http://placeholder.invalid").pathname;
  } catch {
    return "";
  }
  return path === "/" ? "" : path.replace(/\/+$/, "");
}

export function kindOf(kinds: KindMap, name: string): { kind: Kind; classified: boolean } {
  const entry = kinds[name];
  const kind = typeof entry === "string" ? entry : entry?.kind;
  if (kind && KINDS.includes(kind)) return { kind, classified: true };
  return { kind: UNCLASSIFIED_KIND, classified: false };
}

// Reads auth from components.securitySchemes plus the document's top-level
// security. Per-operation `security` is honored only when every scheme it
// names is defined: Dokploy's operations all reference an undefined
// "Authorization" scheme (Project context doc, appendix A).
function resolveCredential(doc: Obj, op: Obj): { scheme: CredentialScheme; warning?: string } {
  const schemes = asObj(asObj(doc.components).securitySchemes);
  const names = (reqs: unknown): string[] =>
    (Array.isArray(reqs) ? reqs : []).flatMap((r) => Object.keys(asObj(r)));
  const opNames = names(op.security);
  const usable = opNames.length > 0 && opNames.every((n) => n in schemes) ? opNames : names(doc.security);
  for (const n of usable) {
    const s = asObj(schemes[n]);
    if (s.type === "apiKey" && s.in === "header" && typeof s.name === "string") {
      return { scheme: { type: "apiKey", in: "header", name: s.name } };
    }
    if (s.type === "http" && typeof s.scheme === "string" && s.scheme.toLowerCase() === "bearer") {
      return { scheme: { type: "bearer" } };
    }
  }
  if (usable.length === 0) return { scheme: { type: "none" } };
  return { scheme: { type: "none" }, warning: `No supported auth scheme among: ${usable.join(", ")}.` };
}

// Dokploy (and other generated specs) declare every 200 response as an
// empty closed object. That says nothing, so it is stored as no schema.
function isPlaceholder(schema: Obj): boolean {
  return (
    Object.keys(schema).length <= 3 &&
    schema.additionalProperties === false &&
    Object.keys(asObj(schema.properties)).length === 0
  );
}

export function convertOpenApi(doc: unknown, opts: ConvertOptions): ConvertResult {
  const root = asObj(doc);
  const warnings: string[] = [];
  if (typeof root.openapi !== "string" || !/^3\.[01]\./.test(root.openapi)) {
    warnings.push(`Expected OpenAPI 3.0 or 3.1, got ${String(root.openapi ?? "no openapi field")}.`);
  }
  const basePath = basePathOf(root);
  const existing = opts.existingActions ?? new Map<string, string>();
  const taken = new Set(existing.values());
  const seenNames = new Set<string>();
  const endpoints: ImportedEndpoint[] = [];

  for (const [specPath, rawItem] of Object.entries(asObj(root.paths))) {
    const derefIssues: DerefIssue[] = [];
    const item = asObj(deref(root, rawItem, derefIssues));

    for (const m of SKIPPED_METHODS) {
      if (item[m]) warnings.push(`${m.toUpperCase()} ${specPath} skipped: method not supported.`);
    }

    for (const m of METHODS) {
      if (!item[m]) continue;
      const op = asObj(item[m]);
      const method = m.toUpperCase() as ImportedEndpoint["method"];
      const epWarnings: string[] = [];

      const operationId = typeof op.operationId === "string" && op.operationId ? op.operationId : null;
      const name =
        opts.nameFrom === "path" ? specPath.replace(/^\/+/, "") : (operationId ?? `${method} ${specPath}`);
      if (!name) {
        warnings.push(`${method} ${specPath} skipped: no usable name.`);
        continue;
      }
      if (seenNames.has(name)) {
        warnings.push(`${method} ${specPath} skipped: another endpoint is already named "${name}".`);
        continue;
      }
      seenNames.add(name);

      // Action: the sanitized name, written once, deduped with _2, _3.
      let action = existing.get(name);
      if (!action) {
        const base = compileEndpointName({
          orgSlug: opts.orgSlug,
          integrationSlug: opts.integrationSlug,
          operationId: name,
          method,
          path: specPath,
        }).action;
        action = base;
        for (let n = 2; taken.has(action); n++) action = `${base}_${n}`;
        taken.add(action);
      }

      // Inputs: path, query and header parameters plus the JSON body.
      const properties: Obj = {};
      const required = new Set<string>();
      const pathParams: string[] = [];
      const params = [
        ...(Array.isArray(item.parameters) ? item.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ].map(asObj);
      const byKey = new Map<string, Obj>();
      for (const p of params) {
        if (typeof p.name === "string" && typeof p.in === "string") byKey.set(`${p.in}:${p.name}`, p);
      }
      for (const p of byKey.values()) {
        const pname = p.name as string;
        const where = p.in as string;
        if (where === "header" || where === "cookie") {
          epWarnings.push(`Parameter "${pname}" in ${where} is not sent by the executor.`);
          continue;
        }
        if (where === "query" && method !== "GET" && method !== "DELETE") {
          epWarnings.push(`Query parameter "${pname}" on ${method} is sent in the JSON body by the executor.`);
        }
        const schema = { ...asObj(p.schema) };
        if (typeof p.description === "string" && schema.description === undefined) schema.description = p.description;
        properties[pname] = schema;
        if (p.required === true || where === "path") required.add(pname);
        if (where === "path") pathParams.push(pname);
      }
      if (pathParams.length > 0) {
        epWarnings.push(`Path parameters (${pathParams.join(", ")}) are not substituted into the path by the executor yet.`);
      }

      const body = asObj(op.requestBody);
      const content = asObj(body.content);
      const mediaTypes = Object.keys(content);
      const jsonType = mediaTypes.find((t) => JSON_MEDIA.test(t));
      if (jsonType) {
        if (method === "GET" || method === "DELETE") {
          epWarnings.push(`Request body on ${method} is sent as query string by the executor.`);
        }
        const schema = asObj(asObj(content[jsonType]).schema);
        const bodyProps = asObj(schema.properties);
        if (schema.type !== undefined && schema.type !== "object") {
          epWarnings.push(`Request body is ${String(schema.type)}, not an object; only object bodies can be sent.`);
        }
        for (const [k, v] of Object.entries(bodyProps)) {
          if (k in properties) epWarnings.push(`Body property "${k}" has the same name as a parameter; the body's wins.`);
          properties[k] = v;
        }
        const req = Array.isArray(schema.required) ? schema.required : [];
        for (const r of req) if (typeof r === "string") required.add(r);
      } else if (mediaTypes.length > 0) {
        epWarnings.push(`Request body type ${mediaTypes.join(", ")} is not supported: the executor only sends JSON.`);
      }
      const inputSchema: Obj = { type: "object", properties };
      if (required.size > 0) inputSchema.required = [...required];

      // Output: the 200/201 JSON schema, unless it is the empty placeholder.
      let outputSchema: Obj | null = null;
      const responses = asObj(op.responses);
      for (const status of ["200", "201", "2XX", "default"]) {
        const resContent = asObj(asObj(responses[status]).content);
        const t = Object.keys(resContent).find((k) => JSON_MEDIA.test(k));
        if (!t) continue;
        const s = asObj(asObj(resContent[t]).schema);
        if (Object.keys(s).length > 0 && !isPlaceholder(s)) outputSchema = s;
        break;
      }

      const cred = resolveCredential(root, op);
      if (cred.warning) epWarnings.push(cred.warning);

      for (const issue of derefIssues) {
        epWarnings.push(issue.kind === "circular" ? `Circular reference ${issue.ref} omitted.` : `Unresolvable reference ${issue.ref} omitted.`);
      }

      const { kind, classified } = kindOf(opts.kinds, name);
      if (!classified) {
        epWarnings.push(`Kind not assigned yet; set to "${UNCLASSIFIED_KIND}" until it is classified.`);
      }

      endpoints.push({
        name,
        action,
        method,
        path: `${basePath}${specPath.startsWith("/") ? specPath : `/${specPath}`}`,
        summary:
          (typeof op.summary === "string" && op.summary.trim() ? op.summary.trim() : null) ??
          opts.summaries?.[name]?.trim() ??
          null,
        description: typeof op.description === "string" && op.description.trim() ? op.description.trim() : null,
        tags: (Array.isArray(op.tags) ? op.tags : []).filter((t): t is string => typeof t === "string"),
        inputSchema,
        outputSchema,
        pathParams,
        credentialScheme: cred.scheme,
        kind,
        importWarnings: [...new Set(epWarnings)],
      });
    }
  }
  return { endpoints, warnings };
}
