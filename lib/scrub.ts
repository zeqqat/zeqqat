// Upstream APIs return whatever they return, and some of it is secret:
// Dokploy's application.one hands back an application's entire environment
// block — DATABASE_URL, signing keys and all — to any caller with plain
// read access. Zeqqat sits between that response and a model that will
// quote it straight into a transcript, so responses get scrubbed on the way
// through. This is a safety net over the whole catalog, not a substitute
// for not granting read access to something that returns secrets.
//
// Two independent checks, because each one misses what the other catches:
//   1. By name: a field or env var whose name says it holds a secret.
//   2. By shape: a value that looks like a secret whatever it's called
//      (STRIPE=sk_live_..., a PEM private key, a JWT, a random token).

export const REDACTED = "[redacted by zeqqat]";

// What a found secret is replaced with. The default is REDACTED; the
// executor passes one that swaps each secret for a handle the agent can
// use without seeing the value (lib/secret-handles.ts).
export type Redact = (secret: string) => string;
const redactAll: Redact = () => REDACTED;

// A value that already went through redaction, so it isn't redacted twice.
// A handle inside a URL (postgresql://app:{{zq_secret_..}}@db) stays as is.
function alreadyRedacted(value: string): boolean {
  return value.includes(REDACTED) || value.includes("{{zq_secret_");
}

// A variable reference such as ${POSTGRES_PASSWORD} or $DB_PASS names a
// secret without being one: compose files and templates are full of them.
function isPlaceholder(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}$|^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim().replace(/^(['"])(.*)\1$/, "$2"));
}

// ---------------------------------------------------------------------------
// 1. By name
// ---------------------------------------------------------------------------

// Names are split into words (camelCase, snake_case, kebab, dots) and matched
// word by word, not by substring. Substring matching hid `certificateType`
// ("letsencrypt") because it contains "cert", and `monkey` because it ends in
// "key". Bare `auth` is excluded on purpose: it matches author fields.
const SECRET_WORDS = new Set([
  "secret", "secrets",
  "token", "tokens",
  "password", "passwords", "passwd", "pwd", "passphrase",
  "credential", "credentials",
  "key", "keys", "apikey", "privatekey", "secretkey", "accesskey",
  "private",
  "encryption",
  "signature", "salt",
  "cert", "certs", "pem",
  "jwt", "bearer", "authorization",
  "session", "cookie", "cookies",
  "dsn",
]);

// Lowercase compounds that come through as one word ("githubprivatekey",
// "accesstoken") so word splitting can't see inside them.
const SECRET_SUBSTRINGS = /(secret|token|password|passwd|passphrase|credential|privatekey|apikey)/;

// Two-word phrases that are secrets only together.
const SECRET_PHRASES = [["database", "url"], ["connection", "string"]];

// Names that contain a secret word but hold a plain setting. These were
// redacted before and confused agents debugging SSL and Traefik config.
const SAFE_NAMES = new Set([
  "uniqueconfigkey", // Dokploy domain: integer id for the Traefik router
  "publickey",       // the public half of an SSH key pair, meant to be shared
  "issessionactive",
]);

// A last word that turns "about a secret" into "not the secret itself":
// certificateType, customCertResolver, keyId, tokenExpiresAt, passwordEnabled.
const SAFE_LAST_WORDS = new Set([
  "type", "id", "ids", "name", "names", "status", "enabled", "disabled",
  "at", "count", "resolver", "path", "length", "set",
]);

function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_.\-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function isSecretName(name: string): boolean {
  const words = splitWords(name);
  if (words.length === 0) return false;
  if (SAFE_NAMES.has(words.join(""))) return false;

  const last = words[words.length - 1];
  // A session id is the session itself, so `id` doesn't make it safe there.
  const sessionId = words.includes("session") && last === "id";
  if (SAFE_LAST_WORDS.has(last) && !sessionId) return false;

  if (words.some((w) => SECRET_WORDS.has(w))) return true;
  if (words.some((w) => SECRET_SUBSTRINGS.test(w))) return true;
  return SECRET_PHRASES.some(([a, b]) =>
    words.some((w, i) => w === a && words[i + 1] === b),
  );
}

// ---------------------------------------------------------------------------
// 2. By shape
// ---------------------------------------------------------------------------

// Formats with a recognizable prefix. These are redacted anywhere they appear:
// field values, env blocks, log lines, error messages.
const KNOWN_SECRET_VALUES: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g,                // Stripe
  /\bwhsec_[A-Za-z0-9+/=]{10,}/g,                            // Stripe webhook
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,             // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,                         // GitHub fine-grained
  /\bglpat-[A-Za-z0-9_-]{20,}/g,                             // GitLab
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,                        // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                                   // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}/g,                                // Google API key
  /\bGOCSPX-[A-Za-z0-9_-]{10,}/g,                            // Google OAuth secret
  /\bnpm_[A-Za-z0-9]{36}\b/g,                                // npm
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,           // SendGrid
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g,                 // OpenAI / Anthropic
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

// scheme://user:password@host, including an empty user (redis://:pw@host).
// Catches DATABASE_URL even when it arrives under a name that says nothing.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]*):([^\s/@]+)@/gi;

// For env values only: a long, random-looking token with no known prefix
// (a hand-rolled API key, a base64 signing secret). Needs length 20+, no
// spaces, and upper + lower + digit. Values that are all lowercase/digits
// (hex hashes, UUIDs, image tags, Google client ids) are left alone, so a
// pure-hex secret under a bland name still slips through.
function looksRandom(value: string): boolean {
  const v = value.trim().replace(/^(['"])(.*)\1$/, "$2");
  if (v.length < 20 || /\s/.test(v)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return false; // a URL, handled above
  if (!/[A-Z]/.test(v) || !/[a-z]/.test(v) || !/[0-9]/.test(v)) return false;
  return /^[A-Za-z0-9+/=_\-.~]+$/.test(v);
}

// KEY=VALUE, as it appears in an env block or a .env file dump.
const ENV_LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

function scrubString(input: string, redact: Redact): string {
  let out = input;
  for (const pattern of KNOWN_SECRET_VALUES) out = out.replace(pattern, (m) => redact(m));
  out = out.replace(URL_CREDENTIALS, (m, scheme, user, password) =>
    alreadyRedacted(password) || isPlaceholder(password) ? m : `${scheme}${user}:${redact(password)}@`,
  );

  if (out.includes("=")) {
    out = out
      .split("\n")
      .map((line) => {
        const match = ENV_LINE.exec(line);
        if (!match) return line;
        const [, indent, key, equals, value] = match;
        if (!value.trim() || alreadyRedacted(value) || isPlaceholder(value)) return line;
        if (!isSecretName(key) && !looksRandom(value)) return line;
        return `${indent}${key}${equals}${redact(value)}`;
      })
      .join("\n");
  }

  return out;
}

export function scrubSecrets<T>(value: T, depth = 0, redact: Redact = redactAll): T {
  if (depth > 12) return value;

  if (typeof value === "string") return scrubString(value, redact) as T;

  if (Array.isArray(value)) {
    return value.map((item) => scrubSecrets(item, depth + 1, redact)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // Booleans are flags (isPasswordSet: true), never the secret itself.
      const hide =
        isSecretName(key) && item !== null && item !== "" &&
        (typeof item === "string" || typeof item === "number") &&
        !(typeof item === "string" && (alreadyRedacted(item) || isPlaceholder(item)));
      out[key] = hide ? redact(String(item)) : scrubSecrets(item, depth + 1, redact);
    }
    return out as T;
  }

  return value;
}
