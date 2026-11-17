"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// An ⓘ that opens a short explanation. By default it sits in a box's
// top-right corner; `inline` puts it in the flow, e.g. beside a form label.
// The bubble always stays on screen: if it would run past either edge it
// slides back in, and its arrow still points at the ⓘ.
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
  const bubbleRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.transform = "";
      el.style.removeProperty("--zq-bubble-shift");
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const gap = 12;
      let dx = 0;
      if (r.right > vw - gap) dx = vw - gap - r.right;
      if (r.left + dx < gap) dx = gap - r.left;
      if (dx) {
        el.style.transform = `translateX(${dx}px)`;
        el.style.setProperty("--zq-bubble-shift", `${-dx}px`);
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

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
        <span className="zq-bubble" id={id} role="note" ref={bubbleRef}>
          <b>{title}</b>
          {children}
        </span>
      )}
    </span>
  );
}
