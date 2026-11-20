"use client";

import { useEffect, useRef, useState } from "react";

const INFO = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </svg>
);

// "What is this? \u24d8" above a list's cards; a click drops the explanation
// down in the same bubble every \u24d8 uses. `open` starts it open, for a link
// from another page's explanation (?what=1).
export function WhatIsThis({ children, open: startOpen = false }: { children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="zq-in-what" ref={ref}>
      <span className="zq-info-inline">
        <button type="button" className="zq-in-whatb" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          What is this?
          <span className="zq-info" aria-hidden="true">
            {INFO}
          </span>
        </button>
        {open && (
          <span className="zq-bubble zq-in-wb" role="note">
            {children}
          </span>
        )}
      </span>
    </div>
  );
}

// A word in an explanation that opens the explanation of that word on its own
// page. Hovering or focusing it lights the word up, so the ⓘ plainly belongs to it.
export function WhatLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="zq-in-wlink" href={href}>
      <span className="w">{children}</span>
      <span className="zq-info" aria-hidden="true">
        {INFO}
      </span>
    </a>
  );
}
