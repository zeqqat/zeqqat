import { CountHead, InviteButton, MemberList } from "../../../../components/AccountPages";
import { accountMembers } from "../../../../lib/accounts";
import { requireWorkspace } from "../../../../lib/guard";
import { listUserWorkspaces } from "../../../../lib/workspace";

// Everyone in this account and the workspaces they work in. A personal
// account has members too (the people in its workspaces), but nobody else
// can ever own it. Roles are set in each workspace's Members page.
export default async function AccountMembersPage() {
  const { user, ws } = await requireWorkspace();
  const [members, all] = await Promise.all([accountMembers(ws.organizationId), listUserWorkspaces(user.id)]);
  const personal = ws.organizationKind === "personal";
  // Invite into workspaces you're an admin of; in a personal account, only its owner invites.
  const canInviteTo =
    personal && ws.orgRole !== "owner"
      ? []
      : all.filter((w) => w.organizationId === ws.organizationId && w.wsRole === "admin").map((w) => ({ id: w.workspaceId, name: w.workspaceName }));
  return (
    <div>
      <CountHead n={members.length} one="member" many="members">
        {canInviteTo.length > 0 && <InviteButton workspaces={canInviteTo} />}
      </CountHead>
      <MemberList members={members} />
    </div>
  );
}
