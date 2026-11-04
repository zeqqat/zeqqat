"use client";

import { useMemo, useState } from "react";
import type { CallView } from "../lib/calls";

const MARK = "[redacted by zeqqat]";
const BADGE: Record<string, string> = { ok: "zq-badge zq-badge-ok", error: "zq-badge zq-badge-warn", blocked: "zq-badge zq-badge-warn", running: "zq-badge zq-badge-cob" };
const LABEL: Record<string, string> = { ok: "Done", error: "Error", blocked: "Blocked", running: "Running" };

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Shows each "[redacted by zeqqat]" in the stored response as a
// highlighted mark, so it's visible exactly where a secret was removed.
function Highlighted({ text }: { text: string }) {
  const parts = text.split(MARK);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="zq-redact">{MARK}</span>}
        </span>
      ))}
    </>
  );
}

type Filter = "all" | "ok" | "blocked" | "redacted" | "error";

// Shared by Activity, an agent's page and an instance's page.
// showAgent/showInstance pick the extra identifiers in each row; filters
// only appear on the full Activity list.
export function CallLogList({
  calls,
  showAgent = false,
  showInstance = false,
  filters = false,
}: {
  calls: CallView[];
  showAgent?: boolean;
  showInstance?: boolean;
  filters?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<Filter>("all");
  const [agent, setAgent] = useState("");
  const [inst, setInst] = useState("");

  const agents = useMemo(() => [...new Set(calls.map((c) => c.agent))], [calls]);
  const instances = useMemo(() => [...new Set(calls.map((c) => c.instance).filter(Boolean) as string[])], [calls]);

  const shown = calls.filter((c) => {
    if (status === "redacted" && c.redactions === 0) return false;
    if (status !== "all" && status !== "redacted" && c.outcome !== status) return false;
    if (agent && c.agent !== agent) return false;
    if (inst && c.instance !== inst) return false;
    return true;
  });

  return (
    <div>
      {filters && calls.length > 0 && (
        <div className="zq-filters" style={{ marginTop: 0, marginBottom: 14 }}>
          <div className="zq-seg" role="group" aria-label="Status">
            {(
              [
                ["all", "All"],
                ["ok", "Done"],
                ["blocked", "Blocked"],
                ["redacted", "Redacted"],
                ["error", "Errors"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" className={status === k ? "is-on" : undefined} aria-pressed={status === k} onClick={() => setStatus(k)}>
                {label}
              </button>
            ))}
          </div>
          {agents.length > 1 && (
            <label className="zq-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              Agent
              <select className="zq-select" style={{ width: "auto", minWidth: 140 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          )}
          {instances.length > 1 && (
            <label className="zq-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              Instance
              <select className="zq-select" style={{ width: "auto", minWidth: 140 }} value={inst} onChange={(e) => setInst(e.target.value)}>
                <option value="">All instances</option>
                {instances.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="zq-empty">{calls.length === 0 ? "No calls yet." : "No calls match these filters."}</p>
      ) : (
        <div className="zq-list">
          {shown.map((c) => {
            const open = openId === c.id;
            const meta = [
              showAgent && c.agent,
              showInstance && c.instance,
              c.kind,
              c.redactions > 0 && `${c.redactions} redacted`,
              c.outcome !== "blocked" && `${c.durationMs}ms`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div className="zq-call" key={c.id}>
                <button type="button" className="zq-call-row" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}>
                  <span className={BADGE[c.outcome]} style={{ minWidth: 64, textAlign: "center" }}>
                    {LABEL[c.outcome]}
                  </span>
                  <div className="zq-item-main">
                    <div className="zq-item-t">{c.title}</div>
                    <div className="zq-item-s">{meta}</div>
                  </div>
                  <div className="zq-item-r" suppressHydrationWarning>
                    {relativeTime(c.createdAt)}
                  </div>
                </button>
                {open && (
                  <div className="zq-call-detail">
                    {c.error && (
                      <div className="zq-call-field">
                        <div className="zq-call-label">Error</div>
                        <pre className="zq-call-json">{c.error}</pre>
                      </div>
                    )}
                    <div className="zq-call-grid">
                      <div className="zq-call-field">
                        <div className="zq-call-label">Request</div>
                        <pre className="zq-call-json">{c.request}</pre>
                      </div>
                      <div className="zq-call-field">
                        <div className="zq-call-label">
                          {c.outcome === "blocked" ? "Never sent to Dokploy" : `Response, as the agent saw it (${c.status})`}
                        </div>
                        <pre className="zq-call-json">{c.response ? <Highlighted text={c.response} /> : "(none)"}</pre>
                      </div>
                    </div>
                    {c.redactions > 0 && (
                      <p className="zq-redact-note">
                        <span aria-hidden="true">✓</span>
                        {c.redactions === 1 ? "1 secret was" : `${c.redactions} secrets were`} replaced before the agent saw
                        this response.
                      </p>
                    )}
                    {c.outcome === "blocked" && (
                      <p className="zq-note" style={{ marginTop: 10 }}>
                        This call was stopped by the connection&rsquo;s policy or the person&rsquo;s role. <a className="zq-textlink" href="/app/connections">Change it in Connections</a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
