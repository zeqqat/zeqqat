import { AgentMark, agentName, DokployMark } from "./Marks";

// The overview's six tiles. Each one is a question people open the
// dashboard with, read from a number plus a glyph, and opens the page that
// explains it. Top row is today (changes by the minute), bottom row is the
// workspace's setup (changes rarely). Colour only shows when a count is
// worth looking at: amber for blocked, mint for redacted, amber dots for
// instances that aren't reachable.

type Instance = { alias: string; lastStatus: string | null };
type Person = { name: string; image: string | null };

const MAX_FACES = 4;

export function OverviewTiles({
  callsToday,
  hourly,
  blockedToday,
  redactedToday,
  agentHosts,
  instances,
  people,
}: {
  callsToday: number;
  hourly: number[];
  blockedToday: number;
  redactedToday: number;
  agentHosts: string[];
  instances: Instance[];
  people: Person[];
}) {
  const peak = Math.max(1, ...hourly);
  const agentLabel = agentHosts.map(agentName).join(", ");
  const instLabel = instances.map((i) => `${i.alias} ${statusWord(i.lastStatus)}`).join(", ");

  return (
    <div className="zq-stats zq-kpis">
      <a href="/app/activity?when=today" className="zq-stat zq-kpi">
        <span className="zq-kpi-l">Calls today</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{callsToday}</span>
          <span className="zq-kpi-spark" role="img" aria-label="Calls per hour today (UTC)">
            {hourly.map((n, h) => (
              <i
                key={h}
                className={n === 0 ? "is-zero" : undefined}
                style={{ height: `${Math.max(8, Math.round((n / peak) * 100))}%` }}
                title={`${String(h).padStart(2, "0")}:00 UTC · ${n} ${n === 1 ? "call" : "calls"}`}
              />
            ))}
          </span>
        </span>
      </a>

      <a href="/app/activity?when=today&show=blocked" className={`zq-stat zq-kpi${blockedToday ? " is-blocked" : ""}`}>
        <span className="zq-kpi-l">Blocked</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{blockedToday}</span>
          <span className="zq-kpi-ic" aria-hidden="true">
            <svg viewBox="0 0 10 10">
              <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
            </svg>
          </span>
        </span>
      </a>

      <a href="/app/activity?when=today&show=redacted" className={`zq-stat zq-kpi${redactedToday ? " is-redacted" : ""}`}>
        <span className="zq-kpi-l">Secrets redacted</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{redactedToday}</span>
          <span className="zq-kpi-mask" aria-hidden="true">
            sk_
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </a>

      <a href="/app/agents" className="zq-stat zq-kpi">
        <span className="zq-kpi-l">Agents</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{agentHosts.length}</span>
          <span className="zq-kpi-stack" title={agentLabel} aria-label={agentLabel || undefined}>
            {agentHosts.slice(0, MAX_FACES).map((h) => (
              <span key={h} className="zq-kpi-ag">
                <AgentMark host={h} size={14} />
              </span>
            ))}
            {agentHosts.length > MAX_FACES && <span className="zq-kpi-ag is-more">+{agentHosts.length - MAX_FACES}</span>}
          </span>
        </span>
      </a>

      <a href="/app/integrations" className="zq-stat zq-kpi">
        <span className="zq-kpi-l">Instances</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{instances.length}</span>
          <span className="zq-kpi-inst" title={instLabel} aria-label={instLabel || undefined}>
            <DokployMark size={15} />
            {instances.slice(0, 8).map((i) => (
              <i key={i.alias} className={`is-${dotState(i.lastStatus)}`} />
            ))}
          </span>
        </span>
      </a>

      <a href="/app/team" className="zq-stat zq-kpi">
        <span className="zq-kpi-l">Members</span>
        <span className="zq-kpi-row">
          <span className="zq-stat-n">{people.length}</span>
          <span className="zq-kpi-stack" title={people.map((p) => p.name).join(", ")}>
            {people.slice(0, MAX_FACES).map((p, i) => (
              <span key={i} className="zq-kpi-ag is-person" aria-hidden="true">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" referrerPolicy="no-referrer" />
                ) : (
                  (p.name.trim().charAt(0) || "?").toUpperCase()
                )}
              </span>
            ))}
            {people.length > MAX_FACES && <span className="zq-kpi-ag is-more">+{people.length - MAX_FACES}</span>}
          </span>
        </span>
      </a>
    </div>
  );
}

function dotState(status: string | null): "ok" | "warn" | "unknown" {
  if (status === "ok") return "ok";
  if (status === null) return "unknown";
  return "warn";
}

function statusWord(status: string | null) {
  if (status === "ok") return "reachable";
  if (status === "bad_key") return "key rejected";
  if (status === null) return "not checked";
  return "unreachable";
}
