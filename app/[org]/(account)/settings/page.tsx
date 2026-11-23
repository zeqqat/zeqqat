import { CopyButton } from "../../../../components/CopyButton";
import { ManageRow } from "../../../../components/McpUrlPage";
import { AccountAvatar } from "../../../../components/PathSwitch";
import { SettingsCounts, SettingsTabs } from "../../../../components/SettingsHead";
import { workspaceCards } from "../../../../lib/accounts";
import { changeOrgUsernameAction, deleteOrgAction, renameOrgAction } from "../../../../lib/actions/org-settings";
import { publicUrl } from "../../../../lib/env";
import { edition, siteHost } from "../../../../lib/edition";
import { installsOf } from "../../../../lib/selfhost-installs";
import { keyChoiceOpen } from "../../../../lib/cloud-key";
import { CloudKeyPanel } from "../../../../components/SelfHostFlow";
import { requireAccount } from "../../../../lib/guard";
import { accountScope } from "../../../../lib/integration-scope";
import { accountPeople } from "../../../../lib/members";
import { policyCards } from "../../../../lib/policy-pages";
import { listUserWorkspaces } from "../../../../lib/workspace";

// An account's Settings: the card (avatar, name, @username, counts), then
// tabs. An organization's owners edit its name and username and can delete
// it. A personal account's name and username are its person's profile,
// edited on /account (Gaita, 2026-11-21).

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const ERRORS: Record<string, [string, string]> = {
  name: ["general", "Give the organization a name."],
  username: ["general", "Usernames use lowercase letters, numbers and single underscores, 2 to 39 characters."],
  reserved: ["general", "That username is reserved. Pick another one."],
  taken: ["general", "That username is taken."],
  confirm: ["delete", "That didn't match. Type it exactly as shown."],
  published: ["delete", "This organization publishes integrations that others may use. Remove them before deleting it."],
  policies_used: ["delete", "MCP URLs in other accounts use this organization's policies. They need to switch before it can be deleted."],
};

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, acct: ws } = await requireAccount();
  const params = await searchParams;
  const personal = ws.organizationKind === "personal";
  const isOwner = ws.orgRole === "owner";
  const mine = personal && isOwner;
  const canEdit = !personal && isOwner;
  const errKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errKey];

  const userWs = await listUserWorkspaces(user.id);
  const { workspaceIds } = await accountScope(user.id, ws);
  const [cards, people, policies] = await Promise.all([
    workspaceCards(ws.organizationId, userWs),
    accountPeople(ws.organizationId, user.id),
    policyCards(ws.organizationId, workspaceIds, false),
  ]);
  const sum = (k: "instances" | "urls") => cards.reduce((n, c) => n + c[k], 0);

  const tabs: [string, string][] = [["general", "General"]];
  // Zeqqats installed from zeqqat.com (lib/selfhost-installs.ts): the
  // claim link for any not claimed yet, the address for the rest.
  const selfHost = edition() === "cloud" && isOwner;
  const installs = selfHost ? await installsOf(ws.organizationId) : [];
  if (selfHost) tabs.push(["self-host", "Self-host"]);
  if (canEdit) tabs.push(["delete", "Delete"]);
  const asked = typeof params.tab === "string" ? params.tab : error?.[0];
  const tab = tabs.some(([t]) => t === asked) ? asked! : "general";

  const name = mine ? user.name : ws.organizationName;
  const page = `${publicUrl()}/${ws.organizationSlug}`;
  const account = { slug: ws.organizationSlug, name, kind: ws.organizationKind as "personal" | "organization" };
  const role = isOwner ? "Owner" : "Member";

  return (
    <div>
      {params.saved && (
        <div className="zq-ok-box zq-st-msg" role="status">
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Saved.</span>
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
          <span className="zq-st-av">
            <AccountAvatar account={account} image={mine ? user.image : null} size="lg" />
          </span>
          <div className="zq-mu-pt">
            <div className="zq-mu-pl">
              <span className="zq-mu-pn">
                <b>{name}</b> <span>@{ws.organizationSlug}</span>
              </span>
              <span className="zq-mb-role">{role}</span>
            </div>
            <SettingsCounts
              counts={[
                { icon: "workspaces", n: cards.length, title: "Workspaces" },
                { icon: "people", n: people.length, title: "People" },
                { icon: "dokploy", n: sum("instances"), title: "Dokploy instances" },
                { icon: "url", n: sum("urls"), title: "MCP URLs" },
                { icon: "policy", n: policies.length, title: "Policies" },
              ]}
            />
          </div>
        </div>

        <SettingsTabs tabs={tabs} tab={tab} />

        <div className="zq-mb-list">
          {tab === "general" && (
            <>
              {canEdit ? (
                <>
                  <ManageRow title="Organization name" value={name} button="Edit" submit="Save" formId="st-oname" open={errKey === "name"}>
                    <form action={renameOrgAction} id="st-oname">
                      <input className="zq-input" name="name" defaultValue={name} maxLength={60} aria-label="Organization name" />
                    </form>
                  </ManageRow>
                  <ManageRow
                    title="Username"
                    value={`@${ws.organizationSlug}`}
                    button="Change"
                    submit="Change username"
                    formId="st-uname"
                    open={["username", "reserved", "taken"].includes(errKey)}
                  >
                    <form action={changeOrgUsernameAction} id="st-uname">
                      <input className="zq-input" name="username" defaultValue={ws.organizationSlug} maxLength={39} aria-label="Username" autoComplete="off" />
                    </form>
                    <p className="zq-help">The old username keeps redirecting, so MCP URLs and links keep working.</p>
                  </ManageRow>
                </>
              ) : (
                <>
                  <div className="zq-mu-mrow">
                    <div className="zq-mu-mrow-h">
                      <span className="zq-mu-mrow-t">
                        <b>{personal ? "Name" : "Organization name"}</b>
                        <small>{name}</small>
                      </span>
                      {mine && (
                        <a className="zq-action zq-action-sm zq-mu-mbtn" href="/account">
                          Edit
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="zq-mu-mrow">
                    <div className="zq-mu-mrow-h">
                      <span className="zq-mu-mrow-t">
                        <b>Username</b>
                        <small>@{ws.organizationSlug}</small>
                      </span>
                      {mine && (
                        <a className="zq-action zq-action-sm zq-mu-mbtn" href="/account">
                          Change
                        </a>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="zq-mu-mrow">
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>Public page</b>
                    <small className="zq-st-url">{page.replace(/^https?:\/\//, "")}</small>
                  </span>
                  <CopyButton text={page} />
                </div>
              </div>
            </>
          )}

          {tab === "self-host" && (
            <>
              {installs.map((i) => (
                <div className="zq-mu-mrow" key={i.id}>
                  <div className="zq-mu-mrow-h" style={{ flexWrap: "wrap" }}>
                    <span className="zq-mu-mrow-t" style={{ flex: "1 1 0", minWidth: 0 }}>
                      <b className="zq-st-url">{i.address.replace(/^https?:\/\//, "")}</b>
                      <small>
                        {i.claimedAt
                          ? `Claimed on ${day(i.claimedAt)}`
                          : `Installed on ${day(i.createdAt)} · not claimed yet`}
                        {i.instanceAlias ? ` · from ${i.instanceAlias}` : ""}
                      </small>
                    </span>
                    {i.claimUrl ? (
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <CopyButton text={i.claimUrl} />
                        <a className="zq-action zq-action-sm zq-mu-mbtn" href={i.claimUrl} target="_blank" rel="noreferrer noopener">
                          Claim it
                        </a>
                      </span>
                    ) : (
                      <a className="zq-action zq-action-sm zq-mu-mbtn" href={i.address} target="_blank" rel="noreferrer noopener">
                        Open
                      </a>
                    )}
                  </div>
                  {keyChoiceOpen(i) && !i.keyDeletedAt && (
                    <CloudKeyPanel
                      installId={i.id}
                      alias={i.instanceAlias ?? "your instance"}
                      hint={i.keyHint}
                      siteHost={siteHost()}
                      instanceHref={`/${ws.organizationSlug}/dokploy-instances/${i.instanceId}?tab=manage`}
                    />
                  )}
                </div>
              ))}
              <div className="zq-mu-mrow">
                <div className="zq-mu-mrow-h">
                  <span className="zq-mu-mrow-t">
                    <b>{installs.length ? "Install another Zeqqat" : "Install Zeqqat on your own Dokploy"}</b>
                    <small>With your account and Dokploy instance already on it.</small>
                  </span>
                  <a className="zq-action zq-action-sm zq-mu-mbtn" href={`/${ws.organizationSlug}/self-host`}>
                    Install
                  </a>
                </div>
              </div>
            </>
          )}

          {tab === "delete" && (
            <ManageRow
              title="Delete this organization"
              value={`Removes its ${cards.length === 1 ? "workspace" : `${cards.length} workspaces`}, their instances and keys, MCP URLs, policies and activity.`}
              button="Delete"
              submit="Delete organization"
              formId="st-odelete"
              danger
              open={errKey === "confirm"}
            >
              <form action={deleteOrgAction} id="st-odelete">
                <input
                  className="zq-input"
                  name="confirm"
                  placeholder={`Type ${ws.organizationSlug} to confirm`}
                  aria-label={`Type ${ws.organizationSlug} to confirm`}
                  autoComplete="off"
                />
              </form>
            </ManageRow>
          )}
        </div>
      </div>
    </div>
  );
}
