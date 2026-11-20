"use client";
import { useBase } from "./DashboardBase";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { suggestToolAction, updateToolAction } from "../lib/actions/integrations";
import type { Kind, KindCounts, ToolRow } from "../lib/integrations";
import { WhatIsThis, WhatLink } from "./WhatIsThis";

const KIND_LABEL: Record<Kind, string> = { read: "Read", create: "Create", edit: "Edit", delete: "Delete" };
const KIND_ORDER: Kind[] = ["read", "create", "edit", "delete"];

const ICON = {
  sliders: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  ),
  tick: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  ),
};

export function KindPills({ kinds }: { kinds: KindCounts }) {
  return (
    <>
      {KIND_ORDER.map((k) => (
        <span key={k} className={`zq-mu-pill k-${k} is-on`}>
          <i aria-hidden="true" />
          {KIND_LABEL[k]} <b>{kinds[k]}</b>
        </span>
      ))}
    </>
  );
}

// The integration's version. When a Dokploy in view runs a newer version, its
// publisher gets a faint line under the part that changed; a click says it in
// one line. Everyone else sees the plain version.
export function IntegrationVersion({ release, newer }: { release: string | null; newer: string | null }) {
  const [said, setSaid] = useState(false);
  if (!release) return null;
  if (!newer) return <span className="zq-vp">{release}</span>;
  const a = release.replace(/^v/, "").split(".");
  const b = newer.replace(/^v/, "").split(".");
  const i = a.findIndex((p, n) => p !== b[n]);
  const head = i <= 0 ? "" : a.slice(0, i).join(".") + ".";
  const tail = i < 0 ? a.join(".") : a.slice(Math.max(i, 0)).join(".");
  return (
    <>
      {said && <span className="zq-in-meta" style={{ marginTop: 0 }}>Dokploy {newer} is out</span>}
      <button
        type="button"
        className="zq-vp"
        style={{ font: "inherit", fontSize: 11, cursor: "pointer", background: "none" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSaid((v) => !v);
        }}
      >
        {release.startsWith("v") ? "v" : ""}
        {head}
        <span className="zq-in-u">{tail}</span>
      </button>
    </>
  );
}

// Search on the left, the sliders filter on its right; the kinds picked show
// as pills under the search, after All. The list comes from the server, so
// both live in the address (?q=, ?kinds=read,create).
export function ToolFinder({
  rows,
  total,
  counts,
  publisher,
  publisherSlug,
}: {
  rows: ToolRow[];
  total: number;
  counts: KindCounts;
  publisher: boolean;
  publisherSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const kinds = (params.get("kinds") ?? "").split(",").filter((k): k is Kind => (KIND_ORDER as string[]).includes(k));
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const all = KIND_ORDER.reduce((a, k) => a + counts[k], 0);

  const go = (next: { q?: string; kinds?: Kind[] }) => {
    const p = new URLSearchParams(params.toString());
    const nq = next.q ?? q;
    const nk = next.kinds ?? kinds;
    if (nq.trim()) p.set("q", nq.trim());
    else p.delete("q");
    if (nk.length) p.set("kinds", KIND_ORDER.filter((k) => nk.includes(k)).join(","));
    else p.delete("kinds");
    p.set("tab", "tools");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) go({ q });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text drives this
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (k: Kind) => go({ kinds: kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k] });

  return (
    <>
      <div className="zq-in-find">
        <div className="zq-in-sr">
          <input
            className="zq-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, e.g. deploy, logs, domain"
            aria-label="Search tools"
            autoComplete="off"
          />
          <div className="zq-ip-filter" ref={box}>
            <button type="button" className={`zq-ip-filter-b${kinds.length ? " is-on" : ""}`} aria-label="Filter" aria-expanded={open} title="Filter" onClick={() => setOpen((v) => !v)}>
              {ICON.sliders}
            </button>
            {open && (
              <div className="zq-ip-filter-m" role="dialog" aria-label="Filter">
                <div className="zq-ip-fg">
                  <div className="zq-ip-fg-h" style={{ cursor: "default" }}>
                    <span>Kind</span>
                    {kinds.length > 0 && <b className="zq-ip-fg-n">{kinds.length}</b>}
                  </div>
                  <div className="zq-ip-fg-opts">
                    {KIND_ORDER.map((k) => (
                      <button
                        type="button"
                        key={k}
                        className={`zq-mu-pill k-${k} is-on${kinds.includes(k) ? " zq-in-sel" : ""}`}
                        aria-pressed={kinds.includes(k)}
                        onClick={() => toggle(k)}
                      >
                        {kinds.includes(k) ? <span className="zq-ip-opt-tick">{ICON.tick}</span> : <i aria-hidden="true" />}
                        {KIND_LABEL[k]} <b>{counts[k]}</b>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="zq-in-cf">
          <button type="button" className={`zq-mu-pill zq-in-all${kinds.length ? "" : " is-on"}`} onClick={() => go({ kinds: [] })}>
            All <b>{all}</b>
          </button>
          {kinds.map((k) => (
            <span key={k} className={`zq-mu-pill k-${k} is-on`}>
              <i aria-hidden="true" />
              {KIND_LABEL[k]} <b>{counts[k]}</b>
              <button type="button" className="zq-in-px" aria-label={`Remove ${KIND_LABEL[k]}`} onClick={() => toggle(k)}>
                {ICON.x}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div>
        {rows.length === 0 ? (
          <div className="zq-in-none">No tool matches. Agents searching for this would miss too.</div>
        ) : (
          rows.map((r) =>
            edit === r.id ? (
              <ToolEditor key={r.id} row={r} publisher={publisher} publisherSlug={publisherSlug} onDone={() => setEdit(null)} />
            ) : (
              <div className="zq-in-row" key={r.id}>
                <span className="t">
                  <code>{r.name}</code>
                  <small>{r.summary}</small>
                </span>
                <span className={`zq-kind k-${r.kind}`}>{r.kind}</span>
                <button
                  type="button"
                  className="zq-in-ed"
                  aria-label={publisher ? `Edit ${r.name}` : `Suggest a fix for ${r.name}`}
                  title={publisher ? "Edit" : "Suggest a fix"}
                  onClick={() => setEdit(r.id)}
                >
                  {ICON.pen}
                </button>
              </div>
            ),
          )
        )}
        {total > rows.length && (
          <div className="zq-in-more">
            {rows.length} of {total}. Search to narrow.
          </div>
        )}
      </div>
    </>
  );
}

function ToolEditor({ row, publisher, publisherSlug, onDone }: { row: ToolRow; publisher: boolean; publisherSlug: string; onDone: () => void }) {
  const [summary, setSummary] = useState(row.summary ?? "");
  const [kind, setKind] = useState<Kind>(row.kind);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () =>
    start(async () => {
      const r = publisher ? await updateToolAction(row.id, summary, kind) : await suggestToolAction(row.id, summary, kind);
      if (!r.ok) return setErr(r.error);
      if (publisher) {
        router.refresh();
        onDone();
      } else setSent(r.note ?? `Sent to @${publisherSlug}`);
    });
  return (
    <div className="zq-in-edit">
      <code>{row.name}</code>
      <input
        className="zq-input"
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          setErr(null);
        }}
        aria-label="Description"
        maxLength={120}
      />
      <div className="k" role="radiogroup" aria-label="Kind">
        {KIND_ORDER.map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            className={`zq-mu-pill k-${k} is-on${kind === k ? " zq-in-sel" : ""}`}
            onClick={() => {
              setKind(k);
              setErr(null);
            }}
          >
            {kind === k ? <span className="zq-ip-opt-tick">{ICON.tick}</span> : <i aria-hidden="true" />}
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="b">
        {err && <span className="err">{err}</span>}
        {sent && <span className="zq-in-meta" style={{ marginTop: 0, marginRight: "auto" }}>{sent}</span>}
        <button type="button" className="zq-action zq-action-sm" onClick={onDone}>
          {sent ? "Close" : "Cancel"}
        </button>
        {!sent && (
          <button type="button" className="zq-action zq-action-sm zq-action-primary" disabled={pending} onClick={save}>
            {publisher ? "Save" : "Suggest"}
          </button>
        )}
      </div>
    </div>
  );
}


export function IntegrationsWhat({ open }: { open: boolean }) {
  const { ws: base } = useBase();
  return (
    <WhatIsThis open={open}>
      An MCP tool is a Dokploy API endpoint with a description, so your agent knows what it does and when to use it. An
      integration is all of Dokploy&rsquo;s API endpoints, made into MCP tools. Zeqqat makes API calls to an{" "}
      <WhatLink href={`${base}/dokploy-instances?what=1`}>instance</WhatLink> via an integration.
    </WhatIsThis>
  );
}
