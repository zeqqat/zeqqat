"use client";

import "./members.css";
import { useEffect, useRef, useState } from "react";
import { removeFromAccountAction, revokeInviteAction, setOwnerAction, setWorkspaceRoleAction } from "../lib/actions/members";
import type { AccountPerson, Agent, MemberWs, PendingInvite, Person, PersonUrl, WsPerson } from "../lib/members";
import type { WsRole } from "../lib/workspace";
import { InviteForm } from "./InviteForm";
import { Avatar } from "./InstancePage";
import { Icon, Spark } from "./McpUrls";
import { WorkspaceAvatar } from "./PathSwitch";

// The Members pages (account and workspace) and one person's page on each.
// Lists are for recognizing and opening a person; roles, owners and removal
// live on the person's page (UI principles 16, 17). A workspace member is
// always someone in the account who was given access to that workspace.

const ROLE: Record<WsRole, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };
const AGENT_LOGO: Record<string, string | null> = {
  claude: "/logos/claude.svg",
  cursor: "/logos/cursor.svg",
  chatgpt: "/logos/chatgpt.svg",
  other: null,
};

export const MEMBER_ERRORS: Record<string, string> = {
  last_owner: "An organization needs at least one owner. Make someone else an owner first.",
  self: "You can't remove yourself.",
  creator: "The person who created this organization stays an owner and can't be removed.",
  personal: "A personal account has one owner.",
  owner_role: "Owners are admins of every workspace. Turn off Owner first to give them a role.",
  owner_only: "Only an owner can do that.",
  admin_only: "Only an admin of that workspace can do that.",
};

export function ErrorNote({ error }: { error?: string }) {
  const text = error ? MEMBER_ERRORS[error] : undefined;
  if (!text) return null;
  return (
    <div className="zq-warn-box zq-mb-err" role="alert">
      <span className="ic" aria-hidden="true">
        !
      </span>
      <span>{text}</span>
    </div>
  );
}

// The same colour for a person as on every other people list (InstancePage's Avatar).
function personAvatar(p: Person, size: "md" | "lg" = "lg") {
  return <Avatar p={{ id: p.userId, name: p.name || p.username || "?", image: p.image }} className={`zq-mu-av zq-mb-av is-${size}`} />;
}

function You() {
  return <i className="zq-mb-you">you</i>;
}

function AgentPill({ a }: { a: Agent }) {
  const logo = AGENT_LOGO[a.brand] ?? null;
  return (
    <span className={`zq-mu-agent is-${a.brand}`} title={a.label}>
      {logo && <span className="zq-mono-logo" aria-hidden="true" style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }} />}
      <span className="zq-mb-agn">{a.label}</span>
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="zq-modal-back" onClick={onClose}>
      <div className="zq-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="zq-modal-head">
          <h2>{title}</h2>
          <button type="button" className="zq-modal-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="zq-new-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- account ----------

function AccountRight({ p }: { p: AccountPerson }) {
  if (p.owner) return <span className="zq-mb-own">Owner</span>;
  if (p.workspaces.length === 0) return <span className="zq-mb-none">No workspace</span>;
  return (
    <>
      <span className="zq-mb-wss">
        {p.workspaces.map((w) => (
          <span key={w.id}>{w.name}</span>
        ))}
      </span>
      <span className="zq-mb-wsn" title={`${p.workspaces.length} workspace${p.workspaces.length === 1 ? "" : "s"}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
        <b>{p.workspaces.length}</b>
      </span>
    </>
  );
}

function AccountRowBody({ p, me, head }: { p: AccountPerson; me: string; head?: boolean }) {
  return (
    <>
      {personAvatar(p)}
      <span className="who">
        <b>
          {p.name || (p.username ? `@${p.username}` : "")}
          {p.userId === me && <You />}
        </b>
        {p.username && <small>@{p.username}</small>}
      </span>
      {(!head || p.owner) && (
        <span className="zq-mb-r">
          <AccountRight p={p} />
          {!head && (
            <span className="zq-in-go" aria-hidden="true">
              ›
            </span>
          )}
        </span>
      )}
    </>
  );
}

export function AccountMemberList({ people, me, base }: { people: AccountPerson[]; me: string; base: string }) {
  return (
    <div className="zq-acc-people">
      {people.map((p) => (
        <a className="zq-acc-person zq-mb-row" key={p.userId} href={`${base}/members/${p.username ?? p.userId}`}>
          <AccountRowBody p={p} me={me} />
        </a>
      ))}
    </div>
  );
}

export function InvitedList({ invites, showWs, revocable, back }: { invites: PendingInvite[]; showWs: boolean; revocable: boolean; back: string }) {
  if (invites.length === 0) return null;
  return (
    <>
      <p className="zq-mb-lbl">Invited</p>
      <div className="zq-acc-people">
        {invites.map((i) => (
          <div className="zq-acc-person zq-mb-row" key={i.id}>
            <span className="zq-acc-av is-lg is-person zq-mb-inv" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
            </span>
            <span className="who">
              <b>{i.email}</b>
              <small>
                {i.owner ? "Owner" : ROLE[i.role]}
                {showWs && !i.owner && i.wsName ? ` in ${i.wsName}` : ""} · expires{" "}
                {i.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </small>
            </span>
            {revocable && (
              <span className="zq-mb-r">
                <form action={revokeInviteAction}>
                  <input type="hidden" name="invite_id" value={i.id} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="zq-action zq-action-sm">
                    Revoke
                  </button>
                </form>
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// A role picker that saves as soon as it changes. `remove` adds a last
// option that takes the person out of the workspace.
function RoleForm({
  workspaceId,
  userId,
  value,
  back,
  remove,
  label,
}: {
  workspaceId: string;
  userId: string;
  value: WsRole;
  back: string;
  remove?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={setWorkspaceRoleAction} ref={ref} className="zq-mb-roleform">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="back" value={back} />
      <select key={value} className="zq-select zq-mb-sel" name="role" defaultValue={value} aria-label={label} onChange={() => ref.current?.requestSubmit()}>
        {(["admin", "member", "viewer"] as WsRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE[r]}
          </option>
        ))}
        {remove && (
          <>
            <option disabled>───</option>
            <option value="remove">Remove</option>
          </>
        )}
      </select>
    </form>
  );
}

function AddToWorkspace({ userId, options, back }: { userId: string; options: { id: string; name: string }[]; back: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zq-mu-addrow zq-mb-addrow" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span>Add to a workspace
      </button>
      {open && (
        <Modal title="Add to a workspace" onClose={() => setOpen(false)}>
          <div className="zq-acc-people zq-mb-m">
            {options.map((w) => (
              <form action={setWorkspaceRoleAction} className="zq-acc-person zq-mb-row" key={w.id}>
                <input type="hidden" name="workspace_id" value={w.id} />
                <input type="hidden" name="user_id" value={userId} />
                <input type="hidden" name="back" value={back} />
                <WorkspaceAvatar name={w.name} />
                <span className="who">
                  <b>{w.name}</b>
                </span>
                <span className="zq-mb-r">
                  <select className="zq-select zq-mb-sel" name="role" defaultValue="member" aria-label={`Role in ${w.name}`}>
                    {(["admin", "member", "viewer"] as WsRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE[r]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="zq-action zq-action-sm zq-action-primary">
                    Add
                  </button>
                </span>
              </form>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function OwnerToggle({ userId, on, locked, back }: { userId: string; on: boolean; locked: string | null; back: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={setOwnerAction} ref={ref}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="owner" value={on ? "off" : "on"} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className="zq-toggle"
        aria-pressed={on}
        aria-label="Owner"
        disabled={!!locked}
        title={locked ?? undefined}
      />
    </form>
  );
}

export type Added = { person: Person; at: string } | null;

function AddedRow({ label, added, date }: { label: string; added: Added; date: string }) {
  return (
    <div className="zq-mu-mrow">
      {added ? (
        <div className="zq-ip-added">
          <span className="zq-ip-added-l">{label}</span>
          <span className="zq-ip-addedby">
            <Avatar p={{ id: added.person.userId, name: added.person.name, image: added.person.image }} className="zq-mu-av zq-ip-added-av" />
            <span className="zq-ip-addedby-t">
              <span className="zq-mu-pn">
                <b>{added.person.name}</b> {added.person.username && <span>@{added.person.username}</span>}
              </span>
              <span className="zq-ip-added-d">{fmtDate(added.at)}</span>
            </span>
          </span>
        </div>
      ) : (
        <div className="zq-mu-mrow-h">
          <span className="zq-mu-mrow-t">
            <b>{label}</b>
            <small>{fmtDate(date)}</small>
          </span>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Tabs({ tabs, tab }: { tabs: [string, string][]; tab: string }) {
  return (
    <nav className="zq-mu-tabs zq-in-tabs" aria-label="Member">
      {tabs.map(([t, label]) => (
        <a key={t} href={`?tab=${t}`} className={`zq-mu-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}

// One person in the account: the same row as the list, then Workspaces and Manage.
export function AccountPersonPage({
  p,
  me,
  tab,
  base,
  back,
  accountSlug,
  personal,
  canManage,
  adminOf,
  allWorkspaces,
  added,
}: {
  p: AccountPerson;
  me: string;
  tab: "workspaces" | "manage";
  base: string;
  back: string;
  accountSlug: string;
  personal: boolean;
  canManage: boolean; // an owner of the account
  adminOf: string[]; // workspace ids the viewer is an admin of
  allWorkspaces: { id: string; slug: string; name: string }[];
  added: Added;
}) {
  const notIn = allWorkspaces.filter((w) => !p.workspaces.some((x) => x.id === w.id) && adminOf.includes(w.id));
  const otherWs = p.workspaces.map((w) => w.name);
  return (
    <div className="zq-in-card">
      <div className="zq-acc-person zq-mb-row is-head">
        <AccountRowBody p={p} me={me} head />
      </div>
      <Tabs
        tabs={[
          ["workspaces", "Workspaces"],
          ["manage", "Manage"],
        ]}
        tab={tab}
      />
      {tab === "workspaces" && (
        <div className="zq-mb-list">
          {!p.owner && notIn.length > 0 && <AddToWorkspace userId={p.userId} options={notIn} back={back} />}
          {p.workspaces.length === 0 && <div className="zq-mb-empty">Not in any workspace yet.</div>}
          {p.workspaces.map((w: MemberWs) => (
            <div className="zq-mb-wsrow" key={w.id}>
              <WorkspaceAvatar name={w.name} />
              <a className="zq-mb-wst" href={`${base}/${w.slug}/members/${p.username ?? p.userId}`}>
                {w.name}
              </a>
              <span className="zq-mb-sp" />
              {w.role === "owner" ? (
                <span className="zq-mb-fixed">Admin, as owner</span>
              ) : adminOf.includes(w.id) ? (
                <RoleForm workspaceId={w.id} userId={p.userId} value={w.role} back={back} remove={p.userId !== me} label={`Role in ${w.name}`} />
              ) : (
                <span className="zq-mb-fixed">{ROLE[w.role]}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === "manage" && (
        <div className="zq-mb-list">
          <AddedRow label={p.creator ? `Created @${accountSlug}` : added ? "Added by" : "Joined"} added={p.creator ? null : added} date={p.since.toISOString()} />
          {!personal && (
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>Owner</b>
                  <small>{p.owner ? "Admin in every workspace" : "No"}</small>
                </span>
                {canManage && (
                  <OwnerToggle userId={p.userId} on={p.owner} locked={p.creator ? `The person who created @${accountSlug} stays an owner` : null} back={back} />
                )}
              </div>
            </div>
          )}
          {canManage && !p.creator && p.userId !== me && (
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>Remove from @{accountSlug}</b>
                  <small>{otherWs.length ? `Also removes them from ${otherWs.join(" and ")}` : `They lose access to @${accountSlug}`}</small>
                </span>
                <form action={removeFromAccountAction}>
                  <input type="hidden" name="user_id" value={p.userId} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="zq-action zq-action-sm zq-action-danger zq-mu-mbtn">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- workspace ----------

function WsRowBody({ p, me, head }: { p: WsPerson; me: string; head?: boolean }) {
  const calls = p.week.reduce((a, b) => a + b, 0);
  return (
    <>
      <Avatar p={{ id: p.userId, name: p.name, image: p.image }} />
      <div className="zq-mu-pt">
        <div className="zq-mu-pl">
          <span className="zq-mu-pn">
            <b>{p.name}</b> {p.username && <span>@{p.username}</span>}
            {p.userId === me && <You />}
          </span>
          <span className="zq-mb-role">{p.role === "owner" ? "Owner" : ROLE[p.role]}</span>
        </div>
        <div className="zq-mu-pl">
          <span className="zq-mb-use">
            {calls > 0 ? (
              <>
                <Spark values={p.week} label={`${calls} calls this week`} w={56} h={16} />
                <b>{calls.toLocaleString("en-US")}</b> this week
              </>
            ) : (
              <span className="zq-mb-none">No calls this week</span>
            )}
          </span>
          <span className="zq-mu-agents zq-mb-agents">
            {p.agents.map((a) => (
              <AgentPill key={`${a.brand}:${a.label}`} a={a} />
            ))}
          </span>
        </div>
      </div>
      {!head && (
        <span className="zq-in-go" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
}

export function WsMemberList({ people, me, base }: { people: WsPerson[]; me: string; base: string }) {
  return (
    <div className="zq-mu-panel zq-mb-first">
      {people.map((p) => (
        <a className="zq-mu-person zq-mb-row" key={p.userId} href={`${base}/members/${p.username ?? p.userId}`}>
          <WsRowBody p={p} me={me} />
        </a>
      ))}
    </div>
  );
}

export function RolesInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="zq-mb-ipw" ref={ref}>
      <button type="button" className="zq-mb-i" aria-label="What the roles mean" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <span className="zq-mb-pop" role="dialog">
          <b>Admin</b>
          <span>Adds instances, creates MCP URLs, manages members. Can delete through an MCP URL that allows it</span>
          <b>Member</b>
          <span>Read, create and edit through any MCP URL that allows it</span>
          <b>Viewer</b>
          <span>Read only, whatever the MCP URL allows</span>
          <b>Owner</b>
          <span>An owner of the account, admin in every workspace</span>
        </span>
      )}
    </span>
  );
}

// "+ Add member": people already in the account first, then an invite for
// someone new (who joins the account and this workspace).
export function AddMemberButton({
  workspaceId,
  workspaceName,
  accountSlug,
  others,
  canInvite,
  back,
}: {
  workspaceId: string;
  workspaceName: string;
  accountSlug: string;
  others: Person[];
  canInvite: boolean;
  back: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zq-action" onClick={() => setOpen(true)}>
        + Add member
      </button>
      {open && (
        <Modal title={`Add to ${workspaceName}`} onClose={() => setOpen(false)}>
          {others.length > 0 && (
            <>
              <p className="zq-mb-lbl is-m">In @{accountSlug}</p>
              <div className="zq-acc-people zq-mb-m">
                {others.map((p) => (
                  <form action={setWorkspaceRoleAction} className="zq-acc-person zq-mb-row" key={p.userId}>
                    <input type="hidden" name="workspace_id" value={workspaceId} />
                    <input type="hidden" name="user_id" value={p.userId} />
                    <input type="hidden" name="back" value={back} />
                    {personAvatar(p, "md")}
                    <span className="who">
                      <b>{p.name}</b>
                      {p.username && <small>@{p.username}</small>}
                    </span>
                    <span className="zq-mb-r">
                      <select className="zq-select zq-mb-sel" name="role" defaultValue="member" aria-label={`${p.name}'s role`}>
                        {(["admin", "member", "viewer"] as WsRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE[r]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="zq-action zq-action-sm zq-action-primary">
                        Add
                      </button>
                    </span>
                  </form>
                ))}
              </div>
            </>
          )}
          {canInvite && (
            <>
              <p className="zq-mb-lbl is-m">New to @{accountSlug}</p>
              <InviteForm workspace={workspaceName} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}


// One member of the workspace: the same row as the list, then Calls, MCP URLs, Manage.
export function WsMemberPage({
  p,
  me,
  tab,
  calls,
  urls,
  added,
  joined,
  isAdmin,
  accountSlug,
  workspaceId,
  workspaceName,
  accountHref,
  accountWorkspaces,
  activityHref,
  base,
  back,
}: {
  p: WsPerson;
  me: string;
  tab: "calls" | "urls" | "manage";
  calls: React.ReactNode; // the Activity cards, rendered on the server
  urls: PersonUrl[];
  added: Added;
  joined: string | null;
  isAdmin: boolean;
  accountSlug: string;
  workspaceId: string;
  workspaceName: string;
  accountHref: string;
  accountWorkspaces: string[];
  activityHref: string | null;
  base: string;
  back: string;
}) {
  const first = p.name.split(" ")[0];
  return (
    <div className="zq-in-card">
      <div className="zq-mu-person zq-mb-row is-head">
        <WsRowBody p={p} me={me} head />
      </div>
      <Tabs
        tabs={[
          ["calls", "Calls"],
          ["urls", "MCP URLs"],
          ["manage", "Manage"],
        ]}
        tab={tab}
      />
      {tab === "calls" && (
        <div className="zq-mb-list">
          {calls ?? <div className="zq-mb-empty">No calls from {first} in {workspaceName} yet.</div>}
          {calls && activityHref && (
            <a className="zq-mu-addrow zq-mb-more" href={activityHref}>
              All of {first}&rsquo;s calls in Activity
            </a>
          )}
        </div>
      )}
      {tab === "urls" && (
        <div className="zq-mb-list">
          {urls.length === 0 && <div className="zq-mb-empty">{first} hasn&rsquo;t connected an agent to an MCP URL in {workspaceName} yet.</div>}
          {urls.map((u) => (
            <a className="zq-mb-url" key={u.id} href={`${base}/mcp-urls/${u.id}`}>
              <span className="zq-mb-url-l">
                <span className="zq-mb-urln">
                  <Icon name="link" />
                  <code>
                    {u.name}/{u.shortId}
                  </code>
                </span>
                <span className="zq-mu-pd">connected {fmtDate(u.since.toISOString())}</span>
              </span>
              <span className="zq-mb-url-l">
                <span className="zq-mb-use">
                  {u.calls > 0 ? (
                    <>
                      <b>{u.calls.toLocaleString("en-US")}</b> {u.calls === 1 ? "call" : "calls"} this week
                    </>
                  ) : (
                    <span className="zq-mb-none">No calls this week</span>
                  )}
                </span>
                <span className="zq-mu-agents zq-mb-agents">
                  {u.agents.map((a) => (
                    <AgentPill key={`${a.brand}:${a.label}`} a={a} />
                  ))}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
      {tab === "manage" && (
        <div className="zq-mb-list">
          {p.role === "owner" ? null : <AddedRow label={added ? "Added by" : "Added"} added={added} date={joined ?? new Date().toISOString()} />}
          <div className="zq-mu-mrow">
            <div className="zq-mu-mrow-h">
              <span className="zq-mu-mrow-t">
                <b>Role</b>
                <small>{p.role === "owner" ? `Admin, as an owner of @${accountSlug}` : ROLE[p.role]}</small>
              </span>
              {p.role !== "owner" && isAdmin && p.userId !== me && (
                <RoleForm workspaceId={workspaceId} userId={p.userId} value={p.role} back={back} label="Role" />
              )}
            </div>
          </div>
          <a className="zq-mu-mrow zq-in-mrow" href={accountHref}>
            <div className="zq-mu-mrow-h">
              <span className="zq-mu-mrow-t">
                <b>In @{accountSlug}</b>
                <small>{accountWorkspaces.join(", ")}</small>
              </span>
              <span className="zq-in-go" aria-hidden="true">
                ›
              </span>
            </div>
          </a>
          {p.role !== "owner" && isAdmin && p.userId !== me && (
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>Remove from {workspaceName}</b>
                  <small>Stays in @{accountSlug}</small>
                </span>
                <form action={setWorkspaceRoleAction}>
                  <input type="hidden" name="workspace_id" value={workspaceId} />
                  <input type="hidden" name="user_id" value={p.userId} />
                  <input type="hidden" name="role" value="remove" />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="then" value={`${base}/members`} />
                  <button type="submit" className="zq-action zq-action-sm zq-action-danger zq-mu-mbtn">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
