"use client";
import { useBase } from "./DashboardBase";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InstanceCall, InstancePerson, InstanceUrl } from "../lib/instance-page";
import { InstanceCardView, type InstanceCard } from "./InstanceCards";
import { McpUrlItemCard, type Period } from "./McpUrls";

// One Dokploy instance's page (designed 2026-11-18 on the "Dokploy instance
// page" canvas). The list's card on top, then four tabs: the MCP URLs that
// reach the instance (each with the policy it applies here), its calls, the
// people connected, and Manage. The card's period switch ("this week")
// drives the whole page: the URL cards and the calls listed.
//
// Lines shrink only when they would overflow, never at a fixed width (UI
// principle 51): agent pills become logos first, then the status pill drops
// its word, and on Connected the URLs become the link icon with a count.

export type Tab = "urls" | "calls" | "connected" | "manage";

const AGENT_LOGO: Record<string, string | null> = {
  claude: "/logos/claude.svg",
  cursor: "/logos/cursor.svg",
  chatgpt: "/logos/chatgpt.svg",
  other: null,
};

const AV_COLOURS = ["#2e6fe0", "#1e9e82", "#b57a11", "#8a4fd1", "#c9423a", "#3b8bb5", "#a8558a", "#5a6b78"];

export function Avatar({ p, className = "zq-mu-av" }: { p: { id: string; name: string; image: string | null }; className?: string }) {
  if (p.image) {
    // eslint-disable-next-line @next/next/no-img-element -- account photo, tiny
    return <img className={className} src={p.image} alt="" title={p.name} />;
  }
  const n = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={className} style={{ background: AV_COLOURS[n % AV_COLOURS.length] }} title={p.name} aria-hidden="true">
      {(p.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const I = {
  link: (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  ),
  person: (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Svg>
  ),
  globe: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </Svg>
  ),
  sliders: (
    <Svg>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Svg>
  ),
  status: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.8" />
    </Svg>
  ),
  tick: (
    <Svg>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  ),
  x: (
    <Svg>
      <path d="M7 7l10 10M17 7L7 17" />
    </Svg>
  ),
  chev: (
    <Svg>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  ok: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.8" />
    </Svg>
  ),
  blocked: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.7 5.7l12.6 12.6" />
    </Svg>
  ),
  error: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </Svg>
  ),
  running: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
};

function AgentPill({ brand, label, className = "" }: { brand: string; label: string; className?: string }) {
  const logo = AGENT_LOGO[brand] ?? null;
  return (
    <span className={`zq-mu-agent is-${brand} ${className}`} title={label}>
      {logo && <span className="zq-mono-logo" aria-hidden="true" style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }} />}
      <span className="zq-ip-agn">{label}</span>
    </span>
  );
}

// Re-run `fit` whenever the element's box changes size.
function useFit(ref: React.RefObject<HTMLElement | null>, fit: (el: HTMLElement) => void, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    fit(el);
    const ro = new ResizeObserver(() => fit(el));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------- Periods ----------

const DAY = 86_400_000;
function since(period: Period, now: number) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - (period === "today" ? 0 : period === "week" ? 6 : 29) * DAY;
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function dur(ms: number | null) {
  if (ms == null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// ---------- Calls ----------

const STATUS_LABEL: Record<InstanceCall["outcome"], string> = { ok: "Done", blocked: "Blocked", error: "Error", running: "Running" };

function CallCard({ c, now }: { c: InstanceCall; now: number }) {
  const { ws: base } = useBase();
  const ref = useRef<HTMLAnchorElement>(null);
  useFit(
    ref,
    (card) => {
      card.classList.add("is-measuring");
      card.querySelectorAll<HTMLElement>(".zq-ip-cl").forEach((line) => {
        line.classList.remove("is-icons", "is-stshort");
        const fits = () => line.scrollWidth <= line.clientWidth;
        if (!fits() && line.querySelector(".zq-ip-agp .zq-mono-logo")) line.classList.add("is-icons");
        if (!fits() && line.querySelector(".zq-ip-spt")) line.classList.add("is-stshort");
      });
      card.classList.remove("is-measuring");
    },
    [c.id],
  );
  const d = dur(c.durationMs);
  const why = c.why ? `: ${c.why}` : "";
  return (
    <a ref={ref} className="zq-ip-c" href={`${base}/activity/call/${c.id}`}>
      {c.person ? (
        <Avatar p={c.person} className="zq-mu-av zq-ip-cav" />
      ) : (
        <span className="zq-mu-av zq-ip-cav is-more" title="Public, no sign-in">
          {I.globe}
        </span>
      )}
      <div className="zq-ip-cb">
        <div className="zq-ip-cl">
          <span className="zq-ip-cn">
            {c.person ? (
              <>
                <b>{c.person.name}</b> {c.person.username && <span>@{c.person.username}</span>}
              </>
            ) : (
              <>
                <b>Public</b> <span>no sign-in</span>
              </>
            )}
          </span>
          <span className="zq-ip-time">{ago(c.at, now)}</span>
        </div>
        <div className="zq-ip-cl">
          <span className="zq-ip-cg">
            <code className="zq-ip-tool">{c.op}</code>
            {c.kind && <span className="zq-ip-kind">{c.kind}</span>}
            {d && (
              <>
                <span className="zq-ip-dot">·</span>
                <span className="zq-ip-kind">{d}</span>
              </>
            )}
          </span>
        </div>
        <div className="zq-ip-cl zq-ip-cq">
          <span className="zq-ip-cg">
            <AgentPill brand={c.agent.brand} label={c.agent.label} className="zq-ip-agp" />
            {c.url && <span className="zq-ip-urlp">{c.url}</span>}
            <span className={`zq-ip-sp s-${c.outcome}`} title={`${STATUS_LABEL[c.outcome]}${why}`}>
              {I[c.outcome]}
              <span className="zq-ip-spt">{STATUS_LABEL[c.outcome]}</span>
            </span>
          </span>
        </div>
      </div>
    </a>
  );
}

type Sel = { s: Set<string>; u: Set<string>; p: Set<string> };
const STATUSES: [string, string][] = [
  ["ok", "Done"],
  ["blocked", "Blocked"],
  ["hidden", "Hidden"],
  ["error", "Errors"],
];

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function CallsTab({ calls, urls, period, now }: { calls: InstanceCall[]; urls: InstanceUrl[]; period: Period; now: number }) {
  const [sel, setSel] = useState<Sel>({ s: new Set(), u: new Set(), p: new Set() });
  const [open, setOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState<Set<string>>(new Set(["s"]));
  const close = useCallback(() => setOpen(false), []);
  const boxRef = useOutside(open, close);
  const rowRef = useRef<HTMLDivElement>(null);

  const from = since(period, now);
  const inPeriod = useMemo(() => calls.filter((c) => new Date(c.at).getTime() >= from), [calls, from]);
  const people = useMemo(() => {
    const m = new Map<string, NonNullable<InstanceCall["person"]>>();
    for (const c of calls) if (c.person) m.set(c.person.id, c.person);
    return [...m.values()];
  }, [calls]);
  const urlNames = useMemo(() => {
    const s = new Set(urls.map((u) => `${u.name}/${u.shortId}`));
    for (const c of calls) if (c.url) s.add(c.url);
    return [...s];
  }, [urls, calls]);

  const any = sel.s.size + sel.u.size + sel.p.size > 0;
  const shown = inPeriod.filter(
    (c) =>
      (!sel.s.size || sel.s.has(c.outcome) || (sel.s.has("hidden") && c.hidden)) &&
      (!sel.u.size || (c.url && sel.u.has(c.url))) &&
      (!sel.p.size || (c.person && sel.p.has(c.person.id))),
  );

  const toggle = (g: keyof Sel, v: string) =>
    setSel((old) => {
      const next = { s: new Set(old.s), u: new Set(old.u), p: new Set(old.p) };
      if (next[g].has(v)) next[g].delete(v);
      else next[g].add(v);
      return next;
    });
  const label = {
    s: (v: string) => STATUSES.find((x) => x[0] === v)?.[1] ?? v,
    u: (v: string) => <code>{v}</code>,
    p: (v: string) => {
      const p = people.find((x) => x.id === v);
      return p ? (
        <>
          <Avatar p={p} className="zq-mu-av zq-ip-fav" />
          {p.name}
        </>
      ) : (
        v
      );
    },
  };
  const groups: [keyof Sel, string, string[]][] = [
    ["s", "Status", STATUSES.map((x) => x[0])],
    ["u", "MCP URLs", urlNames],
    ["p", "People", people.map((p) => p.id)],
  ];

  // Chosen pills that don't fit become their group's icon + count:
  // people first, then MCP URLs, then statuses.
  useFit(
    rowRef,
    (wrap) => {
      const chosen = wrap.querySelector<HTMLElement>(".zq-ip-fchosen");
      const all = wrap.querySelector<HTMLElement>(".zq-ip-all");
      const icon = wrap.querySelector<HTMLElement>(".zq-ip-filter");
      if (!chosen || !all || !icon) return;
      chosen.classList.remove("short-s", "short-u", "short-p");
      const width = () =>
        [...chosen.querySelectorAll<HTMLElement>(".zq-ip-fpill")].reduce((w, c) => {
          const r = c.getBoundingClientRect().width;
          return r ? w + r + 6 : w;
        }, 0);
      const fits = () => all.getBoundingClientRect().width + 6 + width() + icon.offsetWidth + 16 <= wrap.clientWidth;
      for (const g of ["p", "u", "s"]) if (!fits()) chosen.classList.add(`short-${g}`);
    },
    [sel],
  );

  const short = { s: I.status, u: I.link, p: I.person };

  return (
    <>
      <div className="zq-ip-cfilters" ref={rowRef}>
        <button type="button" className={`zq-ip-pill zq-ip-all${any ? "" : " is-on"}`} onClick={() => setSel({ s: new Set(), u: new Set(), p: new Set() })}>
          All
        </button>
        <div className="zq-ip-fchosen">
          {(["s", "u", "p"] as const).map((g) =>
            sel[g].size ? (
              <span className="zq-ip-fsel" key={g} data-g={g}>
                <span className="zq-ip-full">
                  {[...sel[g]].map((v) => (
                    <span className="zq-ip-fpill" key={v}>
                      {label[g](v)}
                      <button type="button" aria-label="Remove" onClick={() => toggle(g, v)}>
                        {I.x}
                      </button>
                    </span>
                  ))}
                </span>
                <button type="button" className="zq-ip-short zq-ip-fpill" onClick={() => setOpen(true)} title={`${sel[g].size} chosen`}>
                  {short[g]}
                  <b>{sel[g].size}</b>
                </button>
              </span>
            ) : null,
          )}
        </div>
        <div className="zq-ip-filter" ref={boxRef}>
          <button type="button" className="zq-ip-filter-b" aria-label="Filter" aria-expanded={open} title="Filter" onClick={() => setOpen((v) => !v)}>
            {I.sliders}
          </button>
          {open && (
            <div className="zq-ip-filter-m" role="dialog" aria-label="Filter">
              {groups.map(([g, title, values]) => {
                const isOpen = groupsOpen.has(g);
                return (
                  <div className="zq-ip-fg" key={g}>
                    <button
                      type="button"
                      className="zq-ip-fg-h"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setGroupsOpen((o) => {
                          const n = new Set(o);
                          if (n.has(g)) n.delete(g);
                          else n.add(g);
                          return n;
                        })
                      }
                    >
                      <span>{title}</span>
                      {sel[g].size > 0 && <b className="zq-ip-fg-n">{sel[g].size}</b>}
                      <span className={`zq-ip-fg-chev${isOpen ? " is-open" : ""}`}>{I.chev}</span>
                    </button>
                    {isOpen && (
                      <div className="zq-ip-fg-opts">
                        {values.length === 0 && <span className="zq-ip-none">None yet</span>}
                        {values.map((v) => (
                          <button type="button" key={v} className={`zq-ip-opt${sel[g].has(v) ? " is-on" : ""}`} aria-pressed={sel[g].has(v)} onClick={() => toggle(g, v)}>
                            {sel[g].has(v) && <span className="zq-ip-opt-tick">{I.tick}</span>}
                            {label[g](v)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="zq-empty zq-mu-pad">{inPeriod.length === 0 ? "No calls in this period." : "No calls match these filters."}</p>
      ) : (
        <div className="zq-mu-panel zq-ip-calls">
          {shown.map((c) => (
            <CallCard key={c.id} c={c} now={now} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Connected ----------

function PersonRow({ p, now }: { p: InstancePerson; now: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const close = useCallback(() => setListOpen(false), []);
  const popRef = useOutside(listOpen, close);
  const [named, setNamed] = useState<string | null>(null);
  // Shrink only when the URLs and the agents would touch: agents to logos
  // first, then the URLs to the link icon with the count.
  useFit(
    ref,
    (line) => {
      line.classList.remove("is-icons", "is-short");
      const fits = () => line.scrollWidth <= line.clientWidth;
      if (!fits()) line.classList.add("is-icons");
      if (!fits()) line.classList.add("is-short");
    },
    [p.userId],
  );
  const many = p.urls.length > 2;
  return (
    <div className="zq-mu-person">
      <Avatar p={{ id: p.userId, name: p.name, image: p.image }} />
      <div className="zq-mu-pt">
        <div className="zq-mu-pl">
          <span className="zq-mu-pn">
            <b>{p.name}</b> {p.username && <span>@{p.username}</span>}
          </span>
          <span className="zq-mu-pd">connected {ago(p.since, now)}</span>
        </div>
        <div className="zq-mu-pl zq-ip-prow" ref={ref}>
          <span className="zq-ip-via">
            {p.calls.toLocaleString("en-US")} {p.calls === 1 ? "call" : "calls"} <span className="zq-ip-dot">·</span> via{" "}
            {!many &&
              p.urls.map((u) => (
                <code className="zq-ip-urlchip zq-ip-via-full" key={u}>
                  {u}
                </code>
              ))}
            <span className={`zq-ip-popw zq-ip-via-short${many ? " is-always" : ""}`} ref={popRef}>
              <button type="button" className="zq-ip-urlcount" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)} title={`${p.urls.length} MCP URL${p.urls.length === 1 ? "" : "s"}`}>
                {I.link}
                <b>{p.urls.length}</b>
              </button>
              {listOpen && (
                <span className="zq-ip-pop zq-ip-pop-list">
                  {p.urls.map((u) => (
                    <code key={u}>{u}</code>
                  ))}
                </span>
              )}
            </span>
          </span>
          <span className="zq-mu-agents">
            {p.agents.map((a) => (
              <span className="zq-ip-popw" key={`${a.brand}:${a.label}`}>
                <button type="button" className="zq-ip-agb" onClick={() => setNamed((n) => (n === a.label ? null : a.label))}>
                  <AgentPill brand={a.brand} label={a.label} />
                </button>
                {named === a.label && <span className="zq-ip-pop zq-ip-pop-name">{a.label}</span>}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Page ----------

export function InstancePage({
  card,
  urls,
  calls,
  people,
  manage,
  initialTab,
  addUrlHref,
  now,
}: {
  card: InstanceCard;
  urls: InstanceUrl[];
  calls: InstanceCall[];
  people: InstancePerson[];
  manage: React.ReactNode | null;
  initialTab: Tab;
  addUrlHref: string | null;
  now: number;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string][] = [
    ["urls", "MCP URLs"],
    ["calls", "Calls"],
    ["connected", "Connected"],
    ...(manage ? ([["manage", "Manage"]] as [Tab, string][]) : []),
  ];
  const go = (t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "urls") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    for (const k of ["key", "error", "updating", "checked"]) u.searchParams.delete(k);
    window.history.replaceState(null, "", u.toString());
  };

  return (
    <div className="zq-mu-page">
      <div className="zq-di-list zq-ip-one">
        <InstanceCardView c={card} period={period} onPeriod={setPeriod} linked={false} />
      </div>
      <div className="zq-mu-detail">
        <nav className="zq-mu-tabs" aria-label="Instance">
          {tabs.map(([t, label]) => (
            <a
              key={t}
              href={`?tab=${t}`}
              className={`zq-mu-tab${tab === t ? " is-on" : ""}`}
              aria-current={tab === t ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(t);
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        {tab === "urls" && (
          <div className="zq-mu-list zq-ip-urls">
            {addUrlHref && (
              <a className="zq-mu-addrow zq-ip-addrow" href={addUrlHref}>
                <span aria-hidden="true">+</span>Add to an MCP URL
              </a>
            )}
            {urls.length === 0 && <p className="zq-empty zq-mu-pad">No MCP URL reaches this instance yet.</p>}
            {urls.map((u) => (
              <McpUrlItemCard key={u.id} item={u} period={period} onPeriod={setPeriod} policy={u.policy} />
            ))}
          </div>
        )}

        {tab === "calls" && <CallsTab calls={calls} urls={urls} period={period} now={now} />}

        {tab === "connected" &&
          (people.length === 0 ? (
            <p className="zq-empty zq-mu-pad">No one has connected through an MCP URL that reaches this instance yet.</p>
          ) : (
            <div className="zq-mu-panel zq-ip-people">
              {people.map((p) => (
                <PersonRow key={p.userId} p={p} now={now} />
              ))}
            </div>
          ))}

        {tab === "manage" && manage}
      </div>
    </div>
  );
}
