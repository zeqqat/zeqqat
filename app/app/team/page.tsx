import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { InviteForm } from "../../../components/InviteForm";
import { db } from "../../../db";
import { invitation, membership, organization, user, workspace, workspaceMember } from "../../../db/schema";
import {
  addToWorkspaceAction,
  changeOrgRoleAction,
  changeWorkspaceRoleAction,
  removeFromOrgAction,
  removeFromWorkspaceAction,
  revokeInviteAction,
} from "../../../lib/actions/team";
import { requireWorkspace } from "../../../lib/guard";

const ERRORS: Record<string, string> = {
  last_owner: "An org needs at least one owner. Make someone else an owner first.",
  self: "You can't remove yourself.",
  creator: "The person who created this org can't be removed.",
  personal: "A personal account has one owner. To share ownership, create an organization and transfer the workspace to it in Settings.",
};

const ROLE_TEXT = { admin: "Admin", member: "Member", viewer: "Viewer" } as const;

function Initial({ name }: { name: string }) {
  return (
    <span className="zq-avatar" aria-hidden="true" style={{ cursor: "default" }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function RoleSelect({ name, value }: { name: string; value: string }) {
  return (
    <select className="zq-select" name={name} defaultValue={value} aria-label="Role">
      <option value="viewer">Viewer</option>
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    </select>
  );
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user: me, ws } = await requireWorkspace();
  const isAdmin = ws.wsRole === "admin";
  const isOrgOwner = ws.orgRole === "owner";
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const [orgMembers, wsMembers, pending, org, wsCount] = await Promise.all([
    db
      .select({ id: membership.id, role: membership.role, userId: user.id, name: user.name, email: user.email })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.organizationId, ws.organizationId))
      .orderBy(asc(membership.createdAt)),
    db
      .select({ id: workspaceMember.id, role: workspaceMember.role, userId: workspaceMember.userId })
      .from(workspaceMember)
      .where(eq(workspaceMember.workspaceId, ws.workspaceId)),
    isAdmin
      ? db
          .select({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            wsRole: invitation.workspaceRole,
            expiresAt: invitation.expiresAt,
            by: user.name,
          })
          .from(invitation)
          .innerJoin(user, eq(user.id, invitation.invitedByUserId))
          .where(
            and(
              eq(invitation.organizationId, ws.organizationId),
              eq(invitation.workspaceId, ws.workspaceId),
              isNull(invitation.acceptedAt),
              isNull(invitation.revokedAt),
              gt(invitation.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(invitation.createdAt))
      : Promise.resolve([]),
    db.query.organization.findFirst({ where: eq(organization.id, ws.organizationId) }),
    db.$count(workspace, eq(workspace.organizationId, ws.organizationId)),
  ]);

  // Who's in this workspace: org owners (admins everywhere) and anyone
  // added here with a role.
  const here = orgMembers
    .map((m) => {
      if (m.role === "owner") return { ...m, wsRole: "admin" as const, memberId: null, viaOrg: true };
      const w = wsMembers.find((x) => x.userId === m.userId);
      return w ? { ...m, wsRole: w.role as keyof typeof ROLE_TEXT, memberId: w.id, viaOrg: false } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
  const notHere = orgMembers.filter((m) => m.role !== "owner" && !wsMembers.some((w) => w.userId === m.userId));
  const wsName = wsCount > 1 ? `${ws.workspaceName} in @${ws.organizationSlug}` : `@${ws.organizationSlug}`;

  return (
    <div>
      <p className="zq-kicker">Members</p>
      <h1 className="zq-h">
        Who works in {wsCount > 1 ? ws.workspaceName : ws.organizationName}
        <span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Everyone here can sign their agents in to this workspace&rsquo;s connections. Their role decides how far a
        connection lets them go.
      </p>

      {error && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 18 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{error}</span>
        </div>
      )}

      {isAdmin && (
        <section className="zq-panel-box" style={{ marginTop: 24 }} aria-labelledby="invite-h">
          <h2 className="zq-block-t" id="invite-h">
            Invite someone new
          </h2>
          <InviteForm canMakeOrgOwner={isOrgOwner && ws.organizationKind !== "personal"} workspace={wsName} />
        </section>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          In this workspace
        </h2>
        <div className="zq-list">
          {here.map((m) => {
            const isMe = m.userId === me.id;
            return (
              <div className="zq-item" key={m.id}>
                <Initial name={m.name || m.email} />
                <div className="zq-item-main">
                  <div className="zq-item-t">
                    {m.name || m.email}
                    {isMe ? " (you)" : ""}
                  </div>
                  <div className="zq-item-s">
                    {m.email}
                    {m.viaOrg ? " · org owner" : ""}
                  </div>
                </div>
                <div className="zq-item-r">
                  {isAdmin && m.memberId && !isMe ? (
                    <>
                      <form action={changeWorkspaceRoleAction} className="zq-inline-form">
                        <input type="hidden" name="member_id" value={m.memberId} />
                        <RoleSelect name="ws_role" value={m.wsRole} />
                        <button type="submit" className="zq-action zq-action-sm">
                          Save
                        </button>
                      </form>
                      <form action={removeFromWorkspaceAction}>
                        <input type="hidden" name="member_id" value={m.memberId} />
                        <button type="submit" className="zq-action zq-action-sm zq-action-danger">
                          Remove
                        </button>
                      </form>
                    </>
                  ) : (
                    <span className={m.wsRole === "admin" ? "zq-badge zq-badge-cob" : "zq-badge"}>{ROLE_TEXT[m.wsRole]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isAdmin && notHere.length > 0 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            In @{ws.organizationSlug}, not in this workspace
          </h2>
          <div className="zq-list">
            {notHere.map((m) => (
              <div className="zq-item" key={m.id}>
                <Initial name={m.name || m.email} />
                <div className="zq-item-main">
                  <div className="zq-item-t">{m.name || m.email}</div>
                  <div className="zq-item-s">{m.email}</div>
                </div>
                <div className="zq-item-r">
                  <form action={addToWorkspaceAction} className="zq-inline-form">
                    <input type="hidden" name="user_id" value={m.userId} />
                    <RoleSelect name="ws_role" value="member" />
                    <button type="submit" className="zq-action zq-action-sm">
                      Add
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isAdmin && pending.length > 0 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Pending invites
          </h2>
          <div className="zq-list">
            {pending.map((p) => (
              <div className="zq-item" key={p.id}>
                <span className="zq-item-ic" aria-hidden="true">
                  @
                </span>
                <div className="zq-item-main">
                  <div className="zq-item-t">{p.email}</div>
                  <div className="zq-item-s">
                    {p.role === "owner" ? "Org owner" : ROLE_TEXT[p.wsRole as keyof typeof ROLE_TEXT] ?? p.wsRole} · invited by {p.by} ·
                    expires {p.expiresAt.toUTCString().slice(5, 16)}
                  </div>
                </div>
                <div className="zq-item-r">
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="invite_id" value={p.id} />
                    <button type="submit" className="zq-action zq-action-sm">
                      Revoke
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOrgOwner && orgMembers.length > 1 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Org owners
          </h2>
          <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Owners are admins of every workspace in @{ws.organizationSlug} and can create new ones.
          </p>
          <div className="zq-list">
            {orgMembers.map((m) => {
              const isMe = m.userId === me.id;
              const isCreator = org?.ownerUserId === m.userId;
              return (
                <div className="zq-item" key={m.id}>
                  <Initial name={m.name || m.email} />
                  <div className="zq-item-main">
                    <div className="zq-item-t">
                      {m.name || m.email}
                      {isMe ? " (you)" : ""}
                    </div>
                    <div className="zq-item-s">{m.role === "owner" ? "Owner" : "Member of the org"}</div>
                  </div>
                  <div className="zq-item-r">
                    {!isMe && ws.organizationKind !== "personal" && (
                      <form action={changeOrgRoleAction}>
                        <input type="hidden" name="membership_id" value={m.id} />
                        <input type="hidden" name="role" value={m.role === "owner" ? "member" : "owner"} />
                        <button type="submit" className="zq-action zq-action-sm">
                          {m.role === "owner" ? "Remove owner" : "Make owner"}
                        </button>
                      </form>
                    )}
                    {!isMe && !isCreator && (
                      <form action={removeFromOrgAction}>
                        <input type="hidden" name="membership_id" value={m.id} />
                        <button type="submit" className="zq-action zq-action-sm zq-action-danger">
                          Remove from org
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          Roles
        </h2>
        <dl className="zq-kv">
          <dt>Admin</dt>
          <dd>Adds instances and their keys, creates connections and sets their policy, manages members. Can delete through a connection that allows it</dd>
          <dt>Member</dt>
          <dd>Read, create and edit through any connection that allows it</dd>
          <dt>Viewer</dt>
          <dd>Read only, whatever the connection allows</dd>
        </dl>
      </section>
    </div>
  );
}
