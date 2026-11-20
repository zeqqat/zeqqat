"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Client parts of the Policies pages: the policy name that opens scrolled to
// its end, and the MCP tools tab (search, the Show filter, toggles, save).

type Kind = "read" | "create" | "edit" | "delete";
const KINDS: Kind[] = ["read", "create", "edit", "delete"];
const LABEL: Record<Kind, string> = { read: "Read", create: "Create", edit: "Edit", delete: "Delete" };
export type Tool = { name: string; kind: Kind; summary: string; isNew: boolean };

// A long name stays on one line. When it doesn't fit, it opens scrolled to
// its end (the part that tells policies apart) and the shared start fades.
export function PolicyName({ prefix, name }: { prefix: string; name: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      el.classList.toggle("is-over", over);
      if (over) el.scrollLeft = el.scrollWidth;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!prefix) return <span className="zq-pl-name is-plain">{name}</span>;
  return (
    <code className="zq-pl-name" ref={ref}>
      <span className="zq-pl-own">{prefix}</span>
      {name}
    </code>
  );
}

const ICON = {
  sliders: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
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
};

// What the list shows. "All" stands alone; Allowed, New and the kinds add up
// (Allowed + Read = every allowed tool plus every read tool). Removing the
// last pick brings "All" back, so there is always one.
type Show = { all: boolean; allowed: boolean; isNew: boolean; kinds: Kind[] };
const ALL: Show = { all: true, allowed: false, isNew: false, kinds: [] };
const normal = (s: Show): Show => (!s.all && !s.allowed && !s.isNew && s.kinds.length === 0 ? ALL : s);

const MAX_ROWS = 150;

export function PolicyTools({
  tools,
  allow,
  editable,
  start,
  version,
  urls,
  presets,
  submitLabel,
  emptyNote,
}: {
  tools: Tool[];
  allow: string[];
  editable: boolean;
  start: "allowed" | "all" | "new";
  version: number | null; // null: a new policy
  urls: number;
  presets?: { label: string; allow: string[] }[];
  submitLabel?: string;
  emptyNote?: string;
}) {
  const [on, setOn] = useState<Set<string>>(() => new Set(allow));
  // What's saved. The page passes a new `key` after a save, so this resets.
  const [base] = useState<Set<string>>(() => new Set(allow));
  const [show, setShow] = useState<Show>(() =>
    start === "new" ? { all: false, allowed: false, isNew: true, kinds: [] } : start === "all" ? ALL : { all: false, allowed: true, isNew: false, kinds: [] },
  );
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const totals = useMemo(() => {
    const t: Record<Kind, number> = { read: 0, create: 0, edit: 0, delete: 0 };
    for (const x of tools) t[x.kind]++;
    return t;
  }, [tools]);
  const allowed: Record<Kind, number> = { read: 0, create: 0, edit: 0, delete: 0 };
  for (const x of tools) if (on.has(x.name)) allowed[x.kind]++;
  const allowedTotal = KINDS.reduce((a, k) => a + allowed[k], 0);
  const newCount = tools.filter((t) => t.isNew).length;

  const changed = tools.filter((t) => on.has(t.name) !== base.has(t.name)).length;

  const ql = q.trim().toLowerCase();
  const match = (t: Tool) => {
    if (show.all) return true;
    return (show.allowed && (on.has(t.name) || base.has(t.name))) || (show.isNew && t.isNew) || show.kinds.includes(t.kind);
  };
  const rows = tools.filter((t) => match(t) && (!ql || `${t.name} ${t.summary}`.toLowerCase().includes(ql)));

  const pick = (key: "all" | "allowed" | "new" | Kind) => {
    setShow((s) => {
      if (key === "all") return s.all ? s : ALL;
      const next: Show = { ...s, all: false };
      if (key === "allowed") next.allowed = !s.allowed;
      else if (key === "new") next.isNew = !s.isNew;
      else next.kinds = s.kinds.includes(key) ? s.kinds.filter((k) => k !== key) : [...s.kinds, key];
      return normal(next);
    });
  };
  const drop = (key: "all" | "allowed" | "new" | Kind) => {
    setShow((s) => {
      if (key === "all") return ALL; // All is the floor: it can't be emptier than everything
      const next: Show = { ...s };
      if (key === "allowed") next.allowed = false;
      else if (key === "new") next.isNew = false;
      else next.kinds = s.kinds.filter((k) => k !== key);
      return normal(next);
    });
  };
  const toggle = (name: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const oneKind = !show.all && !show.allowed && !show.isNew && show.kinds.length === 1 ? show.kinds[0] : null;
  const setKind = (k: Kind, value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      for (const t of tools) {
        if (t.kind !== k) continue;
        if (value) next.add(t.name);
        else next.delete(t.name);
      }
      return next;
    });

  const opt = (key: "all" | "allowed" | "new" | Kind, label: string, n: number, total?: number) => {
    const sel = key === "all" ? show.all : key === "allowed" ? show.allowed : key === "new" ? show.isNew : show.kinds.includes(key);
    const cls = key === "all" || key === "allowed" || key === "new" ? "zq-in-all" : `k-${key}`;
    return (
      <button type="button" key={key} className={`zq-mu-pill ${cls} is-on${sel ? " zq-in-sel" : ""}`} aria-pressed={sel} onClick={() => pick(key)}>
        {sel ? <span className="zq-ip-opt-tick">{ICON.tick}</span> : <i aria-hidden="true" />}
        {label} <b>{n}</b>
        {total !== undefined && <span>/{total}</span>}
      </button>
    );
  };
  const chip = (key: "all" | "allowed" | "new" | Kind, label: string, n: number, total?: number) => {
    const cls = key === "all" || key === "allowed" || key === "new" ? "zq-in-all" : `k-${key}`;
    return (
      <span key={key} className={`zq-mu-pill ${cls} is-on`}>
        <i aria-hidden="true" />
        {label} <b>{n}</b>
        {total !== undefined && <span>/{total}</span>}
        {!(key === "all" && show.all) && (
          <button type="button" className="zq-in-px" aria-label={`Remove ${label}`} onClick={() => drop(key)}>
            {ICON.x}
          </button>
        )}
      </span>
    );
  };

  return (
    <>
      {editable && [...on].map((n) => <input key={n} type="hidden" name="allow" value={n} />)}
      {presets && presets.length > 0 && (
        <div className="zq-pl-start">
          <span className="zq-pl-q">Start from</span>
          {presets.map((p, i) => (
            <button
              type="button"
              key={p.label}
              className={`zq-mu-pill zq-in-all${preset === i ? " is-on zq-in-sel" : ""}`}
              onClick={() => {
                setPreset(i);
                setOn(new Set(p.allow));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="zq-in-find">
        <div className="zq-in-sr">
          <input
            className="zq-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, e.g. deploy, logs, domain"
            aria-label="Search MCP tools"
            autoComplete="off"
          />
          <div className="zq-ip-filter" ref={box}>
            <button
              type="button"
              className={`zq-ip-filter-b${show.all ? "" : " is-on"}`}
              aria-label="Show"
              aria-expanded={open}
              title="Show"
              onClick={() => setOpen((v) => !v)}
            >
              {ICON.sliders}
            </button>
            {open && (
              <div className="zq-ip-filter-m" role="dialog" aria-label="Show">
                <div className="zq-ip-fg">
                  <div className="zq-ip-fg-h" style={{ cursor: "default" }}>
                    <span>Show</span>
                  </div>
                  <div className="zq-ip-fg-opts zq-pl-opts">
                    {opt("all", "All", tools.length)}
                    {opt("allowed", "Allowed", allowedTotal)}
                    {newCount > 0 && opt("new", "New", newCount)}
                    <span className="zq-pl-fsep" />
                    {KINDS.map((k) => opt(k, LABEL[k], allowed[k], totals[k]))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="zq-in-cf zq-pl-cf">
          {show.all && chip("all", "All", tools.length)}
          {show.allowed && chip("allowed", "Allowed", allowedTotal)}
          {show.isNew && chip("new", "New", newCount)}
          {show.kinds.map((k) => chip(k, LABEL[k], allowed[k], totals[k]))}
        </div>
      </div>
      {editable && oneKind && (
        <div className="zq-pl-bulk">
          <span>
            Allow all {totals[oneKind]} {oneKind} MCP tools
          </span>
          <button
            type="button"
            className="zq-toggle"
            aria-pressed={allowed[oneKind] === totals[oneKind]}
            aria-label={`Allow all ${oneKind} MCP tools`}
            onClick={() => setKind(oneKind, allowed[oneKind] !== totals[oneKind])}
          />
        </div>
      )}
      <div>
        {rows.length === 0 ? (
          <div className="zq-in-none">{emptyNote && show.allowed && !ql ? emptyNote : "No MCP tool matches."}</div>
        ) : (
          rows.slice(0, MAX_ROWS).map((t) => {
            const isOn = on.has(t.name);
            const diff = isOn !== base.has(t.name);
            return editable ? (
              <div
                key={t.name}
                className={`zq-in-row zq-pl-trow${isOn ? "" : " is-off"}${t.isNew ? " is-new" : ""}${diff ? " is-changed" : ""}`}
                onClick={() => toggle(t.name)}
              >
                <span className="t">
                  <code>{t.name}</code>
                  {t.summary && <small>{t.summary}</small>}
                </span>
                <span className={`zq-kind k-${t.kind}`}>{t.kind}</span>
                <button
                  type="button"
                  className="zq-toggle"
                  aria-pressed={isOn}
                  aria-label={`Allow ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(t.name);
                  }}
                />
              </div>
            ) : (
              <div key={t.name} className={`zq-in-row zq-pl-rorow${isOn ? "" : " is-off"}${t.isNew ? " is-new" : ""}`}>
                <span className="t">
                  <code>{t.name}</code>
                  {t.summary && <small>{t.summary}</small>}
                </span>
                <span className={`zq-kind k-${t.kind}`}>{t.kind}</span>
                <span className={`zq-pl-ro${isOn ? " is-on" : ""}`}>
                  {isOn ? (
                    <>
                      {ICON.tick}Allowed
                    </>
                  ) : (
                    "Off"
                  )}
                </span>
              </div>
            );
          })
        )}
        {rows.length > MAX_ROWS && (
          <div className="zq-in-more">
            {MAX_ROWS} of {rows.length}. Search to narrow.
          </div>
        )}
      </div>
      {editable && (version === null || changed > 0) && (
        <div className="zq-pl-save">
          <span className="zq-pl-save-t">
            {version === null ? (
              <>
                <b>
                  {allowedTotal} MCP tool{allowedTotal === 1 ? "" : "s"} allowed
                </b>
                <small>Everything not allowed is denied</small>
              </>
            ) : (
              <>
                <b>
                  {changed} change{changed === 1 ? "" : "s"}
                </b>
                <small>
                  {urls > 0 ? `Applies to ${urls} MCP URL${urls === 1 ? "" : "s"} from their next call` : "Not used by any MCP URL yet"}
                </small>
              </>
            )}
          </span>
          {version !== null && (
            <button type="button" className="zq-action zq-action-sm" onClick={() => setOn(new Set(base))}>
              Undo
            </button>
          )}
          <button type="submit" className="zq-action zq-action-sm zq-action-primary">
            {submitLabel ?? (version === null ? "Create policy" : `Save as v${version + 1}`)}
          </button>
        </div>
      )}
    </>
  );
}
