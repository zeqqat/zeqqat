"use client";

import { useEffect, useRef, useState } from "react";

// Under "via <agent>": which instances a request reached and which MCP URLs
// it came through. One shows its name; more than one shows the icon and a
// count, and a click lists them with their calls.
export type PillItem = { key: string; label: string; calls: number; href: string | null };

// Names like prod_eu: the font's underscore renders thinner than the
// letters at this size, so each one is drawn as a bar of the letters' weight.
function Name({ text }: { text: string }) {
  const parts = text.split("_");
  return (
    <span className="zq-pill-t">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="zq-us">_</span>}
          {p}
        </span>
      ))}
    </span>
  );
}

function DokployIcon() {
  return <span className="zq-mono-logo zq-mark-ic zq-mark-dokploy zq-pill-ic" aria-hidden="true" />;
}

function LinkIcon() {
  return (
    <svg className="zq-pill-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

function Pill({ kind, items }: { kind: "instance" | "url"; items: PillItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (items.length === 0) return null;
  const Icon = kind === "instance" ? DokployIcon : LinkIcon;
  const what = kind === "instance" ? "Dokploy instance" : "MCP URL";

  if (items.length === 1) {
    const it = items[0];
    const inner = (
      <>
        <Icon />
        <Name text={it.label} />
      </>
    );
    return (
      <span className="zq-pill-w">
        {it.href ? (
          <a className="zq-pill" href={it.href} title={`${what}: ${it.label}`}>
            {inner}
          </a>
        ) : (
          <span className="zq-pill is-static" title={`${what}: ${it.label}`}>
            {inner}
          </span>
        )}
      </span>
    );
  }

  const tip = `${items.length} ${what}s`;
  return (
    <span className="zq-pill-w" ref={ref}>
      <button
        type="button"
        className="zq-pill"
        title={tip}
        aria-label={tip}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon />
        <b className="zq-pill-n">{items.length}</b>
      </button>
      {open && (
        <span className="zq-pill-pop" role="menu">
          {items.map((it) => {
            const row = (
              <>
                <Icon />
                <Name text={it.label} />
                <small>{it.calls === 1 ? "1 call" : `${it.calls} calls`}</small>
              </>
            );
            return it.href ? (
              <a key={it.key} href={it.href} role="menuitem">
                {row}
              </a>
            ) : (
              <span key={it.key} role="menuitem">
                {row}
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}

export function Pills({ instances, urls }: { instances: PillItem[]; urls: PillItem[] }) {
  if (instances.length === 0 && urls.length === 0) return null;
  return (
    <div className="zq-pills">
      <Pill kind="instance" items={instances} />
      <Pill kind="url" items={urls} />
    </div>
  );
}
