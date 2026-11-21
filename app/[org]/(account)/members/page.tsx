import { CountHead, InviteButton } from "../../../../components/AccountPages";
import { AccountMemberList, ErrorNote, InvitedList } from "../../../../components/Members";
import { accountHref, requireAccount } from "../../../../lib/guard";
import { accountPeople, pendingInvites } from "../../../../lib/members";
import { listUserWorkspaces } from "../../../../lib/workspace";

// Everyone in this account: you first, then the other owners, then the
// rest, each with the workspaces they're in (owners are in all of them).
// A personal account has members too (the people in its workspaces), but
// nobody else can ever own it. Roles live on each person's page.
export default async function AccountMembersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user, acct: ws } = await requireAccount();
  const { error } = await searchParams;
  const [people, invites, mine] = await Promise.all([
    accountPeople(ws.organizationId, user.id),
    pendingInvites(ws.organizationId),
    listUserWorkspaces(user.id),
  ]);
  const personal = ws.organizationKind === "personal";
  const owner = ws.orgRole === "owner";
  const adminOf = mine.filter((w) => w.organizationId === ws.organizationId && w.wsRole === "admin");
  // Invite into workspaces you're an admin of; in a personal account, only its owner invites.
  const canInviteTo = personal && !owner ? [] : adminOf.map((w) => ({ id: w.workspaceId, name: w.workspaceName }));
  const back = accountHref(ws, "/members");
  const visible = owner ? invites : invites.filter((i) => i.wsId && adminOf.some((w) => w.workspaceId === i.wsId));
  return (
    <div>
      <ErrorNote error={error} />
      <CountHead n={people.length} one="member" many="members">
        {canInviteTo.length > 0 && <InviteButton workspaces={canInviteTo} />}
      </CountHead>
      <AccountMemberList people={people} me={user.id} base={accountHref(ws)} />
      <InvitedList invites={visible} showWs revocable back={back} />
    </div>
  );
}
