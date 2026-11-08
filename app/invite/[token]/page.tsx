import { SignInButtons } from "../../../components/ConsentControls";
import { PublicHeader } from "../../../components/PublicHeader";
import { acceptInviteAction } from "../../../lib/actions/team";
import { signInProviders } from "../../../lib/auth-providers";
import { findOpenInvite } from "../../../lib/invites";
import { getServerSession } from "../../../lib/session";
import { SignOutButton } from "../../../components/SignOutButton";

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

  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <main className="zq-card">
          <div className="zq-requester">
            <span className="zq-avatar" aria-hidden="true" style={{ cursor: "default" }}>
              {(invite.inviterName || invite.inviterEmail).charAt(0).toUpperCase()}
            </span>
            <span className="zq-requester-mark" aria-hidden="true">
              →
            </span>
            <span className="zq-logo" aria-hidden="true">
              {(invite.organizationName.charAt(0) || "Z").toUpperCase()}
            </span>
          </div>
          <p className="zq-kicker" style={{ marginTop: 18 }}>
            Invitation
          </p>
          <h1 className="zq-card-h" style={{ marginTop: 6 }}>
            Join {invite.organizationName} on Zeqqat
          </h1>
          <p className="zq-card-p">
            <b style={{ color: "var(--fg)" }}>{invite.inviterName || invite.inviterEmail}</b> invited{" "}
            <b style={{ color: "var(--fg)" }}>{invite.email}</b> as {invite.role === "owner" ? "an " : "a "}
            <b style={{ color: "var(--fg)" }}>{invite.role === "owner" ? "Owner" : "Member"}</b>. The team has already
            connected its Dokploy, so you only need to connect your agent.
          </p>
          <ul className="zq-scope" aria-label="What you get">
            <li>
              <span aria-hidden="true">✓</span> Use the team&rsquo;s Dokploy instances
            </li>
            <li>
              <span aria-hidden="true">✓</span> Connect your own agents and see the team&rsquo;s activity
            </li>
            <li>
              <span aria-hidden="true" style={{ color: invite.role === "owner" ? "var(--mint)" : "var(--amber)" }}>
                {invite.role === "owner" ? "✓" : "✕"}
              </span>{" "}
              {invite.role === "owner" ? "Manage API keys, permissions and the team" : "Owners manage API keys, permissions and the team"}
            </li>
          </ul>

          {(wrong || query.error === "wrong_account") && (
            <div className="zq-warn-box" role="alert" style={{ marginTop: 18 }}>
              <span className="ic" aria-hidden="true">
                !
              </span>
              <span>
                You&rsquo;re signed in as {signedInAs}. This invite is for {invite.email}. Sign out and continue as that
                email.
              </span>
            </div>
          )}

          {matches ? (
            <form action={acceptInviteAction}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="zq-google">
                Join {invite.organizationName}
              </button>
            </form>
          ) : wrong ? (
            <SignOutButton redirectTo={here} />
          ) : (
            <SignInButtons
              providers={signInProviders}
              callbackURL={here}
              passwordMode="invite"
              inviteEmail={invite.email}
              inviteToken={token}
            />
          )}
          <p className="zq-fineprint">
            This invite only works for {invite.email}. It expires {invite.expiresAt.toUTCString().slice(5, 16)}. If you
            already use Zeqqat, {invite.organizationName} is added next to your own workspace.
          </p>
        </main>
      </div>
    </div>
  );
}
