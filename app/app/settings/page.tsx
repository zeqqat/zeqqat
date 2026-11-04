import { eq } from "drizzle-orm";
import { CreateOrgForm, CreateWorkspaceForm } from "../../../components/ConnectionForms";
import { db } from "../../../db";
import { workspace } from "../../../db/schema";
import { deleteWorkspaceAction, renameWorkspaceAction, transferWorkspaceAction } from "../../../lib/actions/workspace";
import { edition } from "../../../lib/edition";
import { requireWorkspace } from "../../../lib/guard";
import { listUserWorkspaces, orgsOf } from "../../../lib/workspace";

const ERRORS: Record<string, string> = {
  confirm: "Type the workspace's handle to confirm.",
  last: "An org needs at least one workspace.",
  name: "Give the workspace a name.",
  confirm_transfer: "Type the workspace's handle to confirm the transfer.",
  transfer: "That transfer didn't go through. Pick an organization you own.",
  transfer_personal: "Only workspaces in your personal namespace can be transferred.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, ws } = await requireWorkspace();
  const params = await searchParams;
  const isAdmin = ws.wsRole === "admin";
  const isOrgOwner = ws.orgRole === "owner";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const siblings = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.organizationId, ws.organizationId));
  const multi = siblings.length > 1;
  const personal = ws.organizationKind === "personal";
  const teamOrgs = personal && isOrgOwner ? orgsOf(await listUserWorkspaces(user.id)).filter((o) => o.kind === "organization" && o.orgRole === "owner") : [];

  return (
    <div>
      <p className="zq-kicker">Settings</p>
      <h1 className="zq-h">
        {multi ? ws.workspaceName : ws.organizationName}
        <span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        @{ws.organizationSlug}
        {multi ? `/${ws.workspaceSlug}` : ""} · you&rsquo;re {ws.wsRole === "admin" ? "an admin" : `a ${ws.wsRole}`}
        {isOrgOwner ? " and an org owner" : ""}.
      </p>

      {(params.saved || params.created || params.deleted || params.transferred) && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            {params.created
              ? "Workspace created. You're in it now."
              : params.deleted
                ? "Workspace deleted."
                : params.transferred
                  ? "Workspace transferred. Its connections have new URLs; the old ones keep working and tell agents the new one."
                  : "Saved."}
          </span>
        </div>
      )}
      {error && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{error}</span>
        </div>
      )}

      {isAdmin && multi && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Workspace name
          </h2>
          <form action={renameWorkspaceAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="zq-input" name="name" defaultValue={ws.workspaceName} maxLength={60} style={{ flex: "999 1 240px" }} />
            <button type="submit" className="zq-action" style={{ flex: "1 1 100px" }}>
              Save
            </button>
          </form>
          <p className="zq-help">The handle ({ws.workspaceSlug}) stays the same.</p>
        </section>
      )}

      <section className="zq-block" id="new">
        <h2 className="zq-block-t" style={{ marginBottom: 6 }}>
          New workspace in @{ws.organizationSlug}
        </h2>
        <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
          Workspaces split one org by team: their own instances and keys, their own connections, their own members. For
          example Engineering gets the deploy tools and Marketing gets social media.
        </p>
        {isOrgOwner ? (
          <CreateWorkspaceForm />
        ) : (
          <p className="zq-empty">Only owners of @{ws.organizationSlug} create workspaces.</p>
        )}
      </section>

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 6 }}>
          New organization
        </h2>
        <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
          An organization has its own username, used in every connection URL: /&lt;username&gt;/mcp/&hellip; Lowercase with
          underscores, e.g. acme_corp. Your personal account @{personal ? ws.organizationSlug : "you"} has one owner, you;
          an organization can have several.
        </p>
        <CreateOrgForm />
      </section>

      {isAdmin && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Where this runs
          </h2>
          <p className="zq-note" style={{ marginTop: 0 }}>
            {edition() === "cloud" ? (
              <>
                On zeqqat.com, free while in Beta.{" "}
                <a className="zq-textlink" href="/app/self-host">
                  Install on your own Dokploy
                </a>
              </>
            ) : (
              "Self-hosted. API keys stay on your server."
            )}
          </p>
        </section>
      )}

      {personal && isOrgOwner && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 6 }}>
            Transfer this workspace to an organization
          </h2>
          <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Moves its instances, connections and the policies it uses into an organization you own, so others can share ownership.
            Connection URLs change; the old ones keep working and tell agents the new URL. Type {ws.workspaceSlug} to confirm.
          </p>
          {teamOrgs.length === 0 ? (
            <p className="zq-empty">Create an organization first (above), then transfer this workspace to it.</p>
          ) : (
            <form action={transferWorkspaceAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select className="zq-select" name="to_org" aria-label="Organization" style={{ flex: "1 1 180px" }}>
                {teamOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    @{o.slug}
                  </option>
                ))}
              </select>
              <input className="zq-input" name="confirm" placeholder={ws.workspaceSlug} autoComplete="off" style={{ flex: "999 1 200px" }} />
              <button type="submit" className="zq-action" style={{ flex: "1 1 120px" }}>
                Transfer
              </button>
            </form>
          )}
        </section>
      )}

      {isOrgOwner && multi && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 6 }}>
            Delete this workspace
          </h2>
          <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Removes its instances and their keys, its connections and its activity. Type {ws.workspaceSlug} to confirm.
          </p>
          <form action={deleteWorkspaceAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="zq-input" name="confirm" placeholder={ws.workspaceSlug} autoComplete="off" style={{ flex: "999 1 240px" }} />
            <button type="submit" className="zq-action zq-action-danger" style={{ flex: "1 1 120px" }}>
              Delete workspace
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
