import { redirect } from "next/navigation";
import { edition } from "../../../lib/edition";
import { requireWorkspace } from "../../../lib/guard";
import { isOperator, operatorStats, repoStats } from "../../../lib/operator";

// Operator page: who signed up, whether they use it, and (on zeqqat.com)
// how many self-hosted installs are running. Only the operator (owner of
// @zeqqat) can open it; everyone else is sent back to the overview.

const fmtDate = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

function since(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="zq-stat">
      <div className="zq-stat-n">{n}</div>
      <div className="zq-stat-l">{label}</div>
    </div>
  );
}

// Thirty bars, one per day. Heights are relative to the busiest day.
function Bars({ days }: { days: { day: string; n: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }} role="img" aria-label="Sign-ups per day, last 30 days">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.n}`}
            style={{
              flex: 1,
              height: d.n ? `${Math.max(8, (d.n / max) * 100)}%` : 2,
              background: d.n ? "var(--mint)" : "var(--line)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
        <span>{days[0]?.day}</span>
        <span>today</span>
      </div>
    </div>
  );
}

const LINKS = [
  { label: "Umami analytics", href: "https://analytics.zeqqat.com/websites/416842d6-b6be-46ec-ad47-755c5093d8fc" },
  { label: "GHCR image downloads", href: "https://github.com/zeqqat/zeqqat/pkgs/container/zeqqat" },
  { label: "GitHub traffic (clones, views)", href: "https://github.com/zeqqat/zeqqat/graphs/traffic" },
];

export default async function OperatorPage() {
  const { user } = await requireWorkspace();
  if (!(await isOperator(user.id))) redirect("/app");

  const cloud = edition() === "cloud";
  const [s, repo] = await Promise.all([operatorStats(), cloud ? repoStats() : Promise.resolve(null)]);

  return (
    <div>
      <p className="zq-kicker">Operator</p>
      <h1 className="zq-h">
        How it&rsquo;s going<span className="dot">.</span>
      </h1>
      <p className="zq-sub">Only you see this page. Numbers are live from this install&rsquo;s database.</p>

      <section className="zq-block">
        <h2 className="zq-block-t">People</h2>
        <div className="zq-stats">
          <Stat n={s.users.total} label="Users" />
          <Stat n={s.users.last7} label="New, last 7 days" />
          <Stat n={s.usage.requests7} label="Agent requests, last 7 days" />
          <Stat n={s.usage.calls7} label="Tool calls, last 7 days" />
        </div>
        <div style={{ marginTop: 18 }}>
          <Bars days={s.signupsDaily} />
        </div>
      </section>

      {cloud && (
        <section className="zq-block">
          <h2 className="zq-block-t">Self-hosted installs</h2>
          <div className="zq-stats">
            <Stat n={s.installs.active7} label="Active, pinged in 7 days" />
            <Stat n={s.installs.new7} label="New, last 7 days" />
            <Stat n={s.installs.total} label="Seen ever" />
            <Stat n={repo ? repo.stars : "–"} label={repo ? `GitHub stars · ${repo.forks} forks` : "GitHub stars (unavailable)"} />
          </div>
          {s.installs.versions.length > 0 && (
            <p className="zq-sub" style={{ marginTop: 14 }}>
              Versions in use: {s.installs.versions.map((v) => `${v.version} (${v.n})`).join(", ")}
            </p>
          )}
          {s.installs.recent.length > 0 ? (
            <table className="zq-matrix" style={{ marginTop: 14, width: "100%" }}>
              <thead>
                <tr>
                  <th>Install</th>
                  <th>Version</th>
                  <th>First seen</th>
                  <th>Last ping</th>
                  <th>Pings</th>
                </tr>
              </thead>
              <tbody>
                {s.installs.recent.map((i) => (
                  <tr key={i.installId}>
                    <td style={{ fontFamily: "var(--font-mono), monospace" }}>{i.installId.slice(0, 8)}</td>
                    <td>{i.version}</td>
                    <td>{fmtDate(i.firstSeenAt)}</td>
                    <td>{since(i.lastSeenAt)}</td>
                    <td>{i.pingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="zq-sub" style={{ marginTop: 14 }}>
              No pings yet. Installs on v0.2.1 or later ping once on start and daily after, unless they set ZEQQAT_TELEMETRY=0.
            </p>
          )}
        </section>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t">Latest sign-ups</h2>
        <table className="zq-matrix" style={{ marginTop: 12, width: "100%" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Signed in with</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {s.users.recent.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.providers || "–"}</td>
                <td>{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {cloud && (
        <section className="zq-block">
          <h2 className="zq-block-t">Elsewhere</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
