"use client";

import { useState } from "react";

type Tool = { name: string; kind: string; summary: string | null };

const KINDS = ["read", "create", "edit", "delete"] as const;

// The allow list of a policy. Kinds are only a helper here: "Select all
// read" ticks the boxes for the author to review; the saved policy is the
// explicit list, so a wrong kind label can never grant anything by itself.
export function PolicyToolPicker({ tools, selected, disabled }: { tools: Tool[]; selected: string[]; disabled?: boolean }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(selected));
  const toggle = (name: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const setKind = (kind: string, value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      for (const t of tools) if (t.kind === kind) (value ? next.add(t.name) : next.delete(t.name));
      return next;
    });

  return (
    <div>
      <p className="zq-note" style={{ marginTop: 0 }}>
        {on.size} of {tools.length} tools allowed. Anything not ticked is denied, including tools added by a later spec.
      </p>
      {KINDS.map((kind) => {
        const group = tools.filter((t) => t.kind === kind);
        if (group.length === 0) return null;
        return (
          <fieldset key={kind} className="zq-block" style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
            <legend className="zq-block-t" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`zq-kind k-${kind}`}>{kind}</span>
              <span className="zq-item-s">{group.length} tools</span>
              {!disabled && (
                <>
                  <button type="button" className="zq-action" onClick={() => setKind(kind, true)}>
                    Select all {kind}
                  </button>
                  <button type="button" className="zq-action" onClick={() => setKind(kind, false)}>
                    Clear
                  </button>
                </>
              )}
            </legend>
            <div className="zq-list">
              {group.map((t) => (
                <label className="zq-item" key={t.name} style={{ cursor: disabled ? "default" : "pointer" }}>
                  <input
                    type="checkbox"
                    name="allow"
                    value={t.name}
                    checked={on.has(t.name)}
                    onChange={() => toggle(t.name)}
                    disabled={disabled}
                  />
                  <span className="zq-item-main">
                    <span className="zq-item-t">
                      <code>{t.name}</code>
                    </span>
                    {t.summary && <span className="zq-item-s">{t.summary}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
