"use client";

import { useRef, useState } from "react";
import {
  installConfigure,
  installCreate,
  installDeploy,
  installStatus,
} from "../lib/actions/selfhost";
import type { Created } from "../lib/selfhost-install";
import { AgentMark } from "./Marks";

type Props = {
  instances: { id: string; alias: string }[];
  agents: string[];
  siteHost: string;
};

type StepState = "idle" | "running" | "done" | "failed" | "warn";
type StepKey = "create" | "configure" | "deploy" | "start" | "check";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "create", label: "Create a zeqqat project and service" },
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
export function SelfHostFlow({ instances, agents, siteHost }: Props) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? "");
  const [states, setStates] = useState<Record<StepKey, StepState>>({
    create: "idle",
    configure: "idle",
    deploy: "idle",
    start: "idle",
    check: "idle",
  });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const created = useRef<Created | null>(null);
  const address = useRef<string | null>(null);
  const [shown, setShown] = useState<{
    address: string | null;
    dashboardUrl: string | null;
    composeId: string | null;
  }>({ address: null, dashboardUrl: null, composeId: null });

  const alias = instances.find((i) => i.id === instanceId)?.alias ?? "";
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
        const r = await installCreate(instanceId);
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

      if (from === "create" || from === "configure") {
        set("configure", "running");
        const r = await installConfigure(instanceId, c.composeId, c.appName);
        if (!r.ok) return fail("configure", r.error);
        address.current = r.address;
        setShown((p) => ({ ...p, address: r.address }));
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

  return (
    <div>
      <section
        className="zq-panel-box"
        style={{ marginTop: 24 }}
        aria-labelledby="sh-install"
      >
        <h2 className="zq-block-t" id="sh-install">
          Install on {instances.length === 1 ? alias : "your Dokploy"}
        </h2>
        {instances.length > 1 && (
          <div style={{ marginTop: 14, maxWidth: 320 }}>
            <label className="zq-label" htmlFor="sh-instance">
              Dokploy instance
            </label>
            <select
              className="zq-select"
              id="sh-instance"
              value={instanceId}
              disabled={busy || started}
              onChange={(e) => setInstanceId(e.target.value)}
            >
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alias}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="zq-note" style={{ marginTop: 10 }}>
          Adds a project called <b>zeqqat</b> on {alias}: Zeqqat and its own
          Postgres, at a free address Dokploy generates, so there&rsquo;s no DNS
          to set up. Uses the key {siteHost} already has for {alias}. Takes a
          few minutes.
        </p>
        {!started && (
          <div className="zq-row-actions">
            <button
              type="button"
              className="zq-action zq-action-primary"
              onClick={() => install()}
              disabled={busy || !instanceId}
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
                <span>
                  {s.label}
                  {s.key === "configure" &&
                    host &&
                    states.configure === "done" && (
                      <span className="zq-install-sub">{host}</span>
                    )}
                </span>
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
          <ol className="zq-steps">
            <li>
              Open <b>{host}</b> and create the first account. It owns this
              Zeqqat.
            </li>
            <li>
              Connect your Dokploy there. Its key stays on your own server.
            </li>
            <li>
              Copy the connection URL it gives you into each agent, in place of
              the {siteHost} one, and sign in again.
            </li>
          </ol>
          {agents.length > 0 && (
            <>
              <p className="zq-kicker" style={{ marginTop: 18 }}>
                Agents still using {siteHost}
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 10,
                  fontSize: 12.5,
                }}
              >
                {agents.map((h) => (
                  <div
                    key={h}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <AgentMark host={h} />
                    {h}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="zq-row-actions">
            <a
              className="zq-action zq-action-solid"
              href={shown.address}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open your Zeqqat
            </a>
            <a className="zq-action" href="/app/self-host/clean-up">
              Clean up {siteHost} (optional)
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
