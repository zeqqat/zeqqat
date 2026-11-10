"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Release, ReleaseStatus } from "../lib/changelog";
import { getReleaseStatus, getUpdateRoute, startUpdate, type UpdateRoute } from "../lib/actions/updates";

// The version at the bottom of the side menu, with one pill: Latest, or
// Update available. The pill opens the What's new modal: every version's
// changes, newest first, and on a self-hosted install an Update now button
// that has Dokploy deploy Zeqqat again (lib/self-update.ts). The newer
// version's number is only shown inside the modal.

type Phase = "idle" | "starting" | "restarting" | "failed";

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
      {open && <WhatsNew version={version} edition={edition} status={status} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsNew({
  version,
  edition,
  status,
  onClose,
}: {
  version: string;
  edition: "cloud" | "self-hosted";
  status: ReleaseStatus | null;
  onClose: () => void;
}) {
  const [route, setRoute] = useState<UpdateRoute | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const update = !!status?.updateAvailable;
  const restarting = phase === "starting" || phase === "restarting";

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

  useEffect(() => {
    if (!update || edition === "cloud") return;
    let live = true;
    getUpdateRoute()
      .then((r) => live && setRoute(r))
      .catch(() => live && setRoute({ kind: "no_dokploy" }));
    return () => {
      live = false;
    };
  }, [update, edition]);

  async function doUpdate() {
    if (!status) return;
    setError(null);
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
    // which version answers until it's the new one, then reload.
    const tick = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const body = (await r.json()) as { version?: string };
        if (body.version === target) {
          window.location.reload();
          return;
        }
      } catch {
        // Down while it restarts: expected.
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

  const releases = status?.releases ?? [];

  return (
    <div className="zq-modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="zq-modal" role="dialog" aria-modal="true" aria-labelledby="zq-whatsnew-h">
        <div className="zq-modal-head">
          <h2 id="zq-whatsnew-h">What&apos;s new</h2>
          <button ref={closeRef} type="button" className="zq-modal-x" onClick={close} aria-label="Close" disabled={restarting}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {update && edition === "self-hosted" && (
          <div className="zq-modal-update">
            <UpdateLine route={route} phase={phase} error={error} />
            {route?.kind === "ready" && phase !== "restarting" && (
              <button type="button" className="zq-modal-btn" onClick={doUpdate} disabled={phase === "starting"}>
                {phase === "starting" ? "Starting…" : phase === "failed" ? "Try again" : "Update now"}
              </button>
            )}
          </div>
        )}

        <div className="zq-modal-list">
          {!status && <p className="zq-modal-note">Loading…</p>}
          {releases.map((r) => (
            <ReleaseRow key={r.version} r={r} current={version} latest={releases[0]?.version} />
          ))}
        </div>

        <div className="zq-modal-foot">
          <Link href="/app/releases" onClick={onClose}>
            See all changes →
          </Link>
        </div>
      </div>
    </div>
  );
}

function UpdateLine({ route, phase, error }: { route: UpdateRoute | null; phase: Phase; error: string | null }) {
  let text: string;
  if (phase === "restarting") text = "Dokploy is deploying the new version. This page reloads when Zeqqat is back.";
  else if (phase === "failed" && error) text = error;
  else if (!route) text = "A new version is ready.";
  else if (route.kind === "ready") text = "A new version is ready. Zeqqat restarts for a few seconds.";
  else if (route.kind === "pinned")
    text = `ZEQQAT_VERSION is set to ${route.version} in Dokploy. Remove it to follow the latest version, then update here.`;
  else if (route.kind === "not_admin") text = "A new version is ready. Ask an admin of this install to update.";
  else text = "A new version is ready. Connect the Dokploy this runs on to update from here, or redeploy Zeqqat in Dokploy.";
  return <p className={`zq-modal-note${phase === "failed" ? " is-error" : ""}`}>{text}</p>;
}

// One release. Tags, in this order: Latest (the newest release), New
// (newer than yours but not the newest), Your version. Latest comes first
// so it sits in the same spot on the public page, which has no Your version.
export function ReleaseRow({ r, current, latest }: { r: Release; current?: string | null; latest?: string }) {
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
        <span className="zq-rel-d">{fmtDate(r.date)}</span>
      </div>
      <ul>
        {r.changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
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
