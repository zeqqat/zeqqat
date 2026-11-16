"use client";

import { useEffect, useRef, useState } from "react";

// The interactive parts of an MCP URL's page (app/app/mcp-urls/[id]).

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
        <select
          className="zq-select"
          name={`${id}:policy`}
          value={policyId}
          disabled={!admin || !on}
          onChange={(e) => setPolicyId(e.target.value)}
          aria-label={`Policy for ${row.alias}`}
        >
          <option value="">No policy</option>
          {row.policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {/* a disabled select doesn't submit; keep the choice */}
        {(!admin || !on) && <input type="hidden" name={`${id}:policy`} value={policyId} />}
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
export function AgentChips({ agents }: { agents: { brand: string; label: string; logo: string | null }[] }) {
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
        <span key={`${a.brand}:${a.label}`} className={`zq-mu-agent is-${a.brand}`} title={a.label}>
          {a.logo && (
            <span className="zq-mono-logo" aria-hidden="true" style={{ maskImage: `url(${a.logo})`, WebkitMaskImage: `url(${a.logo})` }} />
          )}
          <span className="zq-mu-agent-n">{a.label}</span>
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
