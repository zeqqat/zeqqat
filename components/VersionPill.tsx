"use client";
import { useBase } from "./DashboardBase";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Release, ReleaseStatus } from "../lib/changelog";
import { CheckUpdates } from "./CheckUpdates";
import { getReleaseStatus, getUpdateDeploy, getUpdateRoute, startUpdate, type UpdateRoute } from "../lib/actions/updates";

// The version at the bottom of the side menu, with one pill: Latest, or
// Update available. The pill opens the What's new modal: every version's
// changes, newest first, and on a self-hosted install an Update now button
// that has Dokploy deploy Zeqqat again (lib/self-update.ts). The newer
// version's number is only shown inside the modal. While it updates, the
// modal shows the real steps (no percentage: Dokploy doesn't report one)
// and the list of changes stays scrollable.

type Phase = "idle" | "starting" | "restarting" | "failed";
// Inside "restarting": Dokploy is still deploying, or it finished (or the
// old Zeqqat stopped answering) and the new version is coming up.
type Stage = "deploying" | "booting";

export function VersionPill({ version, edition }: { version: string; edition: "cloud" | "self-hosted" }) {
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getReleaseStatus()
      .then((s) => live && setStatus(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const update = !!status?.updateAvailable;
  // Cloud always runs the newest build; say so even before the list loads.
  const known = edition === "cloud" || !!status;

  return (
    <>
      <span className="zq-ver">
        <span className="zq-ver-num">v{version}</span>
        {known && (
          <button
            type="button"
            className={`zq-ver-pill ${update ? "is-update" : "is-latest"}`}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {update ? "Update available" : "Latest"}
          </button>
        )}
      </span>
      {open && <WhatsNew version={version} edition={edition} status={status} onStatus={setStatus} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsNew({
  version,
  edition,
  status,
  onStatus,
  onClose,
}: {
  version: string;
  edition: "cloud" | "self-hosted";
  status: ReleaseStatus | null;
  onStatus: (s: ReleaseStatus) => void;
  onClose: () => void;
}) {
  const { ws: base } = useBase();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [restarting, setRestarting] = useState(false);

  const close = useCallback(() => {
    if (!restarting) onClose();
  }, [restarting, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const releases = status?.releases ?? [];

  return (
    <div className="zq-modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="zq-modal" role="dialog" aria-modal="true" aria-labelledby="zq-whatsnew-h">
        <div className="zq-modal-head">
          <h2 id="zq-whatsnew-h">What&apos;s new</h2>
          {edition === "self-hosted" && !restarting && <CheckUpdates onStatus={onStatus} />}
          <button ref={closeRef} type="button" className="zq-modal-x" onClick={close} aria-label="Close" disabled={restarting}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {edition === "self-hosted" && <SelfUpdate status={status} onBusy={setRestarting} />}

        <div className="zq-modal-list">
          {!status && <p className="zq-modal-note">Loading…</p>}
          {releases.map((r) => (
            <ReleaseRow key={r.version} r={r} current={version} latest={releases[0]?.version} />
          ))}
        </div>

        <div className="zq-modal-foot">
          <Link href={`${base}/releases`} onClick={onClose}>
            See all changes →
          </Link>
        </div>
      </div>
    </div>
  );
}

// The update itself, for a self-hosted install: the line saying a new
// version is ready, the Update now button, and the steps while it runs.
// Shown in the What's new modal and on the Releases page. Nothing when
// there is no newer version.
export function SelfUpdate({ status, onBusy }: { status: ReleaseStatus | null; onBusy?: (busy: boolean) => void }) {
  const [route, setRoute] = useState<UpdateRoute | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("deploying");
  const [elapsed, setElapsed] = useState(0);
  const update = !!status?.updateAvailable;
  const restarting = phase === "starting" || phase === "restarting";

  useEffect(() => {
    onBusy?.(restarting);
  }, [restarting, onBusy]);

  useEffect(() => {
    if (!update) return;
    let live = true;
    getUpdateRoute()
      .then((r) => live && setRoute(r))
      .catch(() => live && setRoute({ kind: "no_dokploy" }));
    return () => {
      live = false;
    };
  }, [update]);

  useEffect(() => {
    if (!restarting) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [restarting]);

  async function doUpdate() {
    if (!status) return;
    setError(null);
    setStage("deploying");
    setElapsed(0);
    setPhase("starting");
    const res = await startUpdate().catch(() => ({ ok: false as const, error: "Couldn't start the update." }));
    if (!res.ok) {
      setError(res.error);
      setPhase("failed");
      return;
    }
    setPhase("restarting");
    const target = status.latest;
    const deadline = Date.now() + 5 * 60 * 1000;
    // Dokploy pulls the new image and restarts Zeqqat. Ask the health check
    // which version answers until it's the new one, then reload. Meanwhile
    // ask Dokploy how the deploy is going, for the steps and to stop early
    // when it fails. A status from before this deploy is ignored: only
    // "running" seen first makes a later "done" or "error" count.
    const composeId = res.composeId;
    let sawRunning = false;
    let n = 0;
    const tick = async () => {
      let answered = false;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const body = (await r.json()) as { version?: string };
        if (body.version === target) {
          window.location.reload();
          return;
        }
        answered = true;
      } catch {
        // Down while it restarts: expected.
        setStage("booting");
      }
      if (answered && n++ % 2 === 0) {
        const s = await getUpdateDeploy(composeId).catch(() => null);
        if (s === "running") sawRunning = true;
        else if (sawRunning && s === "done") setStage("booting");
        else if (sawRunning && s === "error") {
          setError("Dokploy couldn't deploy the new version. Zeqqat is still running the old one. Check the deploy in Dokploy.");
          setPhase("failed");
          return;
        }
      }
      if (Date.now() > deadline) {
        setError("The update is taking longer than usual. Check the deploy in Dokploy.");
        setPhase("failed");
        return;
      }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  }

  if (!update || !status) return null;
  if (restarting) {
    return <UpdateProgress step={phase === "starting" ? 0 : stage === "deploying" ? 1 : 2} to={status.latest} elapsed={elapsed} />;
  }
  return (
    <div className="zq-modal-update">
      <UpdateLine route={route} phase={phase} error={error} />
      {route?.kind === "ready" && (
        <button type="button" className="zq-modal-btn" onClick={doUpdate}>
          {phase === "failed" ? "Try again" : "Update now"}
        </button>
      )}
    </div>
  );
}

// The update while it runs: three real steps, the current one spinning.
function UpdateProgress({ step, to, elapsed }: { step: number; to: string; elapsed: number }) {
  const steps = ["Asking Dokploy to deploy", `Dokploy is getting v${to}`, "Zeqqat restarts on the new version"];
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="zq-upd" role="status" aria-live="polite">
      <div className="zq-upd-h">
        <strong>Updating to v{to}</strong>
        <span className="zq-upd-t">{time}</span>
      </div>
      <ol className="zq-upd-steps">
        {steps.map((label, i) => (
          <li key={label} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
            <span className="zq-upd-i" aria-hidden="true">
              {i < step && (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <p className="zq-modal-note">This page reloads when it&apos;s done. Keep reading below while you wait.</p>
    </div>
  );
}

function UpdateLine({ route, phase, error }: { route: UpdateRoute | null; phase: Phase; error: string | null }) {
  let text: string;
  if (phase === "failed" && error) text = error;
  else if (!route) text = "A new version is ready.";
  else if (route.kind === "ready") text = "A new version is ready. Zeqqat restarts for a few seconds.";
  else if (route.kind === "pinned")
    text = `ZEQQAT_VERSION is set to ${route.version} in Dokploy. Remove it to follow the latest version, then update here.`;
  else if (route.kind === "not_admin") text = "A new version is ready. Ask an admin of this install to update.";
  else if (route.kind === "rate_limited")
    text = "A new version is ready, but your Dokploy is rate limiting the key Zeqqat uses. Replace it on the instance page with a key that has no rate limit, or redeploy Zeqqat in Dokploy.";
  else text = "A new version is ready. Connect the Dokploy this runs on to update from here, or redeploy Zeqqat in Dokploy.";
  return <p className={`zq-modal-note${phase === "failed" ? " is-error" : ""}`}>{text}</p>;
}

// One release. Tags, in this order: Latest (the newest release), New
// (newer than yours but not the newest), Your version. Latest comes first
// so it sits in the same spot on the public page, which has no Your version.
export function ReleaseRow({
  r,
  current,
  latest,
  showTime,
}: {
  r: Release;
  current?: string | null;
  latest?: string;
  showTime?: boolean; // the Releases pages, not the modal
}) {
  const isLatest = r.version === latest;
  const isCurrent = !!current && r.version === current;
  const isNew = !!current && !isCurrent && !isLatest && newer(r.version, current);
  return (
    <section className="zq-rel">
      <div className="zq-rel-h">
        <a
          className="zq-rel-v"
          href={`https://github.com/zeqqat/zeqqat/releases/tag/v${r.version}`}
          target="_blank"
          rel="noopener noreferrer"
          title="View this release on GitHub"
        >
          v{r.version}
        </a>
        {isLatest && <span className="zq-rel-tag is-latest">Latest</span>}
        {isNew && <span className="zq-rel-tag is-new">New</span>}
        {isCurrent && <span className="zq-rel-tag">Your version</span>}
        <span className="zq-rel-d">{showTime && r.at ? <ReleaseTime at={r.at} fallback={fmtDate(r.date)} /> : fmtDate(r.date)}</span>
      </div>
      <ul>
        {r.changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}

const noop = () => () => {};

// Date and time of a release in the reader's own time zone. The server
// doesn't know that zone, so it renders the date alone and the time
// appears once the page is live in the browser.
function ReleaseTime({ at, fallback }: { at: string; fallback: string }) {
  const live = useSyncExternalStore(noop, () => true, () => false);
  const t = new Date(at);
  if (!live || Number.isNaN(t.getTime())) return <>{fallback}</>;
  return (
    <time dateTime={at}>
      {t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })},{" "}
      {t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}

function newer(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

function fmtDate(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
