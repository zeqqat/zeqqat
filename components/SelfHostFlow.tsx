"use client";

import { useEffect, useRef, useState } from "react";
import {
  deactivateCloudKey,
  installConfigure,
  installCreate,
  installDeploy,
  installKey,
  installPreview,
  installStatus,
} from "../lib/actions/selfhost";
import type { KeyHint } from "../lib/key-hint";
import type { Created } from "../lib/selfhost-install";
import { projectNameFor } from "../lib/selfhost-names";
import { CopyButton } from "./CopyButton";
import { Avatar } from "./InstancePage";
import { DokployMark } from "./Marks";

type Inst = { id: string; alias: string; host: string; keyHint: KeyHint | null; added: string; workspaces: number };

type Props = {
  instances: Inst[];
  siteHost: string;
  // The person installing: the new Zeqqat's owner, shown on the live panel.
  owner: { id: string; name: string; username: string; image: string | null };
};

// "the key it already has" opens a small summary of that key: its prefix
// and last 4 characters (lib/key-hint.ts), never the rest. Underlines on
// hover; a click or tap opens it, a click elsewhere or Esc closes it.
function KeySummary({ inst }: { inst: Inst }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className={`zq-sh-key${open ? " is-open" : ""}`} ref={ref}>
      <button type="button" className="zq-sh-key-b" aria-expanded={open} aria-controls="zq-sh-key" onClick={() => setOpen((v) => !v)}>
        the key it already has
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.5v.01" strokeWidth="2.4" />
        </svg>
      </button>
      {open && (
        <span className="zq-sh-key-pop" id="zq-sh-key" role="note">
          <b>Dokploy key for {inst.alias}</b>
          {inst.keyHint && (inst.keyHint.start || inst.keyHint.end) ? (
            <code>
              <span className="pre">{inst.keyHint.start}</span>
              ••••••••
              <span className="end">{inst.keyHint.end}</span>
            </code>
          ) : (
            <code>••••••••</code>
          )}
          <span className="meta">{inst.added}</span>
        </span>
      )}
    </span>
  );
}

type StepState = "idle" | "running" | "done" | "failed" | "warn";
type StepKey = "create" | "key" | "configure" | "deploy" | "start" | "check";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "create", label: "Create the project" },
  { key: "key", label: "Create a Dokploy key for your Zeqqat" },
  { key: "configure", label: "Set up its address and secrets" },
  { key: "deploy", label: "Deploy" },
  { key: "start", label: "Start Zeqqat and its database" },
  { key: "check", label: "Check it loads from the internet" },
];

type Outcome =
  | { kind: "live" }
  | { kind: "unreachable" }
  | { kind: "deploy_failed" }
  | { kind: "error"; message: string; retry: StepKey }
  | { kind: "slow" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MARK: Record<StepState, string> = {
  idle: "",
  running: "",
  done: "✓",
  failed: "!",
  warn: "!",
};

// One button: Zeqqat installs itself into the chosen Dokploy with the key it
// already holds, and shows each step as it finishes. Plain code, no agent:
// the steps never change, so there's nothing for a model to decide.
export function SelfHostFlow({ instances, siteHost, owner }: Props) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? "");
  const [states, setStates] = useState<Record<StepKey, StepState>>({
    create: "idle",
    key: "idle",
    configure: "idle",
    deploy: "idle",
    start: "idle",
    check: "idle",
  });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const created = useRef<Created | null>(null);
  const address = useRef<string | null>(null);
  // The new install's own key, sealed by the server; never readable here.
  const sealed = useRef<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [ownKey, setOwnKey] = useState(false);
  const [keyChoice, setKeyChoice] = useState<"kept" | "off" | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [shown, setShown] = useState<{
    address: string | null;
    dashboardUrl: string | null;
    composeId: string | null;
  }>({ address: null, dashboardUrl: null, composeId: null });

  const inst = instances.find((i) => i.id === instanceId) ?? instances[0];
  const alias = inst?.alias ?? "";
  // The free address, asked from Dokploy before anything is created, so the
  // page shows it and the project is named after it.
  const [preview, setPreview] = useState<{ host: string } | { error: string } | null>(null);
  const [previewTry, setPreviewTry] = useState(0);
  useEffect(() => {
    let live = true;
    installPreview(instanceId).then((r) => live && setPreview(r.ok ? { host: r.host } : { error: r.error }));
    return () => {
      live = false;
    };
  }, [instanceId, previewTry]);
  const previewHost = preview && "host" in preview ? preview.host : undefined;
  const started = Object.values(states).some((s) => s !== "idle");
  const set = (key: StepKey, s: StepState) =>
    setStates((prev) => ({ ...prev, [key]: s }));

  async function install(from: StepKey = "create") {
    setBusy(true);
    setOutcome(null);
    const order = STEPS.map((s) => s.key);
    for (const k of order.slice(order.indexOf(from))) set(k, "idle");
    try {
      if (from === "create") {
        set("create", "running");
        const r = await installCreate(instanceId, previewHost);
        if (!r.ok) return fail("create", r.error);
        created.current = r;
        setShown((p) => ({
          ...p,
          dashboardUrl: r.dashboardUrl,
          composeId: r.composeId,
        }));
        set("create", "done");
      }
      const c = created.current;
      if (!c) return fail("create", "Start the install again.");

      if (from === "create" || from === "key") {
        set("key", "running");
        const k = await installKey(instanceId);
        if (!k.ok) return fail("key", k.error);
        sealed.current = k.sealed;
        set("key", "done");
      }

      if (from === "create" || from === "key" || from === "configure") {
        set("configure", "running");
        const r = await installConfigure(instanceId, c.composeId, c.appName, previewHost, sealed.current);
        if (!r.ok) return fail("configure", r.error);
        address.current = r.address;
        setShown((p) => ({ ...p, address: r.address }));
        setClaimUrl(r.claimUrl);
        setOwnKey(r.ownKey);
        set("configure", "done");
      }

      set("deploy", "running");
      const d = await installDeploy(instanceId, c.composeId);
      if (!d.ok) return fail("deploy", d.error);
      set("deploy", "done");

      await watch(c.composeId);
    } finally {
      setBusy(false);
    }
  }

  function fail(step: StepKey, message: string) {
    set(step, "failed");
    setOutcome({ kind: "error", message, retry: step });
  }

  // The deploy pulls two images and starts them: usually a minute or two.
  // Then the address: a new certificate can take a minute, and the app
  // answers with an error page until its migrations finish.
  async function watch(composeId: string) {
    const addr = address.current;
    if (!addr) return;
    set("start", "running");
    const deadline = Date.now() + 10 * 60_000;
    let checkingSince: number | null = null;
    while (Date.now() < deadline) {
      await sleep(4000);
      const s = await installStatus(instanceId, composeId, addr);
      if (!s.ok) continue; // a failed poll just waits for the next one
      if (s.deploy === "error") {
        set("start", "failed");
        setOutcome({ kind: "deploy_failed" });
        return;
      }
      if (s.deploy !== "done") continue;
      set("start", "done");
      if (checkingSince === null) {
        checkingSince = Date.now();
        set("check", "running");
      }
      if (s.reach === "live") {
        set("check", "done");
        setOutcome({ kind: "live" });
        return;
      }
      if (s.reach === "unreachable") {
        set("check", "warn");
        setOutcome({ kind: "unreachable" });
        return;
      }
      // certificate_not_ready, error_page (still starting) or not_found
      // (DNS for a fresh name): keep checking for up to four minutes.
      if (Date.now() - checkingSince > 4 * 60_000) break;
    }
    setStates((prev) => ({
      ...prev,
      start: prev.start === "done" ? "done" : "warn",
      check: prev.start === "done" ? "warn" : prev.check,
    }));
    setOutcome({ kind: "slow" });
  }

  const host = shown.address?.replace(/^https?:\/\//, "") ?? "";
  const dokployLink = shown.dashboardUrl && (
    <a
      className="zq-action"
      href={shown.dashboardUrl}
      target="_blank"
      rel="noreferrer noopener"
    >
      Open it in Dokploy
    </a>
  );

  const project = projectNameFor(previewHost);
  return (
    <div className="zq-sh">
      <h1 className="zq-h">
        Install Zeqqat on your own Dokploy<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        One click, and Zeqqat installs itself on your Dokploy with {inst ? <KeySummary inst={inst} /> : "the key it already has"}.
      </p>
      <section className="zq-panel-box zq-sh-card">
        <dl className="zq-sh-facts">
          <dt>Dokploy instance</dt>
          <dd>
            {instances.length > 1 ? (
              <select
                className="zq-select"
                aria-label="Dokploy instance"
                value={instanceId}
                disabled={busy || started}
                onChange={(e) => {
                  setPreview(null);
                  setInstanceId(e.target.value);
                }}
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.alias}
                  </option>
                ))}
              </select>
            ) : (
              <span className="zq-sh-inst">
                <DokployMark size={16} />
                {alias}
              </span>
            )}
            <small>{inst?.host}</small>
          </dd>
          <dt>Project</dt>
          <dd>
            {shown.dashboardUrl ? (
              <a className="zq-textlink" href={shown.dashboardUrl} target="_blank" rel="noreferrer noopener">
                {project}
              </a>
            ) : preview ? (
              project
            ) : (
              <span className="zq-sh-wait">Asking Dokploy...</span>
            )}
          </dd>
          <dt>Installs</dt>
          <dd>
            Zeqqat <i>latest</i> + Postgres <i>17</i>
          </dd>
          <dt>Address</dt>
          <dd>
            {previewHost ? (
              previewHost
            ) : preview && "error" in preview ? (
              <span className="zq-sh-err">
                {preview.error}{" "}
                <button type="button" className="zq-textlink" onClick={() => {
                    setPreview(null);
                    setPreviewTry((n) => n + 1);
                  }}>
                  Try again
                </button>
              </span>
            ) : (
              <span className="zq-sh-wait">Asking Dokploy...</span>
            )}
          </dd>
          <dt>Comes with you</dt>
          <dd>
            Your account, @{owner.username}
            <small>
              {inst && inst.workspaces > 0 ? `your ${inst.workspaces === 1 ? "workspace" : "workspaces"}, and ` : ""}
              {alias} with a new key of its own
            </small>
          </dd>
          <dt>Takes</dt>
          <dd>A few minutes</dd>
        </dl>
        {!started && (
          <div className="zq-sh-go">
            <button
              type="button"
              className="zq-action zq-action-primary"
              onClick={() => install()}
              disabled={busy || !instanceId || !previewHost}
            >
              Install Zeqqat on {alias}
            </button>
          </div>
        )}

        {started && (
          <ol className="zq-install-steps" aria-live="polite">
            {STEPS.map((s) => (
              <li key={s.key} data-state={states[s.key]}>
                <span className="zq-install-mark" aria-hidden="true">
                  {MARK[states[s.key]]}
                </span>
                <span>{s.label}</span>
                <span className="zq-visually-hidden">
                  {states[s.key] === "idle" ? "waiting" : states[s.key]}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {outcome?.kind === "error" && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 16 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>
            {outcome.message}{" "}
            <button
              type="button"
              className="zq-textlink"
              onClick={() => install(outcome.retry)}
              disabled={busy}
            >
              Try again
            </button>
          </span>
        </div>
      )}

      {outcome?.kind === "deploy_failed" && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t">The deploy failed in Dokploy</h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            Its deployment log says why. Nothing else on {alias} was touched.
          </p>
          <div className="zq-row-actions">
            {dokployLink}
            <button
              type="button"
              className="zq-action"
              onClick={() => install("deploy")}
              disabled={busy}
            >
              Deploy again
            </button>
          </div>
        </section>
      )}

      {outcome?.kind === "unreachable" && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t">
            Installed and running, not reachable yet
          </h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            <b>{host}</b> doesn&rsquo;t load from the internet because your
            server doesn&rsquo;t take web traffic on ports 80 and 443 directly.
            That&rsquo;s a fine way to run a server. To reach your Zeqqat, give
            it your own domain the way you route your other apps: service{" "}
            <b>zeqqat</b>, port <b>3000</b>, and set <b>ZEQQAT_PUBLIC_URL</b> to
            that address in its environment.
          </p>
          {claimUrl && (
            <p className="zq-note" style={{ marginTop: 8 }}>
              Then open it with <code>{new URL(claimUrl).pathname}</code> at the end of its address to set your password. <CopyButton text={new URL(claimUrl).pathname} />
            </p>
          )}
          <div className="zq-row-actions">{dokployLink}</div>
        </section>
      )}

      {outcome?.kind === "slow" && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t">Still not answering</h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            {host ? (
              <>
                The deploy went through, but <b>{host}</b> hasn&rsquo;t loaded
                yet. A first start can take a while on a small server.
              </>
            ) : (
              <>The deploy is taking longer than usual.</>
            )}{" "}
            Check its logs in Dokploy, or check again in a minute.
          </p>
          <div className="zq-row-actions">
            {dokployLink}
            {shown.composeId && (
              <button
                type="button"
                className="zq-action"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setOutcome(null);
                  try {
                    await watch(shown.composeId!);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Check again
              </button>
            )}
          </div>
        </section>
      )}

      {outcome?.kind === "live" && shown.address && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t">Your Zeqqat is live</h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            Set a password there. Your account:
          </p>
          <div className="zq-sh-owner">
            <Avatar p={{ id: owner.id, name: owner.name || owner.username, image: owner.image }} className="zq-mu-av zq-sh-owner-av" />
            <span className="who">
              <b>{owner.name || owner.username}</b>
              <small>@{owner.username}</small>
              <span className="role">Owner</span>
            </span>
          </div>
          <p className="zq-note" style={{ marginTop: 12 }}>
            Your account{inst && inst.workspaces > 0 ? `, ${inst.workspaces === 1 ? "workspace" : "workspaces"}` : ""} and {alias} instance are already on it.
          </p>
          <div className="zq-row-actions">
            <a className="zq-action zq-action-solid" href={claimUrl ?? shown.address} target="_blank" rel="noreferrer noopener">
              Open your Zeqqat
            </a>
          </div>
        </section>
      )}

      {outcome?.kind === "live" && ownKey && keyChoice === null && inst && (
        <section className="zq-panel-box" style={{ marginTop: 24 }}>
          <h2 className="zq-block-t">The key {siteHost} uses</h2>
          <p className="zq-note" style={{ marginTop: 8 }}>
            Your self-hosted Zeqqat now has its own key, separate from{" "}
            <code className="zq-sh-keycode">
              <span className="pre">{inst.keyHint?.start}</span>••••••••<span className="end">{inst.keyHint?.end}</span>
            </code>
            , the one {siteHost} uses for {alias}. You can deactivate it if you don&rsquo;t plan on using {siteHost}.
          </p>
          {keyErr && (
            <div className="zq-warn-box" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              <span className="ic" aria-hidden="true">
                !
              </span>
              <span>{keyErr}</span>
            </div>
          )}
          <div className="zq-row-actions">
            <button type="button" className="zq-action zq-action-solid" disabled={keyBusy} onClick={() => setKeyChoice("kept")}>
              Keep it
            </button>
            <button
              type="button"
              className="zq-action"
              disabled={keyBusy}
              onClick={async () => {
                setKeyBusy(true);
                setKeyErr(null);
                const r = await deactivateCloudKey(instanceId, shown.address ?? "");
                setKeyBusy(false);
                if (r.ok) setKeyChoice("off");
                else setKeyErr(r.error);
              }}
            >
              Deactivate the key
            </button>
          </div>
        </section>
      )}

      {keyChoice === "kept" && (
        <div className="zq-ok-box zq-sh-done" role="status">
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>You can still reach your {alias} instance through {siteHost}.</span>
        </div>
      )}
      {keyChoice === "off" && inst && (
        <div className="zq-ok-box zq-sh-done" role="status">
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            <b>
              {inst.keyHint?.start}••••{inst.keyHint?.end} is deactivated.
            </b>{" "}
            {siteHost} no longer reaches {alias} with it. It still works in your Dokploy until you delete it there.{" "}
            <a className="zq-textlink" href={`dokploy-instances/${instanceId}?tab=manage`}>
              See it on {alias}
            </a>
          </span>
        </div>
      )}
    </div>
  );
}
