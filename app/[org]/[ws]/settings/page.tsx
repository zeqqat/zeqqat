import { eq } from "drizzle-orm";
import { AccountAvatar } from "../../../../components/PathSwitch";
import { CopyButton } from "../../../../components/CopyButton";
import { ManageRow } from "../../../../components/McpUrlPage";
import { SettingsCounts, SettingsTabs } from "../../../../components/SettingsHead";
import { db } from "../../../../db";
import { workspace } from "../../../../db/schema";
import { workspaceCards } from "../../../../lib/accounts";
import { deleteWorkspaceAction, renameWorkspaceAction, transferWorkspaceAction } from "../../../../lib/actions/workspace";
import { publicUrl } from "../../../../lib/env";
import { requireWorkspace } from "../../../../lib/guard";
import { policyCards } from "../../../../lib/policy-pages";
import { listUserAccounts, listUserWorkspaces } from "../../../../lib/workspace";

// A workspace's Settings: the card (name, @account/workspace, counts), then
// tabs. General holds the workspace name and address; Transfer only shows in
// a personal account; Delete only for owners when the account has another
// workspace (Gaita, 2026-11-21).

const ERRORS: Record<string, [string, string]> = {
  name: ["general", "Give the workspace a name."],
  confirm: ["delete", "That didn't match. Type it exactly as shown."],
  last: ["delete", "An account needs at least one workspace."],
  confirm_transfer: ["transfer", "That didn't match. Type it exactly as shown."],
  transfer: ["transfer", "That transfer didn't go through. Pick an organization you own."],
  transfer_personal: ["transfer", "Only workspaces under your own username can be transferred."],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, ws } = await requireWorkspace();
  const params = await searchParams;
  const isAdmin = ws.wsRole === "admin";
  const isOwner = ws.orgRole === "owner";
  const personal = ws.organizationKind === "personal";
  const errKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errKey];

  const mine = await listUserWorkspaces(user.id);
  const [siblings, cards, policies] = await Promise.all([
    db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)),
    workspaceCards(ws.organizationId, mine),
    policyCards(ws.organizationId, [ws.workspaceId], true),
  ]);
  const card = cards.find((c) => c.id === ws.workspaceId);
  const canDelete = isOwner && siblings.length > 1;
  const canTransfer = personal && isOwner;
  const teamOrgs = canTransfer
    ? (await listUserAccounts(user.id))
        .filter((a) => a.organizationKind === "organization" && a.orgRole === "owner")
        .map((a) => ({ id: a.organizationId, slug: a.organizationSlug, name: a.organizationName, kind: a.organizationKind, orgRole: a.orgRole }))
    : [];

  const tabs: [string, string][] = [["general", "General"]];
  if (canTransfer) tabs.push(["transfer", "Transfer"]);
  if (canDelete) tabs.push(["delete", "Delete"]);
  const asked = typeof params.tab === "string" ? params.tab : error?.[0];
  const tab = tabs.some(([t]) => t === asked) ? asked! : "general";

  const address = `${publicUrl()}/${ws.organizationSlug}/${ws.workspaceSlug}`;
  const role = isOwner ? "Owner" : ws.wsRole.charAt(0).toUpperCase() + ws.wsRole.slice(1);
  const account = { slug: ws.organizationSlug, name: ws.organizationName, kind: ws.organizationKind as "personal" | "organization" };

  return (
    <div>
      {(params.saved || params.deleted || params.transferred) && (
        <div className="zq-ok-box zq-st-msg" role="status">
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            {params.deleted
              ? "Workspace deleted."
              : params.transferred
                ? "Workspace transferred. Its MCP URLs have new addresses; the old ones keep working and tell agents the new one."
                : "Saved."}
          </span>
        </div>
      )}
      {error && (
        <div className="zq-warn-box zq-st-msg" role="alert">
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{error[1]}</span>
        </div>
      )}

      <div className="zq-in-card">
        <div className="zq-mu-person zq-mb-row is-head zq-st-head">
          <span className="zq-st-mark is-ws" aria-hidden="true">
            {(ws.workspaceName || "W").trim().charAt(0).toUpperCase()}
          </span>
          <div className="zq-mu-pt">
            <div className="zq-mu-pl">
              <span className="zq-mu-pn">
                <b>{ws.workspaceName}</b>
              </span>
              <span className="zq-mb-role">{role}</span>
            </div>
            <div className="zq-mu-pl">
              <span className="zq-st-addr">
                <AccountAvatar account={account} image={personal && isOwner ? user.image : null} size="sm" />
                <span>@{ws.organizationSlug}</span>
                <i>/</i>
                <span>{ws.workspaceSlug}</span>
              </span>
            </div>
            <SettingsCounts
              counts={[
                { icon: "dokploy", n: card?.instances ?? 0, title: "Dokploy instances" },
                { icon: "url", n: card?.urls ?? 0, title: "MCP URLs" },
                { icon: "people", n: card?.people ?? 0, title: "People" },
                { icon: "policy", n: policies.length, title: "Policies used" },
              ]}
            />
          </div>
        </div>

        <SettingsTabs tabs={tabs} tab={tab} />

        <div className="zq-mb-list">
          {tab === "general" && (
            <>
              {isAdmin ? (
                <ManageRow
                  title="Workspace name"
                  value={ws.workspaceName}
                  button="Edit"
                  submit="Save"
                  formId="st-name"
                  open={errKey === "name"}
                >
                  <form action={renameWorkspaceAction} id="st-name">
                    <input className="zq-input" name="name" defaultValue={ws.workspaceName} maxLength={60} aria-label="Workspace name" />
                  </form>
                </ManageRow>
              ) : (
                <div className="zq-mu-mrow">
                  <div className="zq-mu-mrow-h">
                    <span className="zq-mu-mrow-t">
                      <b>Workspace name</b>
                      <small>{ws.workspaceName}</small>
                    </span>
                  </div>
                </div>
              )}
              <div className="zq-mu-mrow">
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>Address</b>
                    <small className="zq-st-url">{address.replace(/^https?:\/\//, "")}</small>
                  </span>
                  <CopyButton text={address} />
                </div>
              </div>
            </>
          )}

          {tab === "transfer" && (
            <ManageRow
              title="Transfer to an organization"
              value="Moves its instances, MCP URLs and policies to an organization you own. Old MCP URLs keep working and point agents to the new ones."
              button="Transfer"
              submit="Transfer"
              formId="st-transfer"
              open={errKey.startsWith("confirm_transfer") || errKey === "transfer"}
            >
              {teamOrgs.length === 0 ? (
                <p className="zq-empty">Create an organization first (open @{ws.organizationSlug} in the top bar), then transfer this workspace to it.</p>
              ) : (
                <form action={transferWorkspaceAction} id="st-transfer" className="zq-st-form">
                  <select className="zq-select" name="to_org" aria-label="Organization">
                    {teamOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        @{o.slug}
                      </option>
                    ))}
                  </select>
                  <input className="zq-input" name="confirm" placeholder={`Type ${ws.workspaceSlug} to confirm`} aria-label={`Type ${ws.workspaceSlug} to confirm`} autoComplete="off" />
                </form>
              )}
            </ManageRow>
          )}

          {tab === "delete" && (
            <ManageRow
              title="Delete this workspace"
              value="Removes its instances and their keys, its MCP URLs and its activity."
              button="Delete"
              submit="Delete workspace"
              formId="st-delete"
              danger
              open={errKey === "confirm"}
            >
              <form action={deleteWorkspaceAction} id="st-delete">
                <input className="zq-input" name="confirm" placeholder={`Type ${ws.workspaceSlug} to confirm`} aria-label={`Type ${ws.workspaceSlug} to confirm`} autoComplete="off" />
              </form>
            </ManageRow>
          )}
        </div>
      </div>
    </div>
  );
}

