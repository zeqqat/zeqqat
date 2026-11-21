import { redirect } from "next/navigation";
import { InviteCard } from "../../../components/InviteCard";
import { PublicHeader } from "../../../components/PublicHeader";
import { acceptInviteByIdAction, declineInviteAction } from "../../../lib/actions/team";
import { siteHost } from "../../../lib/edition";
import { requireUser } from "../../../lib/guard";
import { findOpenInviteById } from "../../../lib/invites";
import { inviteUrlOf } from "../../../lib/setup";
import { homePathFor } from "../../../lib/workspace";

export const metadata = { title: "Invitation", robots: { index: false, follow: false } };

// An invite waiting for the signed-in person's email, opened by Zeqqat
// itself: first thing after signing in (before Setup), or from the blue
// dot in the account list. Join or Decline.
export default async function WaitingInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const invite = await findOpenInviteById((await params).id);
  if (!invite || invite.email !== user.email.toLowerCase()) redirect(await homePathFor(user.id));
  const url = await inviteUrlOf(invite.connectionId, invite.workspaceId);
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <InviteCard
          organization={invite.organizationName}
          inviter={invite.inviterName || invite.inviterEmail}
          role={invite.role}
          url={url ? { ...url, host: siteHost() } : null}
          expiresAt={invite.expiresAt}
        >
          <form action={acceptInviteByIdAction}>
            <input type="hidden" name="invite_id" value={invite.id} />
            <button type="submit" className="zq-google">
              Join {invite.organizationName}
            </button>
          </form>
          <form action={declineInviteAction}>
            <input type="hidden" name="invite_id" value={invite.id} />
            <button type="submit" className="zq-action zq-invite-decline">
              Decline
            </button>
          </form>
        </InviteCard>
      </div>
    </div>
  );
}
