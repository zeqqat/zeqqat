"use client";

import { useEffect, useState } from "react";
import { callsSince } from "../lib/actions/selfhost";
import type { CallView } from "../lib/calls";
import { CopyButton } from "./CopyButton";
import { AgentMark } from "./Marks";

type Props = {
  instances: { id: string; alias: string }[];
  agents: string[];
  guideUrl: string;
  siteHost: string;
};

// Three steps on one page: send your agent the install prompt, watch its
// calls on that Dokploy arrive live, then paste the new Zeqqat's address
// to get its MCP URL. The progress list is the real call log, not a
// simulation: it shows exactly what the agent did.
export function SelfHostFlow({ instances, agents, guideUrl, siteHost }: Props) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? "");
  const [domain, setDomain] = useState("zeqqat.example.com");
  const [since, setSince] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallView[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const alias = instances.find((i) => i.id === instanceId)?.alias ?? "production";
  const prompt = `Install Zeqqat on my Dokploy instance "${alias}", following ${guideUrl}. Use the domain ${domain}. Tell me when it is live.`;

  useEffect(() => {
    if (!since || !instanceId) return;
    let stop = false;
    const tick = async () => {
      try {
        const rows = await callsSince(instanceId, since);
        if (!stop) setCalls(rows);
      } catch {
        // A failed poll just waits for the next one.
      }
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [since, instanceId]);

  function confirmUrl() {
    try {
      const u = new URL(newUrl.trim().startsWith("http") ? newUrl.trim() : `https://${newUrl.trim()}`);
      if (u.protocol !== "https:") throw new Error();
      if (u.host === siteHost) {
        setUrlError(`That's ${siteHost}. Paste the address of your own Zeqqat.`);
        return;
      }
      setUrlError(null);
      setConfirmedUrl(`${u.protocol}//${u.host}`);
    } catch {
      setUrlError("Paste the https:// address your new Zeqqat opens at.");
    }
  }

  return (
    <div>
      <section className="zq-panel-box" style={{ marginTop: 24 }} aria-labelledby="sh-1">
        <p className="zq-kicker">Step 1</p>
        <h2 className="zq-block-t" id="sh-1" style={{ marginTop: 6 }}>
          Send your agent the install prompt
        </h2>
        <div className="zq-grid2" style={{ marginTop: 14 }}>
          <div>
            <label className="zq-label" htmlFor="sh-instance">
              Install on
            </label>
            <select className="zq-select" id="sh-instance" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alias}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="zq-label" htmlFor="sh-domain">
              Domain for your Zeqqat
            </label>
            <input className="zq-input" id="sh-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
        </div>
        <div className="zq-cbox" style={{ marginTop: 16 }}>
          <div className="zq-cbox-top">
            <span className="zq-cbox-label">Send this to your agent</span>
            <CopyButton text={prompt} />
          </div>
          <pre className="zq-cbox-block" style={{ whiteSpace: "pre-wrap" }}>
            {prompt}
          </pre>
        </div>
        <p className="zq-help">
          The agent needs Create and Edit on {alias}. New agents have both by default. Point the domain&rsquo;s DNS at that
          Dokploy server first.
        </p>
        {!since && (
          <div className="zq-row-actions">
            <button type="button" className="zq-action" onClick={() => setSince(new Date().toISOString())} disabled={!instanceId}>
              I sent it, show progress
            </button>
          </div>
        )}
      </section>

      {since && (
        <section className="zq-block" aria-labelledby="sh-2">
          <div className="zq-block-h">
            <h2 className="zq-block-t" id="sh-2">
              Step 2: what your agent is doing on {alias}
            </h2>
            <span className="zq-block-a" style={{ color: "var(--faint)" }}>
              Updates every 3 seconds
            </span>
          </div>
          {calls.length === 0 ? (
            <p className="zq-empty">Waiting for your agent&rsquo;s first call on {alias}...</p>
          ) : (
            <div className="zq-list">
              {calls.map((c) => (
                <div className="zq-item" key={c.id}>
                  <span className={c.outcome === "ok" ? "zq-badge zq-badge-ok" : "zq-badge zq-badge-warn"} style={{ minWidth: 64, textAlign: "center" }}>
                    {c.outcome === "ok" ? "Done" : c.outcome === "blocked" ? "Blocked" : "Error"}
                  </span>
                  <div className="zq-item-main">
                    <div className="zq-item-t">{c.title}</div>
                    <div className="zq-item-s">
                      {c.agent}
                      {c.redactions ? ` · ${c.redactions} secrets redacted` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {calls.some((c) => c.outcome === "blocked") && (
            <p className="zq-note">
              A step was blocked by your permissions. Allow it in <a className="zq-textlink" href="/app/connections">Connections</a>{" "}
              and ask your agent to continue.
            </p>
          )}
        </section>
      )}

      <section className="zq-panel-box" style={{ marginTop: 24 }} aria-labelledby="sh-3">
        <p className="zq-kicker">Step 3</p>
        <h2 className="zq-block-t" id="sh-3" style={{ marginTop: 6 }}>
          Get your new MCP URL
        </h2>
        {!confirmedUrl ? (
          <>
            <p className="zq-note" style={{ marginTop: 8 }}>
              Once your agent says it&rsquo;s live, paste the address of your new Zeqqat.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <label className="zq-visually-hidden" htmlFor="sh-url">
                Your new Zeqqat address
              </label>
              <input
                className="zq-input"
                id="sh-url"
                placeholder={`https://${domain}`}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                style={{ flex: "999 1 260px" }}
              />
              <button type="button" className="zq-action zq-action-primary" onClick={confirmUrl} style={{ flex: "1 1 auto" }}>
                Show my MCP URL
              </button>
            </div>
            {urlError && (
              <div className="zq-warn-box" role="alert" style={{ marginTop: 10 }}>
                <span className="ic" aria-hidden="true">
                  !
                </span>
                <span>{urlError}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="zq-cbox" style={{ marginTop: 12 }}>
              <div className="zq-cbox-top">
                <span className="zq-cbox-label">Your self-hosted MCP URL</span>
                <span className="zq-badge zq-badge-ok">Self-hosted</span>
              </div>
              <div className="zq-cbox-row">
                <code>{confirmedUrl}/mcp</code>
                <CopyButton text={`${confirmedUrl}/mcp`} />
              </div>
            </div>
            <ol className="zq-steps">
              <li>
                Open <b>{confirmedUrl.replace(/^https:\/\//, "")}</b> and sign in with Google. The first account becomes its
                owner.
              </li>
              <li>Connect your Dokploy there. The key is stored on your own server.</li>
              <li>In each agent, replace the {siteHost} URL with the one above and sign in again.</li>
            </ol>
            {agents.length > 0 && (
              <>
                <p className="zq-kicker" style={{ marginTop: 18 }}>
                  Agents still using {siteHost}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, fontSize: 12.5 }}>
                  {agents.map((h) => (
                    <div key={h} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <AgentMark host={h} />
                      {h}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="zq-row-actions">
              <a className="zq-action zq-action-solid" href={confirmedUrl} rel="noreferrer noopener">
                Open your Zeqqat
              </a>
              <a className="zq-action" href="/app/self-host/clean-up">
                Clean up {siteHost} (optional)
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
