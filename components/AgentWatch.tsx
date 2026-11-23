"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// "Connect your agent" notices the agent by itself: while the page is open
// and on screen it asks the server again every few seconds, and right away
// when the person comes back to the tab (they usually approve Zeqqat in
// their agent's tab, then return). Once an agent has connected the server
// renders the next page, so nothing here needs to know what that is.
// Slower after 15 minutes, nothing at all while the tab is hidden.
export function AgentWatch() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const loop = () => {
      const every = Date.now() - started > 15 * 60_000 ? 30_000 : 4_000;
      timer = setTimeout(() => {
        check();
        loop();
      }, every);
    };
    const back = () => {
      if (document.visibilityState === "visible") check();
    };
    loop();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [router]);

  return (
    <p className="zq-note zq-ob-refresh" aria-live="polite">
      <span className="zq-ob-wait">
        <span className="zq-wait-dot" aria-hidden="true" />
        Waiting for your agent
      </span>
    </p>
  );
}
