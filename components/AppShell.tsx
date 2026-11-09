"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import { startOverAction, switchToPastUserAction } from "../lib/actions/dev-tools";
import { switchWorkspaceAction } from "../lib/actions/workspace";
import { ThemeToggle } from "./ThemeToggle";

type Pane = "overview" | "connections" | "integrations" | "tools" | "policies" | "activity" | "members" | "settings";

// `also` lists other paths that belong to the same pane, so an instance
// page (/app/instances/<id>) still highlights Integrations.
const ITEMS: { pane: Pane; label: string; href: string; also?: string[] }[] = [
  { pane: "overview", label: "Overview", href: "/app" },
  { pane: "connections", label: "Connections", href: "/app/connections" },
  { pane: "integrations", label: "Integrations", href: "/app/integrations", also: ["/app/instances"] },
  { pane: "tools", label: "Tools", href: "/app/tools" },
  { pane: "policies", label: "Policies", href: "/app/policies" },
  { pane: "activity", label: "Activity", href: "/app/activity" },
  { pane: "members", label: "Members", href: "/app/team" },
  { pane: "settings", label: "Settings", href: "/app/settings" },
];

export type ShellOrg = { id: string; slug: string; name: string };
export type ShellWorkspace = { id: string; slug: string; name: string; role: "admin" | "member" | "viewer" };
// "open" / "closed" come from the person's last choice (a cookie, so the
// first paint is already right). null means they never chose: open on wide
// screens, closed on narrow ones, decided in CSS.
export type MenuState = "open" | "closed" | null;
export type ShellDevTools = { pastUsers: { id: string; name: string; username: string | null }[] } | null;

const MENU_COOKIE = "zq_menu";

// The side menu sits beside the page, not over it: opening it pushes the
// page right, and it can stay open while you work. Both directions animate
// (see components/AGENTS.md). The org and workspace switcher is at its top;
// the header keeps the brand, where you are, and the account menu.
export function AppShell({
  user,
  edition,
  version,
  siteHost,
  orgs,
  currentOrg,
  workspaces,
  currentWorkspace,
  initialMenu,
  devTools = null,
  children,
}: {
  user: { name: string; email: string; image: string | null; username: string };
  edition: "cloud" | "self-hosted";
  version: string;
  siteHost: string;
  orgs: ShellOrg[];
  currentOrg: ShellOrg;
  workspaces: ShellWorkspace[]; // the current org's workspaces this user can open
  currentWorkspace: ShellWorkspace;
  initialMenu: MenuState;
  devTools?: ShellDevTools;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState<MenuState>(initialMenu);
  const [popOpen, setPopOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const switchRef = useRef<HTMLDivElement>(null);
  const multiWs = workspaces.length > 1;

  // The menu is open right now, whatever produced that (choice or default).
  function isOpenNow() {
    if (menu) return menu === "open";
    return typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches;
  }

  function setMenuChoice(next: "open" | "closed") {
    setMenu(next);
    try {
      document.cookie = `${MENU_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the choice just won't survive a reload.
    }
  }

  // Track the effective state for aria-expanded once mounted.
  const [openNow, setOpenNow] = useState(initialMenu === "open");
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setOpenNow(menu ? menu === "open" : mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [menu]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setPopOpen(false);
      setSwitchOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (switchOpen && switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [switchOpen]);

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  const menuClass = menu === "open" ? " is-open" : menu === "closed" ? " is-closed" : "";

  return (
    <div className={`zq-shell${menuClass}`}>
      <header className="zq-appbar">
        <div className="zq-appbar-l">
          <button
            className="zq-burger"
            type="button"
            aria-label={openNow ? "Close menu" : "Open menu"}
            aria-expanded={openNow}
            aria-controls="zq-side"
            onClick={() => setMenuChoice(isOpenNow() ? "closed" : "open")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <a href="/app" className="zq-brand" aria-label="Zeqqat dashboard">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <span className="zq-name">zeqqat</span>
          </a>
          <span className="zq-crumb" aria-label="Current workspace">
            <span className="zq-crumb-sep">/</span>@{currentOrg.slug}
            {multiWs && (
              <>
                <span className="zq-crumb-sep">/</span>
                {currentWorkspace.slug}
              </>
            )}
          </span>
        </div>
        <div className="zq-appbar-r">
          <div className="zq-user">
            <button
              className="zq-avatar"
              type="button"
              aria-haspopup="menu"
              aria-expanded={popOpen}
              aria-label="Account menu"
              onClick={() => setPopOpen((v) => !v)}
            >
              {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : initial}
            </button>
            {popOpen && (
              <>
                <button className="zq-pop-scrim" type="button" aria-label="Close account menu" tabIndex={-1} onClick={() => setPopOpen(false)} />
                <div className="zq-pop" role="menu">
                  <div className="zq-pop-sec">
                    <div className="zq-pop-user" style={{ marginBottom: 0 }}>
                      <span className="zq-pop-avatar" aria-hidden="true">
                        {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : initial}
                      </span>
                      <b>{user.name || user.email}</b>
                      <span>@{user.username}</span>
                    </div>
                  </div>
                  <div className="zq-pop-sec">
                    <div className="zq-pop-row" role="menuitem">
                      <span className="zq-pop-row-l">
                        <svg className="zq-pop-ico" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
                        </svg>
                        Theme
                      </span>
                      <ThemeToggle />
                    </div>
                  </div>
                  {devTools && <DevToolsSection devTools={devTools} />}
                  <div className="zq-pop-sec">
                    <button
                      className="zq-pop-row zq-pop-out"
                      role="menuitem"
                      type="button"
                      onClick={async () => {
                        await authClient.signOut();
                        router.push("/");
                      }}
                    >
                      <span className="zq-pop-row-l">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                        </svg>
                        Log out
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="zq-frame">
        {/* Stays rendered when closed so both the open and close transitions
            can run; globals.css hides it with a delayed `visibility`.
            See components/AGENTS.md. */}
        <aside id="zq-side" className="zq-side" aria-label="Menu">
          <div className="zq-side-in">
            <div className="zq-switch" ref={switchRef}>
              <button
                type="button"
                className="zq-switch-btn"
                aria-haspopup="listbox"
                aria-expanded={switchOpen}
                onClick={() => setSwitchOpen((v) => !v)}
              >
                <span className="zq-ws-avatar" aria-hidden="true">
                  {firstLetter(multiWs ? currentWorkspace.name : currentOrg.name)}
                </span>
                <span className="zq-switch-txt">
                  <b>{multiWs ? currentWorkspace.name : currentOrg.name}</b>
                  <small>
                    @{currentOrg.slug}
                    {multiWs ? `/${currentWorkspace.slug}` : ""} · {currentWorkspace.role}
                  </small>
                </span>
                <svg className="zq-switch-chev" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
                </svg>
              </button>
              {switchOpen && (
                <div className="zq-switch-pop">
                  <div className="zq-switch-h">Organizations</div>
                  {orgs.map((o) => (
                    <form action={switchWorkspaceAction} key={o.id}>
                      <input type="hidden" name="organization_id" value={o.id} />
                      <button type="submit" className={`zq-switch-opt${o.id === currentOrg.id ? " is-current" : ""}`} disabled={o.id === currentOrg.id}>
                        <span className="zq-ws-avatar is-other" aria-hidden="true">
                          {firstLetter(o.name)}
                        </span>
                        <span className="zq-switch-txt">
                          <b>{o.name}</b>
                          <small>@{o.slug}</small>
                        </span>
                        {o.id === currentOrg.id && <Check />}
                      </button>
                    </form>
                  ))}
                  {multiWs && (
                    <>
                      <div className="zq-switch-h">Workspaces in @{currentOrg.slug}</div>
                      {workspaces.map((w) => (
                        <form action={switchWorkspaceAction} key={w.id}>
                          <input type="hidden" name="workspace_id" value={w.id} />
                          <button
                            type="submit"
                            className={`zq-switch-opt${w.id === currentWorkspace.id ? " is-current" : ""}`}
                            disabled={w.id === currentWorkspace.id}
                          >
                            <span className="zq-ws-avatar" aria-hidden="true">
                              {firstLetter(w.name)}
                            </span>
                            <span className="zq-switch-txt">
                              <b>{w.name}</b>
                              <small>
                                @{currentOrg.slug}/{w.slug} · {w.role}
                              </small>
                            </span>
                            {w.id === currentWorkspace.id && <Check />}
                          </button>
                        </form>
                      ))}
                    </>
                  )}
                  <a className="zq-switch-new" href="/app/settings#new">
                    + New workspace or org
                  </a>
                </div>
              )}
            </div>

            <nav className="zq-menu" aria-label="Dashboard">
              {ITEMS.map((item) => {
                const isActive =
                  item.pane === "overview"
                    ? pathname === "/app"
                    : [item.href, ...(item.also ?? [])].some((h) => pathname.startsWith(h));
                return (
                  <a
                    key={item.pane}
                    href={item.href}
                    className={`zq-menu-i${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="zq-panel-foot">
              <span className="zq-panel-ver">
                v{version} {edition === "cloud" ? "Beta" : `· Self-hosted · ${siteHost}`}
              </span>
            </div>
          </div>
        </aside>

        <main className="zq-main">
          <div className="zq-body">{children}</div>
        </main>
      </div>
    </div>
  );
}

// Dev installs only. Starting over keeps everything: the signed-in user is
// set aside (lib/dev-tools.ts) and the next sign-in, with the same Google
// account or email, is a brand new user. Switching back undoes that.
function DevToolsSection({ devTools }: { devTools: NonNullable<ShellDevTools> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run(key: string, action: () => Promise<{ ok: boolean }>) {
    setBusy(key);
    setFailed(false);
    const res = await action();
    if (!res.ok) {
      setBusy(null);
      setFailed(true);
      return;
    }
    await authClient.signOut();
    // A full load, so nothing from the old user is left in memory.
    window.location.assign("/signin");
  }

  return (
    <div className="zq-pop-sec zq-pop-dev">
      <div className="zq-pop-dev-h">Dev</div>
      <button
        className="zq-pop-row zq-pop-act"
        role="menuitem"
        type="button"
        disabled={busy !== null}
        onClick={() => run("new", () => startOverAction())}
      >
        <span className="zq-pop-row-l">
          <svg className="zq-pop-ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10" cy="8" r="4" />
            <path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
          </svg>
          {busy === "new" ? "Signing out…" : "Start over as a new user"}
        </span>
      </button>
      {devTools.pastUsers.length > 0 && (
        <>
          <div className="zq-pop-dev-sub">Switch back to</div>
          {devTools.pastUsers.map((p) => (
            <button
              key={p.id}
              className="zq-pop-row zq-pop-act"
              role="menuitem"
              type="button"
              disabled={busy !== null}
              onClick={() => run(p.id, () => switchToPastUserAction(p.id))}
            >
              <span className="zq-pop-row-l">
                <span className="zq-pop-avatar" aria-hidden="true">
                  {firstLetter(p.name)}
                </span>
                {busy === p.id ? "Signing out…" : p.username ? `@${p.username}` : p.name}
              </span>
            </button>
          ))}
        </>
      )}
      {failed && <p className="zq-pop-dev-err">That didn&apos;t work. Reload and try again.</p>}
    </div>
  );
}

function Check() {
  return (
    <svg className="zq-switch-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function firstLetter(name: string) {
  return (name || "W").trim().charAt(0).toUpperCase();
}
