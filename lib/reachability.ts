import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, Socket, type LookupFunction } from "node:net";
import { isPrivateAddress } from "./spec-import";

// Checks whether something on a Dokploy server can be reached from the
// internet, from where Zeqqat runs. Agents can't do this reliably (their
// sandboxes often reach nothing, or sit on the same network), and a check
// from inside the server passes even when its cloud firewall blocks the
// world. zeqqat.com is a normal server on the internet, so it sees what a
// stranger sees.
//
// It answers only a coarse outcome, never a page body, and never touches a
// private or link-local address: the IP is resolved once, checked, and the
// connection pinned to it (no DNS-rebinding window).

export type AddressOutcome = "live" | "error_page" | "certificate_not_ready" | "unreachable" | "not_found";
export type PortOutcome = "open" | "closed";

export type AddressCheck = {
  address: string;
  outcome: AddressOutcome;
  status?: number;
  resolvedIp?: string;
  detail: string;
};

const TIMEOUT_MS = 8_000;

// The ports a person might want to know are open on their Dokploy server:
// web (80, 443), SSH (22) and Dokploy's own dashboard (3000). Nothing else,
// so this never becomes a port scanner.
export const CHECKABLE_PORTS = [22, 80, 443, 3000] as const;

const TLS_NOT_READY = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
]);

// Pure: the outcome for an error code from a failed request.
export function classifyError(code: string | undefined): AddressOutcome {
  if (code && TLS_NOT_READY.has(code)) return "certificate_not_ready";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "not_found";
  return "unreachable";
}

// Pure: the outcome for an HTTP status. Redirects count as live (Zeqqat
// itself sends / to /signin); 4xx and 5xx mean something answered but the
// address isn't wired to a working app (Traefik's 404, a 502 from a down
// container).
export function classifyStatus(status: number): AddressOutcome {
  return status < 400 ? "live" : "error_page";
}

export function normalizeAddress(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (url.username || url.password) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    return new URL(`${url.protocol}//${url.hostname}/`);
  } catch {
    return null;
  }
}

async function resolvePublic(host: string): Promise<{ ip: string } | { error: AddressOutcome; detail: string }> {
  const bare = host.replace(/^\[|\]$/g, "");
  const addrs = isIP(bare) ? [{ address: bare }] : await lookup(bare, { all: true }).catch(() => []);
  if (addrs.length === 0) return { error: "not_found", detail: `${host} has no DNS record.` };
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    return { error: "unreachable", detail: `${host} points at a private address, which can't be reached from the internet.` };
  }
  return { ip: addrs[0].address };
}

const DETAIL: Record<AddressOutcome, string> = {
  live: "It loads from the internet.",
  error_page:
    "The server answered with an error page, so the address reaches the server but isn't wired to a working app (wrong service or port on the domain, or the app is down).",
  certificate_not_ready:
    "The server answers, but its HTTPS certificate isn't valid yet. Right after adding a domain this usually means the certificate is still being issued: try again in a minute.",
  unreachable:
    "Nothing answered from the internet. The server's cloud firewall most likely blocks ports 80 and 443 (common when a server only takes traffic through Cloudflare or a tunnel).",
  not_found: "The name has no DNS record.",
};

export async function checkAddress(raw: string): Promise<AddressCheck | null> {
  const url = normalizeAddress(raw);
  if (!url) return null;
  const address = url.href.replace(/\/$/, "");
  const resolved = await resolvePublic(url.hostname);
  if ("error" in resolved) return { address, outcome: resolved.error, detail: resolved.detail };
  const ip = resolved.ip;

  const result = await new Promise<{ status?: number; code?: string }>((done) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        host: url.hostname,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        port: url.protocol === "https:" ? 443 : 80,
        path: "/",
        method: "GET",
        headers: { "user-agent": "Zeqqat address check (+https://zeqqat.com/docs/self-host)" },
        timeout: TIMEOUT_MS,
        // Pinned to the IP checked above.
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
          opts?.all ? cb(null, [{ address: ip, family: isIP(ip) }]) : cb(null, ip, isIP(ip))) as unknown as LookupFunction,
      },
      (res) => {
        res.resume();
        done({ status: res.statusCode });
        req.destroy();
      },
    );
    req.on("timeout", () => {
      req.destroy();
      done({ code: "ETIMEDOUT" });
    });
    req.on("error", (e: NodeJS.ErrnoException) => done({ code: e.code }));
    req.end();
  });

  const outcome = result.status !== undefined ? classifyStatus(result.status) : classifyError(result.code);
  return { address, outcome, status: result.status, resolvedIp: ip, detail: DETAIL[outcome] };
}

export async function checkPort(ip: string, port: number): Promise<PortOutcome> {
  if (isPrivateAddress(ip) || !(CHECKABLE_PORTS as readonly number[]).includes(port)) throw new Error("not checkable");
  return new Promise((done) => {
    const s = new Socket();
    const finish = (o: PortOutcome) => {
      s.destroy();
      done(o);
    };
    s.setTimeout(5_000, () => finish("closed"));
    s.once("connect", () => finish("open"));
    s.once("error", () => finish("closed"));
    s.connect(port, ip);
  });
}
