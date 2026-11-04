"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPermission, setPermission, type GrantField } from "../lib/actions/permissions";
import type { Perm } from "../lib/permissions";

export type MatrixRow = {
  key: string;
  instanceId: string;
  oauthClientId: string | null;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  perm: Perm;
  own: boolean; // false: follows the workspace default
};

const COLS: { k: keyof Perm; field: GrantField; label: string }[] = [
  { k: "read", field: "allowRead", label: "Read" },
  { k: "create", field: "allowCreate", label: "Create" },
  { k: "edit", field: "allowEdit", label: "Edit" },
  { k: "delete", field: "allowDelete", label: "Delete" },
];

// One table of switches. Rows are either the workspace default for an
// instance (oauthClientId null) or one agent on one instance. Dashed
// switches follow the default; changing one gives that agent its own
// setting, and "Use default" hands it back. Read-only for members.
export function PermMatrix({ rows, firstCol, editable }: { rows: MatrixRow[]; firstCol: string; editable: boolean }) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, { perm: Perm; own: boolean }>>({});
  const [, start] = useTransition();

  function view(r: MatrixRow) {
    return local[r.key] ?? { perm: r.perm, own: r.own };
  }

  function flip(r: MatrixRow, col: (typeof COLS)[number]) {
    const cur = view(r);
    const next = { ...cur.perm, [col.k]: !cur.perm[col.k] };
    setLocal((s) => ({ ...s, [r.key]: { perm: next, own: true } }));
    start(async () => {
      await setPermission(r.instanceId, r.oauthClientId, col.field, next[col.k]);
      router.refresh();
    });
  }

  function reset(r: MatrixRow) {
    if (!r.oauthClientId) return;
    const id = r.oauthClientId;
    setLocal((s) => {
      const copy = { ...s };
      delete copy[r.key];
      return copy;
    });
    start(async () => {
      await resetPermission(r.instanceId, id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="zq-matrix-wrap">
        <table className="zq-matrix">
          <thead>
            <tr>
              <th scope="col">{firstCol}</th>
              {COLS.map((c) => (
                <th scope="col" className="c" key={c.k}>
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="zq-visually-hidden">Source</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = view(r);
              const isDefault = r.oauthClientId === null;
              return (
                <tr key={r.key} className={isDefault ? "is-default" : undefined}>
                  <th scope="row">
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {r.icon && <span className="zq-item-ic" style={{ width: 28, height: 28 }}>{r.icon}</span>}
                      <span>
                        {r.label}
                        {r.hint && <small>{r.hint}</small>}
                      </span>
                    </span>
                  </th>
                  {COLS.map((c) => (
                    <td className="c" key={c.k}>
                      <button
                        type="button"
                        className={`zq-toggle${!isDefault && !v.own ? " is-inherit" : ""}`}
                        aria-pressed={v.perm[c.k]}
                        aria-label={`${c.label} for ${r.label}`}
                        disabled={!editable}
                        onClick={() => flip(r, c)}
                      />
                    </td>
                  ))}
                  <td>
                    {isDefault ? (
                      <span className="zq-badge">Default</span>
                    ) : v.own ? (
                      editable ? (
                        <button type="button" className="zq-textlink" onClick={() => reset(r)}>
                          Use default
                        </button>
                      ) : (
                        <span className="zq-badge zq-badge-cob">Custom</span>
                      )
                    ) : (
                      <span className="zq-badge">Follows default</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="zq-legend">
        <span>
          <span className="zq-toggle is-inherit" aria-hidden="true" aria-pressed="true" style={{ cursor: "default" }} />
          Dashed: follows the default
        </span>
        <span>
          <span className="zq-toggle" aria-hidden="true" aria-pressed="true" style={{ cursor: "default" }} />
          Solid: set for this agent
        </span>
        {!editable && <span>Only owners can change permissions.</span>}
      </div>
    </div>
  );
}
