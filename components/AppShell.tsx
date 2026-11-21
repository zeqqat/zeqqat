"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import { startOverAction, switchToPastUserAction } from "../lib/actions/dev-tools";
import type { ShellAccount } from "../lib/accounts";
import { PROFILE_PATH } from "../lib/paths";
import { openWithoutDokploy } from "../lib/setup-gate";
import { CreateOrgForm, CreateWorkspaceForm } from "./ConnectionForms";
import { BaseContext } from "./DashboardBase";
import { DokployMark } from "./Marks";
import { PathSwitch } from "./PathSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { VersionPill } from "./VersionPill";

type Pane = "overview" | "mcp-urls" | "dokploy-instances" | "dokploy-integrations" | "policies" | "activity" | "members" | "settings";

// Paths are relative to the workspace (/<username>/<workspace>, see
// lib/paths.ts). `also` lists other paths that belong to the same pane.
// `icon` sits before the label. An instance page (.../dokploy-instances/<id>)
// highlights Dokploy Instances.
const ITEMS: { pane: Pane; label: string; href: string; also?: string[]; icon?: React.ReactNode }[] = [
  { pane: "overview", label: "Overview", href: "" },
  { pane: "mcp-urls", label: "MCP URLs", href: "/mcp-urls" },
  { pane: "dokploy-instances", label: "Dokploy Instances", href: "/dokploy-instances", icon: <DokployMark size={15} /> },
  { pane: "dokploy-integrations", label: "Dokploy integrations", href: "/dokploy-integrations", icon: <DokployMark size={15} /> },
  { pane: "policies", label: "Policies", href: "/policies" },
  { pane: "activity", label: "Activity", href: "/activity" },
  { pane: "members", label: "Members", href: "/members" },
  { pane: "settings", label: "Settings", href: "/settings" },
];

// The account level (/<username>): the account's own pages, with its own
// menu. The same for your personal account and an organization. Relative
// to the account.
const ACCOUNT_ITEMS: { label: string; href: string; icon?: React.ReactNode }[] = [
  { label: "Workspaces", href: "" },
  { label: "Dokploy integrations", href: "/dokploy-integrations", icon: <DokployMark size={15} /> },
  { label: "Policies", href: "/policies" },
  { label: "Members", href: "/members" },
  { label: "Settings", href: "/settings" },
];

// Pages outside the menu that still get a name in the top bar, relative to
// the workspace.
const OTHER_PAGES: Record<string, string> = {
  "/releases": "Releases",
  "/agents": "Agents",
  "/self-host": "Self-host",
  "/feedback": "Feedback",
};

// `rel` is under `base` (or is it).
function under(rel: string, base: string) {
  return rel === base || rel.startsWith(`${base}/`);
}

// A page deeper than the menu (one MCP URL, say) names itself at the end
// of the top bar's path with <CrumbLast text="..." />. A page several levels
// deep (one call of one request) gives the whole trail with <CrumbTrail />:
// every piece but the last is a link.
export type Crumb = { text: string; href?: string };
const CrumbContext = createContext<(crumbs: Crumb[] | null) => void>(() => {});
export function CrumbTrail({ items }: { items: Crumb[] }) {
  const set = useContext(CrumbContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    set(JSON.parse(key) as Crumb[]);
    return () => set(null);
  }, [set, key]);
  return null;
}
export function CrumbLast({ text }: { text: string }) {
  return <CrumbTrail items={[{ text }]} />;
}

export type ShellWorkspace = { id: string; slug: string; name: string; role: "admin" | "member" | "viewer" };
// "open" / "closed" come from the person's last choice (a cookie, so the
// first paint is already right). null means they never chose: open on wide
// screens, closed on narrow ones, decided in CSS.
export type MenuState = "open" | "closed" | null;
export type ShellDevTools = { pastUsers: { id: string; name: string; username: string | null }[] } | null;

const MENU_COOKIE = "zq_menu";

// On wide screens (900px and up) the side menu sits beside the page:
// opening it pushes the page right, and it can stay open while you work.
// On narrower screens it slides over the page, with a dimmed backdrop, and
// closes when you pick a page or tap outside it. Both directions animate
// either way (see components/AGENTS.md). The header keeps the brand, the
// path (which is also the account and workspace switcher, PathSwitch.tsx)
// and the account menu.
export function AppShell({
  user,
  edition,
  version,
  accounts,
  currentAccount,
  workspaces,
  currentWorkspace,
  canCreateWorkspace = false,
  initialMenu,
  devTools = null,
  needsDokploy = false,
  askAdmin = null,
  level = "workspace",
  wsBase,
  accountBase,
  children,
}: {
  user: { name: string; email: string; image: string | null; username: string };
  edition: "cloud" | "self-hosted";
  version: string;
  accounts: ShellAccount[]; // yours first, then organizations
  currentAccount: ShellAccount;
  workspaces: ShellWorkspace[]; // the current account's workspaces this user can open
  currentWorkspace: ShellWorkspace;
  // An owner of the current account: may add workspaces to it.
  canCreateWorkspace?: boolean;
  initialMenu: MenuState;
  devTools?: ShellDevTools;
  // The workspace has no Dokploy yet and this person is the one to connect
  // it: every page but the overview and Releases asks for that first.
  needsDokploy?: boolean;
  // Set when this person can't connect Dokploy themselves: the admin to ask.
  askAdmin?: { name: string; username: string | null } | null;
  // Which menu shows (components/AppFrame.tsx).
  level?: "workspace" | "account" | "profile";
  wsBase: string; // /<username>/<workspace>
  accountBase: string; // /<username>
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState<MenuState>(initialMenu);
  const [popOpen, setPopOpen] = useState(false);
  const [newModal, setNewModal] = useState<null | "workspace" | "org">(null);
  const atAccount = level === "account";
  // The path inside the workspace ("" for its overview), or null when the
  // page isn't one of the workspace's.
  const rel = level === "workspace" && (pathname === wsBase || pathname.startsWith(`${wsBase}/`)) ? pathname.slice(wsBase.length) : null;
  const accRel = atAccount ? (pathname === accountBase ? "" : pathname.slice(accountBase.length)) : null;
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  // Narrow screens: the menu is a drawer over the page. Never remembered,
  // so a phone always opens on the page itself.
  const [drawer, setDrawer] = useState(false);
  const bcRef = useRef<HTMLElement>(null);
  const [gateOpen, setGateOpen] = useState(false);
  // A held-back page opened by its address (a bookmark, a typed URL): show
  // nothing of it, go to the connect screen and say why.
  const held = needsDokploy && rel !== null && !openWithoutDokploy(rel);
  useEffect(() => {
    if (!held) return;
    setGateOpen(true);
    router.replace(wsBase);
  }, [held, router, wsBase]);

  // Menu links to held-back pages don't navigate; they open the modal.
  // `href` is relative to the workspace.
  function holdBack(e: React.MouseEvent, href: string) {
    if (!needsDokploy || openWithoutDokploy(href.split(/[?#]/)[0])) return;
    e.preventDefault();
    setGateOpen(true);
  }

  // Close the modal and point at the form: the heading shakes once and the
  // first empty field takes focus.
  function goConnect() {
    setGateOpen(false);
    if (pathname !== wsBase) {
      router.push(wsBase);
      return;
    }
    const h = document.getElementById("zq-connect-dokploy");
    if (h) {
      h.classList.remove("is-shaking");
      void h.offsetWidth; // restart the animation if it already ran
      h.classList.add("is-shaking");
    }
    document.querySelector<HTMLInputElement>("#base_url")?.focus();
  }

  // The menu is open right now, whatever produced that (choice or default).
  function isWide() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches;
  }

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
    const sync = () => {
      if (mq.matches) setDrawer(false);
      setOpenNow(mq.matches ? (menu ? menu === "open" : true) : drawer);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [menu, drawer]);

  // A new page closes the drawer.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  // The path never cuts a name short: it scrolls sideways at every width
  // and starts at its right end, so the page you're on shows first. Each
  // edge fades while there's more that way. Touch scrolls it natively; a
  // mouse can drag it (a press that moves more than a few pixels is a drag
  // and doesn't click) or turn the wheel over it.
  useEffect(() => {
    const el = bcRef.current;
    if (!el) return;
    const fade = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle("can-scroll", max > 2);
      el.classList.toggle("has-more", el.scrollLeft > 2);
      el.classList.toggle("has-more-r", el.scrollLeft < max - 2);
    };
    const toEnd = () => {
      el.scrollLeft = el.scrollWidth;
      fade();
    };
    toEnd();

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        el.classList.add("is-dragging");
      }
      if (moved) el.scrollLeft = startLeft - dx;
    };
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.classList.remove("is-dragging");
      if (moved) {
        el.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth - el.clientWidth <= 2 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    const noDrag = (e: DragEvent) => e.preventDefault();

    el.addEventListener("scroll", fade, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dragstart", noDrag);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", toEnd);
    return () => {
      el.removeEventListener("scroll", fade);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dragstart", noDrag);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", toEnd);
    };
  }, [pathname, crumbs]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setPopOpen(false);
      setGateOpen(false);
      setNewModal(null);
      setDrawer(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  const menuClass = (menu === "open" ? " is-open" : menu === "closed" ? " is-closed" : "") + (drawer ? " is-drawer" : "");

  // Where you are, for the top bar: the menu page this path belongs to.
  const menuPage =
    rel === null
      ? undefined
      : ITEMS.find((item) => (item.href === "" ? rel === "" : [item.href, ...(item.also ?? [])].some((h) => under(rel, h))));
  const otherHref = rel === null ? undefined : Object.keys(OTHER_PAGES).find((h) => under(rel, h));
  const accountPage =
    accRel === null ? undefined : ACCOUNT_ITEMS.find((i) => (i.href === "" ? accRel === "" : under(accRel, i.href)));
  const page = atAccount
    ? accountPage
      ? { href: accountBase + accountPage.href, label: accountPage.label }
      : null
    : level === "profile"
      ? { href: PROFILE_PATH, label: "Account" }
      : menuPage
        ? { href: wsBase + menuPage.href, label: menuPage.label }
        : otherHref
          ? { href: wsBase + otherHref, label: OTHER_PAGES[otherHref] }
          : null;

  return (
    <BaseContext.Provider value={{ ws: wsBase, account: accountBase }}>
    <CrumbContext.Provider value={setCrumbs}>
    <div className={`zq-shell${menuClass}`}>
      <header className="zq-appbar">
        <div className="zq-appbar-l">
          <button
            className="zq-burger"
            type="button"
            aria-label={openNow ? "Close menu" : "Open menu"}
            aria-expanded={openNow}
            aria-controls="zq-side"
            onClick={() => (isWide() ? setMenuChoice(isOpenNow() ? "closed" : "open") : setDrawer((v) => !v))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <a href={wsBase} className="zq-brand" aria-label="Zeqqat dashboard">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <span className="zq-name">zeqqat</span>
          </a>
          <nav className="zq-bc" aria-label="You are here" ref={bcRef}>
            <PathSwitch
              accounts={accounts}
              current={currentAccount}
              myImage={user.image}
              workspaces={workspaces}
              currentWorkspace={atAccount ? null : currentWorkspace}
              canCreateWorkspace={canCreateWorkspace}
              onNewWorkspace={() => setNewModal("workspace")}
              onNewOrg={() => setNewModal("org")}
            />
            {page && (
              <>
                <span className="zq-bc-sep">/</span>
                <a href={page.href} className={crumbs ? undefined : "is-cur"}>
                  {page.label}
                </a>
              </>
            )}
            {page &&
              crumbs?.map((c, i) => (
                <Fragment key={i}>
                  <span className="zq-bc-sep">/</span>
                  {i < crumbs.length - 1 && c.href ? (
                    <a href={c.href} className="zq-bc-mid">
                      {c.text}
                    </a>
                  ) : (
                    <span className={i === crumbs.length - 1 ? "zq-bc-last is-cur" : "zq-bc-mid"}>{c.text}</span>
                  )}
                </Fragment>
              ))}
          </nav>
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
                    <a className="zq-pop-user" href={PROFILE_PATH} role="menuitem" title="Edit your profile" onClick={() => setPopOpen(false)}>
                      <span className="zq-pop-avatar" aria-hidden="true">
                        {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : initial}
                      </span>
                      {/* One line: the username gives way first, then the name. */}
                      <span className="zq-pop-id">
                        <b>{user.name || user.username}</b>
                        <span>@{user.username}</span>
                      </span>
                    </a>
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
            <div className="zq-side-top" aria-hidden="true" />
            {atAccount ? (
              <nav className="zq-menu" aria-label={`@${currentAccount.slug}`}>
                {ACCOUNT_ITEMS.map((item) => {
                  const isActive = accountPage?.href === item.href;
                  return (
                    <a
                      key={item.href}
                      href={accountBase + item.href}
                      className={`zq-menu-i${isActive ? " is-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setDrawer(false)}
                    >
                      {item.icon}
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            ) : (
            <nav className="zq-menu" aria-label="Dashboard">
              {ITEMS.map((item) => {
                const isActive = menuPage?.pane === item.pane;
                const locked = needsDokploy && !openWithoutDokploy(item.href);
                return (
                  <a
                    key={item.pane}
                    href={wsBase + item.href}
                    className={`zq-menu-i${isActive ? " is-active" : ""}${locked ? " is-locked" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    aria-haspopup={locked ? "dialog" : undefined}
                    onClick={(e) => {
                      holdBack(e, item.href);
                      setDrawer(false);
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                );
              })}
            </nav>
            )}
            <div className="zq-panel-foot">
              <VersionPill version={version} edition={edition} />
            </div>
            <div className="zq-side-pattern" aria-hidden="true" />
          </div>
        </aside>

        {/* Narrow screens only (globals.css): tapping outside the drawer closes it. */}
        <button className="zq-side-scrim" type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setDrawer(false)} />

        <main className="zq-main">
          <div className="zq-body">{held ? null : children}</div>
        </main>
      </div>

      {newModal && (
        <div className="zq-modal-back" onClick={() => setNewModal(null)}>
          <div className="zq-modal" role="dialog" aria-modal="true" aria-labelledby="zq-new-t" onClick={(e) => e.stopPropagation()}>
            <div className="zq-modal-head">
              <h2 id="zq-new-t">{newModal === "workspace" ? `New workspace in @${currentAccount.slug}` : "New organization"}</h2>
              <button type="button" className="zq-modal-x" aria-label="Close" onClick={() => setNewModal(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="zq-new-body">{newModal === "workspace" ? <CreateWorkspaceForm /> : <CreateOrgForm />}</div>
          </div>
        </div>
      )}

      {gateOpen && (
        <div className="zq-modal-back" onClick={() => setGateOpen(false)}>
          <div
            className="zq-modal zq-gate"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zq-gate-t"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zq-modal-head">
              <h2 id="zq-gate-t">
                {askAdmin ? (
                  <>
                    <DokployMark size={16} /> Dokploy isn&rsquo;t connected yet
                  </>
                ) : (
                  <>
                    Connect your <DokployMark size={16} /> Dokploy first
                  </>
                )}
              </h2>
              <button type="button" className="zq-modal-x" aria-label="Close" onClick={() => setGateOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <p className="zq-modal-note zq-gate-note">
              {askAdmin && (
                <>
                  Ask{" "}
                  {askAdmin.name || askAdmin.username ? (
                    <b className="zq-gate-who">
                      {askAdmin.name}
                      {askAdmin.username ? ` @${askAdmin.username}` : ""}
                    </b>
                  ) : (
                    "an admin"
                  )}{" "}
                  to connect an instance.{" "}
                </>
              )}
              The rest of Zeqqat opens once it&rsquo;s connected.
            </p>
            <div className="zq-gate-foot">
              {askAdmin ? (
                <button type="button" className="zq-modal-btn" autoFocus onClick={() => setGateOpen(false)}>
                  OK
                </button>
              ) : (
                <button type="button" className="zq-modal-btn" autoFocus onClick={goConnect}>
                  Connect Dokploy
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </CrumbContext.Provider>
    </BaseContext.Provider>
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

function firstLetter(name: string) {
  return (name || "W").trim().charAt(0).toUpperCase();
}
