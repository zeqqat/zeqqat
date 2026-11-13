"use client";

import { useState } from "react";
import { enableHttps } from "../lib/actions/https";

// Shown on a self-hosted install reached over plain http. Sign-in works
// either way, but agents like Claude only connect to https addresses.
// "fix": an admin whose Dokploy runs this install can turn it on here.
export type HttpsBannerMode = "fix" | "connect" | "ask" | "no-cert";

type State = { step: "idle" } | { step: "working" } | { step: "waiting" } | { step: "slow"; url: string } | { step: "error"; text: string };

const WAIT_MS = 3 * 60 * 1000;

// Resolves once the https address answers with a valid certificate. An
// opaque no-cors response is enough: a bad or missing certificate throws.
async function waitForHttps(url: string): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      await fetch(`${url}/api/health`, { mode: "no-cors", cache: "no-store" });
      return true;
    } catch {
      // Not yet: still deploying, or the certificate isn't issued.
    }
  }
  return false;
}

export function HttpsBanner({ mode }: { mode: HttpsBannerMode }) {
  const [state, setState] = useState<State>({ step: "idle" });

  async function turnOn() {
    setState({ step: "working" });
    const res = await enableHttps();
    if (!res.ok) {
      setState({ step: "error", text: res.error });
      return;
    }
    setState({ step: "waiting" });
    if (await waitForHttps(res.url)) {
      // http to https is another origin, which Next's router can't move to.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${res.url}${window.location.pathname}${window.location.search}`;
    } else {
      setState({ step: "slow", url: res.url });
    }
  }

  let text: React.ReactNode;
  if (state.step === "waiting" || state.step === "working") {
    text = "Turning on HTTPS. Zeqqat restarts and gets its certificate, which takes about a minute.";
  } else if (state.step === "slow") {
    text = (
      <>
        HTTPS isn&rsquo;t answering yet. Let&rsquo;s Encrypt needs ports 80 and 443 open on your server. Try{" "}
        <a href={state.url}>{state.url.replace(/^https:\/\//, "")}</a> again in a minute.
      </>
    );
  } else if (state.step === "error") {
    text = state.text;
  } else if (mode === "no-cert") {
    text = "This Zeqqat isn't on HTTPS, and this address can't get a certificate. Agents like Claude need HTTPS: add your own domain in Dokploy with HTTPS on.";
  } else if (mode === "ask") {
    text = "This Zeqqat isn't on HTTPS yet, and agents like Claude need it. Ask your admin to turn it on.";
  } else if (mode === "connect") {
    text = "This Zeqqat isn't on HTTPS yet, and agents like Claude need it. Once your Dokploy is connected, you can turn it on here.";
  } else {
    text = "This Zeqqat isn't on HTTPS yet, and agents like Claude need it.";
  }

  const showButton = mode === "fix" && (state.step === "idle" || state.step === "error");
  const busy = state.step === "working" || state.step === "waiting";

  return (
    <div className={`zq-https${state.step === "error" ? " is-error" : ""}`} role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 7.5-2" />
      </svg>
      <p>{text}</p>
      {showButton && (
        <button type="button" className="zq-btn zq-btn-primary" onClick={turnOn}>
          Turn on HTTPS
        </button>
      )}
      {busy && <span className="zq-https-spin" aria-hidden="true" />}
    </div>
  );
}
