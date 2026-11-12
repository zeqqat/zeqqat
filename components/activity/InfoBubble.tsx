"use client";

import { useEffect, useId, useRef, useState } from "react";

// An ⓘ that opens a short explanation. By default it sits in a box's
// top-right corner; `inline` puts it in the flow, e.g. beside a form label.
export function InfoBubble({
  title,
  children,
  inline = false,
}: {
  title: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

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
    <span ref={ref} className={inline ? "zq-info-inline" : undefined}>
      <button
        type="button"
        className="zq-info"
        aria-label={`What is this? ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.5v.01" strokeWidth="2.4" />
        </svg>
      </button>
      {open && (
        <span className="zq-bubble" id={id} role="note">
          <b>{title}</b>
          {children}
        </span>
      )}
    </span>
  );
}
