"use client";

import { useEffect, useState } from "react";

/**
 * The product demo under the landing hero. Like the big screenshot on
 * coolify.io or datafa.st, it shows the product rather than describing it,
 * but it is drawn in HTML so it stays sharp, follows the theme, and never
 * goes stale against a renamed screen.
 *
 * Three views, one per promise in the headline: who did what (Activity),
 * what each agent may do (Permissions), and secrets the model never sees
 * (Secrets). It turns on its own every few seconds until the visitor picks
 * a tab, then stays where they put it. All names are placeholders.
 */
type View = "activity" | "permissions" | "secrets";

const VIEWS: { id: View; label: string; caption: string }[] = [
  {
    id: "activity",
    label: "Activity",
    caption:
      "Every request, who asked for it, which agent ran it, and every call it made. Blocked calls are stopped before they reach your API.",
  },
  {
    id: "permissions",
    label: "Permissions",
    caption:
      "A policy per connection, tool by tool. Anything you don't allow is denied, whatever the agent tries.",
  },
  {
    id: "secrets",
    label: "Secrets",
    caption:
      "Agents move keys, env vars and database URLs between services as handles. The model never sees the value.",
  },
];

const AUTO_MS = 6500;

function Logo({ src, mono = true }: { src: string; mono?: boolean }) {
  return mono ? (
    <span
      className="zq-mono-logo zq-demo-logo"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
      aria-hidden="true"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- tiny inline mark
    <img className="zq-demo-logo" src={src} alt="" aria-hidden="true" />
  );
}

function Activity() {
  const requests = [
    {
      who: "@maya",
      agent: { src: "/logos/claude.svg", mono: false, name: "Claude" },
      text: "Deploy My App to production and check the logs",
      when: "2m ago",
      calls: [
        { s: "ok", app: "/logos/dokploy.svg", tool: "dokploy.http.application.deploy", on: "prod" },
        { s: "ok", app: "/logos/dokploy.svg", tool: "dokploy.http.application.readLogs", on: "prod" },
        { s: "ok", app: "/logos/github.svg", tool: "github.mcp.create_issue", on: "my-org" },
      ],
    },
    {
      who: "@sam",
      agent: { src: "/logos/cursor.svg", mono: true, name: "Cursor" },
      text: "Clean up the old staging databases",
      when: "14m ago",
      calls: [
        { s: "ok", app: "/logos/dokploy.svg", tool: "dokploy.http.postgres.all", on: "staging" },
        { s: "no", app: "/logos/dokploy.svg", tool: "dokploy.http.postgres.remove", on: "staging" },
      ],
    },
    {
      who: "@maya",
      agent: { src: "/logos/chatgpt.svg", mono: true, name: "ChatGPT" },
      text: "Refund the duplicate charge on invoice 2041",
      when: "1h ago",
      calls: [
        { s: "ok", app: "/logos/stripe.svg", tool: "stripe.http.invoices.retrieve", on: "live" },
        { s: "ok", app: "/logos/stripe.svg", tool: "stripe.http.refunds.create", on: "live" },
      ],
    },
  ];
  return (
    <div className="zq-demo-list">
      {requests.map((r, i) => (
        <div key={i} className="zq-demo-req" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="zq-demo-req-head">
            <Logo src={r.agent.src} mono={r.agent.mono} />
            <span className="zq-demo-who">{r.who}</span>
            <span className="zq-demo-via">via {r.agent.name}</span>
            <span className="zq-demo-when">{r.when}</span>
          </div>
          <p className="zq-demo-req-text">{r.text}</p>
          <ul className="zq-demo-calls">
            {r.calls.map((c, j) => (
              <li key={j} className={c.s === "no" ? "is-no" : undefined}>
                <span className={`zq-demo-state zq-demo-state-${c.s}`} aria-label={c.s === "ok" ? "succeeded" : "blocked"} />
                <Logo src={c.app} />
                <code>{c.tool}</code>
                <span className="zq-demo-on">{c.s === "no" ? "blocked by policy" : c.on}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Permissions() {
  const kinds = ["read", "create", "edit", "delete"] as const;
  const rows: { app: string; name: string; allow: boolean[] }[] = [
    { app: "/logos/dokploy.svg", name: "Dokploy · prod", allow: [true, true, true, false] },
    { app: "/logos/dokploy.svg", name: "Dokploy · staging", allow: [true, true, true, true] },
    { app: "/logos/stripe.svg", name: "Stripe · live", allow: [true, false, false, false] },
    { app: "/logos/github.svg", name: "GitHub MCP", allow: [true, true, true, false] },
    { app: "/logos/supabase.svg", name: "Supabase MCP", allow: [true, false, false, false] },
  ];
  return (
    <div className="zq-demo-perm">
      <div className="zq-demo-perm-meta">
        <span>connection</span> <b>deployment</b>
        <span className="zq-demo-sep">·</span>
        <span>agents</span>
        <Logo src="/logos/claude.svg" mono={false} />
        <Logo src="/logos/cursor.svg" />
        <Logo src="/logos/chatgpt.svg" />
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Instance</th>
            {kinds.map((k) => (
              <th key={k} scope="col">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">
                <Logo src={r.app} />
                {r.name}
              </th>
              {r.allow.map((a, i) => (
                <td key={i}>
                  <span className={`zq-demo-tog${a ? " is-on" : ""}`} aria-label={a ? "allowed" : "denied"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Secrets() {
  return (
    <div className="zq-demo-chat">
      <div className="zq-demo-msg zq-demo-msg-user">
        Create a Postgres for My App and put its URL in the app&rsquo;s env.
      </div>
      <div className="zq-demo-tool">
        <Logo src="/logos/dokploy.svg" />
        <code>dokploy.http.postgres.create</code>
        <span className="zq-demo-arrow">&rarr;</span>
        <code className="zq-demo-handle">DATABASE_URL: {"{{zq_secret_7f2a…}}"}</code>
      </div>
      <div className="zq-demo-tool">
        <Logo src="/logos/dokploy.svg" />
        <code>dokploy.http.application.saveEnvironment</code>
        <span className="zq-demo-arrow">&larr;</span>
        <code className="zq-demo-handle">{"{{zq_secret_7f2a…}}"}</code>
      </div>
      <div className="zq-demo-msg zq-demo-msg-agent">
        <Logo src="/logos/claude.svg" mono={false} />
        <span>
          Done. My App now has <code>DATABASE_URL</code> set and is redeploying. I passed the URL
          as a handle, so I never saw it.
        </span>
      </div>
      <div className="zq-demo-vault">
        <span className="zq-demo-lock" aria-hidden="true" />
        Value stored encrypted in Zeqqat, discarded when the work is done.
      </div>
    </div>
  );
}

export function ProductDemo() {
  const [view, setView] = useState<View>("activity");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      const i = VIEWS.findIndex((v) => v.id === view);
      setView(VIEWS[(i + 1) % VIEWS.length].id);
    }, AUTO_MS);
    return () => clearTimeout(t);
  }, [view, auto]);

  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <section className="zq-demo" aria-label="Product demo">
      <div className="zq-demo-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === view}
            className={v.id === view ? "is-on" : undefined}
            onClick={() => {
              setAuto(false);
              setView(v.id);
            }}
          >
            {v.label}
            {v.id === view && auto ? (
              <span key={view} className="zq-demo-progress" style={{ animationDuration: `${AUTO_MS}ms` }} />
            ) : null}
          </button>
        ))}
      </div>
      <div className="zq-demo-frame">
        <div className="zq-demo-bar">
          <span className="zq-demo-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="zq-demo-url">zeqqat.com/my-org/{view}</span>
        </div>
        <div key={view} className="zq-demo-body" role="tabpanel">
          {view === "activity" ? <Activity /> : view === "permissions" ? <Permissions /> : <Secrets />}
        </div>
      </div>
      <p className="zq-demo-caption">{current.caption}</p>
    </section>
  );
}
