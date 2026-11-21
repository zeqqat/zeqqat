import { CountHead } from "../../../../components/AccountPages";
import { AddMemberButton, ErrorNote, InvitedList, RolesInfo, WsMemberList } from "../../../../components/Members";
import { hrefIn, requireWorkspace } from "../../../../lib/guard";
import { pendingInvites, workspacePeople } from "../../../../lib/members";

// Who works in this workspace: the account's owners (admins everywhere) and
// the account's people given access here, each with their role, their
// calls this week and the agents they connected. Admins add people from
// the account or invite someone new.
export default async function WorkspaceMembersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user, ws } = await requireWorkspace();
  const { error } = await searchParams;
  const isAdmin = ws.wsRole === "admin";
  const personal = ws.organizationKind === "personal";
  const [{ here, notHere }, invites] = await Promise.all([
    workspacePeople(ws.organizationId, ws.workspaceId, user.id),
    isAdmin ? pendingInvites(ws.organizationId, ws.workspaceId) : Promise.resolve([]),
  ]);
  const back = hrefIn(ws, "/members");
  // In a personal account only its owner brings in someone new.
  const canInvite = isAdmin && (!personal || ws.orgRole === "owner");
  return (
    <div>
      <ErrorNote error={error} />
      <CountHead n={here.length} one="member" many="members">
        <span className="zq-mb-btns">
          <RolesInfo />
          {isAdmin && (notHere.length > 0 || canInvite) && (
            <AddMemberButton
              workspaceId={ws.workspaceId}
              workspaceName={ws.workspaceName}
              accountSlug={ws.organizationSlug}
              others={notHere}
              canInvite={canInvite}
              back={back}
            />
          )}
        </span>
      </CountHead>
      <WsMemberList people={here} me={user.id} base={hrefIn(ws)} />
      <InvitedList invites={invites} showWs={false} revocable back={back} />
    </div>
  );
}
