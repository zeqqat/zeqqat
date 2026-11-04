"use client";

import { useEffect, useState } from "react";

type Item = { label: string; count?: number; href: string };

// The ⋯ menu on a request card: where the request went, and what you can
// do with it.
export function RequestMenu({
  views,
  review,
  shareUrl,
  exportHref,
  personHref,
  personName,
}: {
  views: Item[];
  review: Item | null;
  shareUrl: string | null;
  exportHref: string | null;
  personHref: string | null;
  personName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="zq-rc-menu">
      <button
        type="button"
        className="zq-kebab"
        aria-label="More for this request"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
          setCopied(false);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <>
          <button type="button" className="zq-menu-scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <span className="zq-menu-pop" role="menu">
            {views.length > 0 && (
              <span className="zq-menu-sec" style={{ display: "block" }}>
                {views.map((v) => (
                  <a key={v.label} href={v.href} className="zq-menu-item" role="menuitem">
                    <span>{v.label}</span>
                    {v.count != null && <span className="n">{v.count} &rsaquo;</span>}
                  </a>
                ))}
              </span>
            )}
            <span className="zq-menu-sec" style={{ display: "block" }}>
              {review && (
                <a href={review.href} className="zq-menu-item is-warn" role="menuitem">
                  {review.label}
                </a>
              )}
              {shareUrl && (
                <button
                  type="button"
                  className="zq-menu-item"
                  role="menuitem"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                    } catch {
                      window.prompt("Copy this link", shareUrl);
                    }
                  }}
                >
                  {copied ? "Link copied" : "Copy link to this request"}
                </button>
              )}
              {exportHref && (
                <a href={exportHref} className="zq-menu-item" role="menuitem" download>
                  Export as JSON
                </a>
              )}
              {personHref && personName && (
                <a href={personHref} className="zq-menu-item" role="menuitem">
                  Show only {personName}&rsquo;s requests
                </a>
              )}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
