"use client";

import { useEffect, useState } from "react";
import type { ActivityCall } from "../../lib/activity";
import { Clock } from "./Time";

const SEARCH = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);
const BOOK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" />
    <path d="M5 16a4 4 0 0 1 4-4h10" />
  </svg>
);

// Only one line shows its tool at a time: opening one tells the others to close.
const OPEN_EVENT = "zq-lookup-open";

// A built-in call (search, describe...) as one quiet line: it shows the
// agent's path without competing with the calls that reached an app. Tap
// it to see which Zeqqat tool was called; tap another line, or anywhere
// else, and it hides again.
export function LookupLine({ call }: { call: ActivityCall }) {
  const [open, setOpen] = useState(false);
  const icon = call.lookup?.startsWith("Looked up") ? SEARCH : BOOK;

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== call.id) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [call.id]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.(`[data-lookup="${call.id}"]`)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, call.id]);

  return (
    <button
      type="button"
      data-lookup={call.id}
      className={`zq-look${call.state === "error" ? " is-error" : ""}${open ? " is-open" : ""}`}
      aria-expanded={open}
      aria-label={`${call.lookup}. Show which Zeqqat tool was called`}
      onClick={() => {
        const next = !open;
        setOpen(next);
        if (next) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: call.id }));
      }}
    >
      <span className="zq-look-q">
        {icon}
        <span>
          {open && call.lookupTool && (
            <>
              <code className="zq-look-tool">{call.lookupTool}</code>
              <span className="zq-look-dot"> · </span>
            </>
          )}
          {call.lookup}
        </span>
      </span>
      <Clock iso={call.at} />
    </button>
  );
}
