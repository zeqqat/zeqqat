// The "Test and save" check on the Connect Dokploy screen. One cheap read
// with the key the user pasted, sorted into an outcome the screen can
// explain in plain words. Nothing is saved unless this returns "ok".

export type ConnectionStatus = "ok" | "bad_key" | "unreachable" | "not_dokploy" | "bad_url";

export type ConnectionResult = {
  status: ConnectionStatus;
  baseUrl?: string;
  version?: string;
  projects?: number;
  detail?: string;
};

// Same rule as the executor: the cloud metadata endpoint is never a valid
// target, whoever typed it in.
const BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

// Accepts what people paste: trailing slashes, a trailing /api, or a link
// to a dashboard page. Keeps scheme, host and any base path before /api.
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (BLOCKED_HOSTS.has(url.hostname)) return null;
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/dashboard(\/.*)?$/, "").replace(/\/api$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

async function get(url: string, apiKey: string) {
  return fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function testDokployConnection(rawUrl: string, apiKey: string): Promise<ConnectionResult> {
  const baseUrl = normalizeBaseUrl(rawUrl);
  if (!baseUrl) return { status: "bad_url" };

  let res: Response;
  try {
    res = await get(`${baseUrl}/api/project.all`, apiKey);
  } catch (err) {
    return { status: "unreachable", baseUrl, detail: err instanceof Error ? err.message : String(err) };
  }

  if (res.status === 401 || res.status === 403) return { status: "bad_key", baseUrl };
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    return { status: "not_dokploy", baseUrl, detail: `HTTP ${res.status}` };
  }

  let projects: number | undefined;
  try {
    const data = await res.json();
    if (Array.isArray(data)) projects = data.length;
  } catch {
    return { status: "not_dokploy", baseUrl, detail: "response was not JSON" };
  }

  let version: string | undefined;
  try {
    const v = await get(`${baseUrl}/api/settings.getDokployVersion`, apiKey);
    if (v.ok) {
      const body = await v.json();
      if (typeof body === "string") version = body;
    }
  } catch {
    // The version is nice to show, not required to connect.
  }

  return { status: "ok", baseUrl, projects, version };
}

export const CONNECTION_MESSAGES: Record<Exclude<ConnectionStatus, "ok">, string> = {
  bad_url: "That doesn't look like a web address. Paste the URL you open your Dokploy dashboard at, starting with https://.",
  unreachable: "Couldn't reach Dokploy at that address. Check the URL, and that this Dokploy is reachable from the internet.",
  bad_key: "Dokploy rejected this API key (401). Generate a new key in Dokploy and paste it again.",
  not_dokploy: "Something answered, but it doesn't look like the Dokploy API. Check the URL.",
};
