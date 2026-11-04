import { randomBytes, randomInt } from "crypto";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { secretHandle } from "../db/schema";
import { decryptCredential, encryptCredential } from "./crypto";
import { isSecretName, type Redact } from "./scrub";

// Secret handles: how an agent moves a secret it must never see.
//
// A secret in an upstream response reaches the agent as {{zq_secret_...}}
// instead of its value. zeqqat_secret mints a handle for a fresh random
// value. Put a handle in a later zeqqat_run input, alone or inside a
// string (DATABASE_URL=postgresql://app:{{zq_secret_...}}@db:5432/app), and
// the executor fills the value in just before the request goes out. The
// model, the call log and the Activity page only ever see the handle.
//
// The rules that keep a handle from becoming a way out:
//   - It works only on the connection it was issued on.
//   - It works on one instance: the one its value came from, or, for a
//     generated value, the first one it is used on.
//   - It resolves only in fields meant for secrets (env blocks, passwords,
//     tokens), never in places that send data elsewhere (webhook URLs,
//     notification targets, descriptions).
//   - It expires after HANDLE_TTL_MS and its row is deleted. After that the
//     value exists only where it was written.

export const HANDLE_TTL_MS = 30 * 60 * 1000;

const HANDLE_ID = /zq_secret_[a-z0-9]{16}/;
export const HANDLE_MARK = new RegExp(`\\{\\{\\s*(${HANDLE_ID.source})\\s*\\}\\}`, "g");

function newHandleId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) id += alphabet[randomInt(alphabet.length)];
  return `zq_secret_${id}`;
}

export function mark(id: string): string {
  return `{{${id}}}`;
}

// Fields a handle may resolve in: an env block (env, previewEnv,
// buildArgs, buildSecrets) or a field whose name says it holds a secret
// (databasePassword, token, apiKey...). Checked on every key in the path,
// so {"env": "A={{zq_secret_..}}"} and {"auth": {"password": ...}} both pass.
const ENV_FIELDS = new Set(["env", "previewenv", "buildargs", "buildsecrets"]);

export function secretField(path: string[]): boolean {
  return path.some((key) => ENV_FIELDS.has(key.toLowerCase()) || isSecretName(key));
}

async function deleteExpired() {
  await db.delete(secretHandle).where(lt(secretHandle.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

// Collects the secrets found while scrubbing one response, synchronously
// (the scrubber can't await), then stores them in one insert. The same
// value always gets the same handle, so a secret that appears in both the
// raw text and the parsed body is one handle.
export class HandleMinter {
  private found = new Map<string, string>();

  readonly redact: Redact = (secret) => {
    let id = this.found.get(secret);
    if (!id) {
      id = newHandleId();
      this.found.set(secret, id);
    }
    return mark(id);
  };

  get count(): number {
    return this.found.size;
  }

  async persist(connectionId: string, instanceId: string): Promise<void> {
    if (this.found.size === 0) return;
    await deleteExpired();
    const expiresAt = new Date(Date.now() + HANDLE_TTL_MS);
    await db.insert(secretHandle).values(
      [...this.found].map(([value, id]) => ({
        id,
        connectionId,
        instanceId,
        value: encryptCredential(value),
        source: "response",
        expiresAt,
      })),
    );
  }
}

export type GenerateKind = "password" | "base64" | "hex";

// password: letters and digits only, so it is safe in any URL or env file.
// base64 and hex: `length` is the number of random bytes (base64 of 32
// bytes is what BETTER_AUTH_SECRET-style keys expect).
export function generateValue(kind: GenerateKind, length: number): string {
  if (kind === "base64") return randomBytes(length).toString("base64");
  if (kind === "hex") return randomBytes(length).toString("hex");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export async function mintGenerated(
  connectionId: string,
  kind: GenerateKind,
  length: number,
): Promise<{ handle: string; expiresAt: string }> {
  await deleteExpired();
  const id = newHandleId();
  const expiresAt = new Date(Date.now() + HANDLE_TTL_MS);
  await db.insert(secretHandle).values({
    id,
    connectionId,
    instanceId: null,
    value: encryptCredential(generateValue(kind, length)),
    source: "generated",
    expiresAt,
  });
  return { handle: mark(id), expiresAt: expiresAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

type Found = { id: string; path: string[] };

// Every handle in the inputs, with the path of the field it sits in.
export function findHandles(value: unknown, path: string[] = [], out: Found[] = []): Found[] {
  if (typeof value === "string") {
    for (const m of value.matchAll(HANDLE_MARK)) out.push({ id: m[1], path });
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => findHandles(item, [...path, String(i)], out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) findHandles(v, [...path, k], out);
  }
  return out;
}

function fill(value: unknown, values: Map<string, string>): unknown {
  if (typeof value === "string") return value.replace(HANDLE_MARK, (_m, id: string) => values.get(id) ?? "");
  if (Array.isArray(value)) return value.map((item) => fill(item, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, values)]));
  }
  return value;
}

export type Resolved =
  | { ok: true; inputs: Record<string, unknown>; used: string[] }
  | { ok: false; error: string };

// The inputs with every handle replaced by its value, for this connection
// and instance only. A generated handle used for the first time is bound
// to this instance from then on.
export async function resolveHandles(
  connectionId: string,
  instanceId: string,
  inputs: Record<string, unknown>,
): Promise<Resolved> {
  const found = findHandles(inputs);
  if (found.length === 0) return { ok: true, inputs, used: [] };

  const misplaced = found.find((f) => !secretField(f.path));
  if (misplaced) {
    return {
      ok: false,
      error:
        `A secret handle can only go in an env block or a password, token or key field, not in "${misplaced.path.join(".") || "(top level)"}". ` +
        "Zeqqat won't put a secret anywhere it could be sent elsewhere.",
    };
  }

  const ids = [...new Set(found.map((f) => f.id))];
  await deleteExpired();
  const rows = await db.query.secretHandle.findMany({
    where: and(
      inArray(secretHandle.id, ids),
      eq(secretHandle.connectionId, connectionId),
      or(isNull(secretHandle.instanceId), eq(secretHandle.instanceId, instanceId)),
    ),
  });
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `Unknown or expired secret handle: ${missing.map(mark).join(", ")}. ` +
        "Handles work for 30 minutes, on the connection and instance they came from. Read the value again to get a new handle, or mint one with zeqqat_secret.",
    };
  }

  const unbound = rows.filter((r) => r.instanceId === null).map((r) => r.id);
  if (unbound.length > 0) {
    await db
      .update(secretHandle)
      .set({ instanceId })
      .where(and(inArray(secretHandle.id, unbound), isNull(secretHandle.instanceId)));
  }

  const values = new Map(rows.map((r) => [r.id, decryptCredential(r.value)]));
  return { ok: true, inputs: fill(inputs, values) as Record<string, unknown>, used: ids.map(mark) };
}
