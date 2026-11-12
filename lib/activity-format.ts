// Pure helpers for the Activity screens (project doc
// activity-request-card-v1). No database, so they are tested directly.

export type CallState = "ok" | "running" | "blocked" | "error";

export function callState(outcome: string): CallState {
  if (outcome === "ok" || outcome === "running" || outcome === "blocked") return outcome;
  return "error";
}

// Twitter-style: now, 40s, 18m, 5h, then a short date; the year only when
// it isn't this year. `timeZone` is the viewer's, when known.
export function relativeTime(at: Date, now: Date = new Date(), timeZone?: string): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  const year = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(d));
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone };
  if (year(at) !== year(now)) opts.year = "numeric";
  return new Intl.DateTimeFormat("en-US", opts).format(at);
}

// "Sun, 1 Nov 2026" / "13:44:50" / "EAT", in the viewer's zone.
export function exactParts(at: Date, timeZone?: string) {
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone }).format(at);
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  return { date, time, zone };
}

export function utcText(at: Date): string {
  return `${at.toISOString().replace("T", " ").slice(0, 23)} UTC`;
}

export function durationText(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// The strip under a request card never wraps: a dot per call up to 12, a
// thin tick per call up to 40, then one bar split by state in proportion.
export function stripMode(count: number): "dots" | "ticks" | "bar" {
  if (count <= 12) return "dots";
  if (count <= 40) return "ticks";
  return "bar";
}

export function countStates(states: CallState[]): Record<CallState, number> {
  const n: Record<CallState, number> = { ok: 0, running: 0, blocked: 0, error: 0 };
  for (const s of states) n[s]++;
  return n;
}

// "5 calls · 1 blocked": only the states that aren't plain done.
export function tallyParts(states: CallState[]): { total: string; extra: { state: CallState; text: string }[] } {
  const n = countStates(states);
  const extra: { state: CallState; text: string }[] = [];
  if (n.running) extra.push({ state: "running", text: `${n.running} running` });
  if (n.error) extra.push({ state: "error", text: `${n.error} failed` });
  if (n.blocked) extra.push({ state: "blocked", text: `${n.blocked} blocked` });
  return { total: `${states.length} ${states.length === 1 ? "call" : "calls"}`, extra };
}

// "@zeqqat/dokploy.http.application_one" -> ["@zeqqat/", "dokploy.http.application_one"]
export function splitCanonical(name: string): [string, string] {
  const m = /^(@[^/]+\/)(.+)$/.exec(name);
  return m ? [m[1], m[2]] : ["", name];
}

// "@gaita/dokploy.policy.read_plus_deploy" -> "read_plus_deploy"
export function policyShortName(canonical: string | null): string | null {
  if (!canonical) return null;
  const i = canonical.lastIndexOf(".policy.");
  return i >= 0 ? canonical.slice(i + ".policy.".length) : canonical;
}

// A built-in call as one quiet line on the request page.
export function lookupText(action: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (action) {
    case "search":
      return str(a.query) ? `Looked up “${a.query}” in the catalog` : "Looked up the catalog";
    case "describe":
      return str(a.name) ? `Read how ${a.name} works` : "Read how a tool works";
    case "whoami":
      return "Checked what this connection reaches";
    case "policy":
      return str(a.instance) ? `Read the policy on ${a.instance}` : "Read the policies on this connection";
    case "docs":
      return str(a.question) ? `Read the Zeqqat docs: “${a.question}”` : "Read the Zeqqat docs";
    case "run":
      return "Tried to run a tool";
    case "activity":
      return str(a.request) ? "Read one request in the activity log" : "Read the activity log";
    default:
      return `Used ${action}`;
  }
}

// The filters the overview tiles open Activity with:
// ?when=today and ?show=blocked|redacted. Anything else is ignored, so a
// hand-edited URL falls back to the plain list instead of erroring.
export type ActivityFilter = { today: boolean; show: "blocked" | "redacted" | null };

export function parseActivityFilter(p: { when?: string; show?: string }): ActivityFilter {
  return {
    today: p.when === "today",
    show: p.show === "blocked" || p.show === "redacted" ? p.show : null,
  };
}

export function activityFilterLabel(f: ActivityFilter): string | null {
  const what = f.show === "blocked" ? "Blocked calls" : f.show === "redacted" ? "Calls with secrets redacted" : f.today ? "Calls" : null;
  if (!what) return null;
  return f.today ? `${what} today` : what;
}
