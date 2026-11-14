"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReleaseStatus } from "../lib/changelog";
import { checkForUpdates } from "../lib/actions/updates";

// "Check for updates": asks zeqqat.com now instead of waiting for the
// ten-minute check. Self-hosted only (zeqqat.com is always the latest).
// Shown in the What's new modal and on the Releases page.

type State = "idle" | "checking" | "none" | "found" | "failed";

export function CheckUpdates({ onStatus }: { onStatus: (s: ReleaseStatus) => void }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function check() {
    setState("checking");
    // Long enough to see that something happened.
    const [s] = await Promise.all([checkForUpdates().catch(() => null), new Promise((r) => setTimeout(r, 600))]);
    if (s) onStatus(s);
    setState(!s ? "failed" : s.updateAvailable ? "found" : "none");
    timer.current = setTimeout(() => setState("idle"), 4000);
  }

  const label =
    state === "checking"
      ? "Checking for updates"
      : state === "none"
        ? "You're up to date"
        : state === "found"
          ? "Update found"
          : state === "failed"
            ? "Couldn't check"
            : "Check for updates";

  return (
    <button type="button" className="zq-check" onClick={check} disabled={state === "checking"} aria-live="polite">
      {label}
      {state === "checking" && <span className="zq-check-spin" aria-hidden="true" />}
    </button>
  );
}

// The Releases page is rendered on the server: after a check, render it again.
export function CheckUpdatesOnPage() {
  const router = useRouter();
  return <CheckUpdates onStatus={() => router.refresh()} />;
}
