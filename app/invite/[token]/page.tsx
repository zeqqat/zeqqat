import { SignInButtons } from "../../../components/ConsentControls";
import { PublicHeader } from "../../../components/PublicHeader";
import { acceptInviteAction, declineInviteAction } from "../../../lib/actions/team";
import { InviteCard } from "../../../components/InviteCard";
import { inviteUrlOf } from "../../../lib/setup";
import { siteHost } from "../../../lib/edition";
import { signInProviders } from "../../../lib/auth-providers";
import { findOpenInvite } from "../../../lib/invites";
import { getServerSession } from "../../../lib/session";
import { SignOutButton } from "../../../components/SignOutButton";

export const metadata = { title: "Invitation", robots: { index: false, follow: false } };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const [invite, session] = await Promise.all([findOpenInvite(token), getServerSession()]);
  const here = `/invite/${encodeURIComponent(token)}`;

  if (!invite) {
    return (
      <div className="zq">
        <PublicHeader />
        <div className="zq-auth-wrap">
          <main className="zq-card">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <h1 className="zq-card-h">This invite can&rsquo;t be used</h1>
            <p className="zq-card-p">
              It may have expired, been revoked, or already been accepted. Ask the person who invited you for a new link.
            </p>
            <p className="zq-alt">
              <a href="/signin">Sign in to Zeqqat</a>
            </p>
          </main>
        </div>
      </div>
    );
  }

  const signedInAs = session?.user?.email?.toLowerCase();
  const matches = signedInAs === invite.email;
  const wrong = !!signedInAs && !matches;
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
          {(wrong || query.error === "wrong_account") && (
            <div className="zq-warn-box" role="alert" style={{ marginTop: 18 }}>
              <span className="ic" aria-hidden="true">
                !
              </span>
              <span>
                You&rsquo;re signed in as {signedInAs}. This invite is for {invite.email}. Sign out and continue as that email.
              </span>
            </div>
          )}
          {matches ? (
            <>
              <form action={acceptInviteAction}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="zq-google">
                  Join {invite.organizationName}
                </button>
              </form>
              <form action={declineInviteAction}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="zq-action zq-invite-decline">
                  Decline
                </button>
              </form>
            </>
          ) : wrong ? (
            <SignOutButton redirectTo={here} />
          ) : (
            <SignInButtons providers={signInProviders} callbackURL={here} passwordMode="invite" inviteEmail={invite.email} inviteToken={token} />
          )}
        </InviteCard>
      </div>
    </div>
  );
}
