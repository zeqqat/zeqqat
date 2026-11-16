"use client";

import { useEffect } from "react";
import { markSignupReported } from "../lib/actions/signup-report";

// Where a visitor first came from, so a sign-up can be counted by source
// (google.com, chatgpt.com, github.com, direct...) and by the page they
// first landed on. Kept in this tab's sessionStorage only: never a cookie,
// gone when the tab closes, and sent nowhere except with the "signup"
// event to zeqqat.com's own Umami. It is written on the first page of the
// visit, so the redirect back from Google or GitHub sign-in doesn't
// replace it.
const KEY = "zq_first_touch";

type FirstTouch = { source: string; landing: string };

type Umami = { track: (event: string, data?: Record<string, string>) => Promise<unknown> | void };

function readFirstTouch(): FirstTouch | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

function rememberFirstTouch(): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const params = new URLSearchParams(location.search);
    let source = params.get("utm_source") || params.get("ref") || "";
    if (!source && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (host !== location.hostname.replace(/^www\./, "")) source = host;
      } catch {}
    }
    const first: FirstTouch = { source: source || "direct", landing: location.pathname };
    sessionStorage.setItem(KEY, JSON.stringify(first));
  } catch {}
}

export function SignupBeacon({ report }: { report: boolean }) {
  useEffect(() => {
    rememberFirstTouch();
    if (!report) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The Umami script is deferred, so wait for it (up to ~10 seconds).
    const send = async () => {
      const umami = (window as unknown as { umami?: Umami }).umami;
      if (!umami) {
        if (++tries < 40) timer = setTimeout(send, 250);
        return;
      }
      const first = readFirstTouch() ?? { source: "unknown", landing: "unknown" };
      try {
        await umami.track("signup", first);
        await markSignupReported();
      } catch {}
    };
    void send();
    return () => clearTimeout(timer);
  }, [report]);
  return null;
}
