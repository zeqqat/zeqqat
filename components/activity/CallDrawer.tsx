"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ToolName } from "./ToolName";

// A call on a request page: the head (chain, time, tool name, description)
// always shows; what it was called with sits in a drawer that starts closed.
// Most people only want to see what happened, so the JSON waits for a click.
// The whole head toggles it; the call's own page is a link inside.
export function CallDrawer({
  toolName,
  href,
  chain,
  clock,
  notes,
  children,
}: {
  toolName: string;
  href: string;
  chain: ReactNode;
  clock: ReactNode;
  notes: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = () => setOpen((o) => !o);
  return (
    <div className={`zq-cc is-link is-drawer${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="zq-rc-link"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? "Close" : "Open"} call: ${toolName}`}
        onClick={toggle}
      />
      {chain}
      <span className="zq-cc-end">
        {clock}
        <svg className="zq-cc-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
      <div className="zq-cc-txt">
        <ToolName name={toolName} onPlain={toggle} />
        {notes}
      </div>
      <div className="zq-cc-drawer" id={id} hidden={!open}>
        {open && (
          <>
            {children}
            <Link className="zq-cc-open" href={href}>
              Open call: request, response and details <span aria-hidden="true">→</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
