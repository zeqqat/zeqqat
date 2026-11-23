"use client";

import { useEffect, useRef, useState } from "react";

// The interactive parts of an MCP URL's page (app/[org]/[ws]/mcp-urls/[id]).

type Kind = "read" | "create" | "edit" | "delete";
const KINDS: { k: Kind; label: string }[] = [
  { k: "read", label: "Read" },
  { k: "create", label: "Create" },
  { k: "edit", label: "Edit" },
  { k: "delete", label: "Delete" },
];
export type KindCounts = Record<Kind, number>;

export type InstanceRowData = {
  instanceId: string;
  alias: string;
  enabled: boolean;
  perm: Record<Kind, boolean>;
  policyId: string | null;
  totals: KindCounts; // tools that exist, per kind
  policies: { id: string; name: string; counts: KindCounts }[]; // what each pickable policy allows here
};

// One instance: reach it or not, its policy, then how many tools of each
// kind that allows. With no policy, a kind is all or nothing and its pill
// turns it on or off; with one, the policy's list decides and the pills
// only show the count. Public URLs are capped at read.
// A policy dropdown drawn by the page, so phones get a small menu under
// the field instead of the system's full-screen picker. The choice is
// submitted through the hidden input.
function PolicyPicker({
  name,
  value,
  options,
  disabled,
  label,
  onChange,
}: {
  name: string;
  value: string;
  options: { id: string; name: string }[];
  disabled: boolean;
  label: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const all = [{ id: "", name: "Default policy" }, ...options];
  const current = all.find((o) => o.id === value) ?? all[0];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  }
  return (
    <span ref={ref} className="zq-mu-pol">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="zq-mu-pol-b"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.name}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <span className="zq-mu-per-m" role="menu" onKeyDown={onMenuKey}>
          {all.map((o) => (
            <button
              key={o.id || "none"}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === value}
              className={o.id === value ? "on" : undefined}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function InstanceRow({ row, admin, isPublic }: { row: InstanceRowData; admin: boolean; isPublic: boolean }) {
  const [on, setOn] = useState(row.enabled);
  const [policyId, setPolicyId] = useState(row.policyId ?? "");
  const [perm, setPerm] = useState(row.enabled ? row.perm : { read: true, create: !isPublic, edit: !isPublic, delete: false });
  const pol = row.policies.find((p) => p.id === policyId);
  const id = row.instanceId;
  return (
    <div className={`zq-mu-irow${on ? "" : " is-out"}`}>
      <div className="zq-mu-ig">
        <label className="zq-mu-iname">
          <input
            type="checkbox"
            name={`${id}:enabled`}
            checked={on}
            disabled={!admin}
            onChange={(e) => setOn(e.target.checked)}
            aria-label={`Reach ${row.alias}`}
          />
          <span>{row.alias}</span>
        </label>
        <PolicyPicker
          name={`${id}:policy`}
          value={policyId}
          options={row.policies}
          disabled={!admin || !on}
          label={`Policy for ${row.alias}`}
          onChange={setPolicyId}
        />
      </div>
      <div className="zq-mu-pills">
        {KINDS.map(({ k, label }) => {
          const capped = isPublic && k !== "read";
          const n = !on || capped ? 0 : pol ? pol.counts[k] : perm[k] ? row.totals[k] : 0;
          const locked = !admin || !on || !!pol || capped;
          const title = capped ? "Public URLs are read only" : pol ? "Set by the policy" : perm[k] ? `Turn off ${label}` : `Allow all ${label} tools`;
          return (
            <label key={k} className={`zq-mu-pill k-${k}${n ? " is-on" : ""}${locked ? " is-locked" : ""}`} title={title}>
              <input
                type="checkbox"
                name={`${id}:${k}`}
                checked={perm[k] && !capped}
                onChange={(e) => {
                  if (locked) return;
                  setPerm((p) => ({ ...p, [k]: e.target.checked }));
                }}
                aria-label={`${row.alias} ${label}`}
                tabIndex={locked ? -1 : 0}
              />
              <i aria-hidden="true" />
              {label} <b>{n.toLocaleString("en-US")}</b>
              <span>/{row.totals[k].toLocaleString("en-US")}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function InstanceRows({ rows, admin, isPublic }: { rows: InstanceRowData[]; admin: boolean; isPublic: boolean }) {
  return (
    <>
      {rows.map((r) => (
        <InstanceRow key={r.instanceId} row={r} admin={admin} isPublic={isPublic} />
      ))}
    </>
  );
}

// The agents a person uses. When the chips would wrap onto another line,
// they shrink to logos (the name stays in the tooltip).
export function AgentChips({ agents }: { agents: { brand: string; label: string; logo: string | null; stale?: boolean }[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [icons, setIcons] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.classList.remove("is-icons");
      const first = el.firstElementChild as HTMLElement | null;
      const wraps = !!first && el.offsetHeight > first.offsetHeight + 4;
      el.classList.toggle("is-icons", wraps);
      setIcons(wraps);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={ref} className={`zq-mu-agents${icons ? " is-icons" : ""}`}>
      {agents.map((a) => (
        <span
          key={`${a.brand}:${a.label}`}
          className={`zq-mu-agent is-${a.brand}${a.stale ? " is-stale" : ""}`}
          title={a.stale ? undefined : a.label}
          tabIndex={a.stale ? 0 : undefined}
        >
          {a.logo && (
            <span className="zq-mono-logo" aria-hidden="true" style={{ maskImage: `url(${a.logo})`, WebkitMaskImage: `url(${a.logo})` }} />
          )}
          <span className="zq-mu-agent-n">{a.label}</span>
          {/* An old Zeqqat tool list: a faint amber line, and a click says
              what to do in one line (lib/tools-changed.ts). */}
          {a.stale && (
            <span className="zq-mu-stale-tip" role="tooltip">
              Old tool list. Reconnect Zeqqat in {a.label} to get the new tools.
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

// A Manage row: its title, its current value, one button on the right
// that opens the row's form. The page passes the form (fields only, with
// an id); the row draws its buttons: submit, any extra ones (each
// submitting its own form) and Cancel. `open` starts it open (after an
// error).
export function ManageRow({
  title,
  value,
  button,
  submit,
  formId,
  extra = [],
  danger = false,
  expandable = false,
  open: startOpen = false,
  children,
}: {
  title: string;
  value: React.ReactNode;
  button: string;
  submit: string;
  formId: string;
  extra?: { label: string; formId: string }[];
  danger?: boolean;
  expandable?: boolean;
  open?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const [full, setFull] = useState(false);
  return (
    <div className="zq-mu-mrow">
      <div className="zq-mu-mrow-h">
        {expandable ? (
          <button
            type="button"
            className="zq-mu-desc-b"
            onClick={() => setFull((v) => !v)}
            aria-expanded={full}
            title={full ? undefined : "Show all of it"}
          >
            <span className={`zq-mu-mrow-t zq-mu-desc${full ? " is-open" : ""}`} style={{ display: "block" }}>
              <b>{title}</b>
              <small>{value}</small>
            </span>
          </button>
        ) : (
          <span className="zq-mu-mrow-t">
            <b>{title}</b>
            <small>{value}</small>
          </span>
        )}
        <button
          type="button"
          className={`zq-action zq-action-sm zq-mu-mbtn${danger ? " zq-action-danger" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {button}
        </button>
      </div>
      <div className="zq-mu-mform" hidden={!open}>
        {children}
        <div className="zq-mu-mform-b">
          <button type="submit" form={formId} className={`zq-action zq-action-sm ${danger ? "zq-action-danger" : "zq-action-primary"}`}>
            {submit}
          </button>
          {extra.map((x) => (
            <button key={x.formId} type="submit" form={x.formId} className="zq-action zq-action-sm">
              {x.label}
            </button>
          ))}
          <button type="button" className="zq-action zq-action-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
