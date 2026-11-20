"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openAccountAction, switchWorkspaceAction } from "../lib/actions/workspace";
import type { ShellAccount } from "../lib/accounts";
import { useBase } from "./DashboardBase";
import { colorOf } from "../lib/avatar-color";

// The top bar's path is also the switcher (Gaita, 2026-11-19, "B3"). One
// click on @username or on the workspace opens its list. The first row is
// the thing itself ("Open ›", to its page), then the others to switch to,
// then + New. Your own account sits at the top with a "you" pill; people
// are circles, organizations are rounded squares. Every row keeps room for
// the tick so they line up however long a name is.

export function AccountAvatar({
  account,
  image = null,
  size = "md",
}: {
  account: Pick<ShellAccount, "slug" | "name" | "kind">;
  image?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const person = account.kind === "personal";
  return (
    <span
      className={`zq-acc-av is-${size}${person ? " is-person" : ""}`}
      style={image ? undefined : { background: colorOf(account.slug) }}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : (account.name || account.slug).trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function WorkspaceAvatar({ name }: { name: string }) {
  return (
    <span className="zq-acc-ws" aria-hidden="true">
      {(name || "W").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Check() {
  return (
    <span className="zq-acc-ck" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

function Down() {
  return (
    <svg className="zq-path-chev" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

type Ws = { id: string; name: string };

export function PathSwitch({
  accounts,
  current,
  myImage,
  workspaces,
  currentWorkspace,
  canCreateWorkspace,
  onNewWorkspace,
  onNewOrg,
}: {
  accounts: ShellAccount[];
  current: ShellAccount;
  myImage: string | null;
  workspaces: Ws[];
  // null on the account's own pages: there's no workspace in the path.
  currentWorkspace: Ws | null;
  canCreateWorkspace: boolean;
  onNewWorkspace: () => void;
  onNewOrg: () => void;
}) {
  const base = useBase();
  const [open, setOpen] = useState<null | "account" | "workspace">(null);
  const accRef = useRef<HTMLButtonElement>(null);
  const wsRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // The path scrolls sideways, so the list is placed on the page, under
  // its part, and kept inside the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = (open === "account" ? accRef : wsRef).current;
      const pop = popRef.current;
      if (!a || !pop) return;
      const r = a.getBoundingClientRect();
      const w = pop.offsetWidth;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + 6 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || accRef.current?.contains(t) || wsRef.current?.contains(t)) return;
      setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const toggle = (which: "account" | "workspace") => {
    setPos(null);
    setOpen((v) => (v === which ? null : which));
  };
  const imageOf = (a: ShellAccount) => (a.mine ? myImage : null);
  const me = accounts.find((a) => a.mine);
  const orgs = accounts.filter((a) => !a.mine);

  const accountRow = (a: ShellAccount) => {
    const cur = a.id === current.id;
    return (
      <form action={openAccountAction} key={a.id}>
        <input type="hidden" name="organization_id" value={a.id} />
        <button type="submit" className={`zq-acc-row${cur ? " is-cur" : ""}`} aria-current={cur ? "true" : undefined}>
          <AccountAvatar account={a} image={imageOf(a)} />
          <span className="zq-acc-n">@{a.slug}</span>
          {a.mine && <span className="zq-acc-you">you</span>}
          <span className="zq-acc-sp" />
          {cur ? <Check /> : <span className="zq-acc-ck" aria-hidden="true" />}
        </button>
      </form>
    );
  };

  return (
    <>
      <button
        ref={accRef}
        type="button"
        className={`zq-path-part${open === "account" ? " is-open" : ""}${currentWorkspace ? "" : " is-cur"}`}
        aria-haspopup="menu"
        aria-expanded={open === "account"}
        onClick={() => toggle("account")}
      >
        <AccountAvatar account={current} image={imageOf(current)} size="sm" />
        <span className="zq-path-n">@{current.slug}</span>
        <Down />
      </button>
      {currentWorkspace && (
        <>
          <span className="zq-bc-sep">/</span>
          <button
            ref={wsRef}
            type="button"
            className={`zq-path-part${open === "workspace" ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={open === "workspace"}
            onClick={() => toggle("workspace")}
          >
            <span className="zq-path-n">{currentWorkspace.name}</span>
            <Down />
          </button>
        </>
      )}

      {open && (
        <div
          ref={popRef}
          className="zq-path-pop"
          role="menu"
          style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
        >
          {open === "account" ? (
            <>
              <a className="zq-acc-open" href={base.account} role="menuitem" onClick={() => setOpen(null)}>
                <AccountAvatar account={current} image={imageOf(current)} />
                <span className="zq-acc-n">@{current.slug}</span>
                <span className="zq-acc-go">Open ›</span>
              </a>
              <div className="zq-acc-div" />
              {me && accountRow(me)}
              {orgs.length > 0 && (
                <>
                  {me && <div className="zq-acc-div" />}
                  <div className="zq-acc-h">Organizations</div>
                  {orgs.map(accountRow)}
                </>
              )}
              <div className="zq-acc-new">
                <button
                  type="button"
                  className="zq-acc-plus"
                  onClick={() => {
                    setOpen(null);
                    onNewOrg();
                  }}
                >
                  <span className="pi">+</span>New organization
                </button>
              </div>
            </>
          ) : (
            currentWorkspace && (
              <>
                <a className="zq-acc-open" href={base.ws} role="menuitem" onClick={() => setOpen(null)}>
                  <WorkspaceAvatar name={currentWorkspace.name} />
                  <span className="zq-acc-n">{currentWorkspace.name}</span>
                  <span className="zq-acc-go">Open ›</span>
                </a>
                <div className="zq-acc-div" />
                <div className="zq-acc-h">Workspaces in @{current.slug}</div>
                {workspaces.map((w) => {
                  const cur = w.id === currentWorkspace.id;
                  return (
                    <form action={switchWorkspaceAction} key={w.id}>
                      <input type="hidden" name="workspace_id" value={w.id} />
                      <button type="submit" className={`zq-acc-row${cur ? " is-cur" : ""}`} aria-current={cur ? "true" : undefined}>
                        <WorkspaceAvatar name={w.name} />
                        <span className="zq-acc-n">{w.name}</span>
                        <span className="zq-acc-sp" />
                        {cur ? <Check /> : <span className="zq-acc-ck" aria-hidden="true" />}
                      </button>
                    </form>
                  );
                })}
                {canCreateWorkspace && (
                  <div className="zq-acc-new">
                    <button
                      type="button"
                      className="zq-acc-plus"
                      onClick={() => {
                        setOpen(null);
                        onNewWorkspace();
                      }}
                    >
                      <span className="pi">+</span>New workspace
                    </button>
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
