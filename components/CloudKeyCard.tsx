"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { answerCloudKey } from "../lib/actions/cloud-handoff";
import type { PendingHandoff } from "../lib/cloud-handoff";
import type { DokployKey } from "../lib/dokploy-keys";

// The first thing the owner of a Zeqqat installed from zeqqat.com sees after
// signing in here: keep zeqqat.com's key for the instance, or delete it from
// Dokploy (lib/cloud-handoff.ts). Keep it is the default. Then Setup goes on.
export function CloudKeyCard({ h }: { h: PendingHandoff }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<DokployKey[] | null>(null);
  const [picked, setPicked] = useState("");
  const [done, setDone] = useState<"kept" | "deleted" | null>(null);
  const key = (
    <code className="zq-sh-keycode">
      <span className="pre">{h.hint?.start}</span>••••••••<span className="end">{h.hint?.end}</span>
    </code>
  );

  async function answer(choice: "kept" | "deleted", id?: string) {
    setBusy(true);
    setErr(null);
    const r = await answerCloudKey(h.id, choice, id);
    setBusy(false);
    if (r.ok) {
      setDone(choice);
      setPick(null);
    } else if ("pick" in r) {
      setPick(r.pick);
      setPicked("");
    } else setErr(r.error);
  }

  return (
    <div className="zq-sh">
      <h1 className="zq-h">
        The key {h.cloudHost} uses<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        {h.cloudHost} still has a key for {h.instanceAlias} ({key}).
      </p>
      <section className="zq-panel-box zq-sh-card">
        {done ? (
          <>
            <div className="zq-ok-box" role="status" style={{ marginBottom: 0, textAlign: "left" }}>
              <span className="ic" aria-hidden="true">
                ✓
              </span>
              <span>
                {done === "kept" ? (
                  <>You can still reach {h.instanceAlias} through {h.cloudHost} too.</>
                ) : (
                  <>
                    <b>
                      {h.hint?.start}••••{h.hint?.end} is deleted from your Dokploy.
                    </b>{" "}
                    {h.cloudHost} no longer reaches {h.instanceAlias}.
                  </>
                )}
              </span>
            </div>
            <div className="zq-sh-go">
              <button type="button" className="zq-action zq-action-primary" onClick={() => router.refresh()}>
                Continue
              </button>
            </div>
          </>
        ) : pick ? (
          <div className="zq-sh-pick" role="radiogroup" aria-label="Which key is it?">
            <p className="zq-note">Which of your Dokploy keys is it? Several could be.</p>
            {pick.map((k) => (
              <label key={k.id} className="zq-sh-pick-row">
                <input type="radio" name="dokploy-key" value={k.id} checked={picked === k.id} onChange={() => setPicked(k.id)} />
                <span>
                  <b>{k.name || "No name"}</b>
                  <small>
                    {k.prefix ? `${k.prefix} · ` : ""}
                    {k.createdAt ? `created ${new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </small>
                </span>
              </label>
            ))}
            <div className="zq-row-actions">
              <button type="button" className="zq-action" disabled={busy || !picked} onClick={() => answer("deleted", picked)}>
                Delete this key
              </button>
              <button type="button" className="zq-action zq-action-solid" disabled={busy} onClick={() => setPick(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="zq-note" style={{ textAlign: "left" }}>
              Keep it, and you can use {h.instanceAlias} here and on {h.cloudHost}. Only delete it if you won&rsquo;t use {h.cloudHost} again.
            </p>
            {err && (
              <div className="zq-warn-box" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                <span className="ic" aria-hidden="true">
                  !
                </span>
                <span>{err}</span>
              </div>
            )}
            <div className="zq-row-actions">
              <button type="button" className="zq-action zq-action-solid" disabled={busy} onClick={() => answer("kept")}>
                Keep it
              </button>
              <button type="button" className="zq-action" disabled={busy} onClick={() => answer("deleted")}>
                Delete the key
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
