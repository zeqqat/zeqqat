import { redirect } from "next/navigation";
import { SignInButtons } from "../../../components/ConsentControls";
import { PublicHeader } from "../../../components/PublicHeader";
import { awaitingClaim } from "../../../lib/seed-claim";
import { claimMatches } from "../../../lib/selfhost-seed";
import { getServerSession } from "../../../lib/session";

export const metadata = { title: "Set up your Zeqqat", robots: { index: false, follow: false } };

// "Open your Zeqqat" from zeqqat.com lands here: the owner sets a password
// and is in, with their account, workspace and Dokploy instance already
// there (lib/seed-claim.ts). Anything else (claimed already, wrong link)
// goes to sign-in.
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [seed, session] = await Promise.all([awaitingClaim(), getServerSession()]);
  if (!seed || session?.user || !claimMatches(seed, token)) redirect("/signin");
  const { owner } = seed;
  return (
    <div className="zq">
      <PublicHeader social />
      <div className="zq-auth-wrap">
        <main className="zq-card zq-consent zq-signin">
          <div className="zq-requester">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
          </div>
          <h1 className="zq-card-h">Set up your Zeqqat</h1>
          <p className="zq-card-p">
            You&rsquo;re @{owner.username} here too. Set a password and it&rsquo;s yours.
          </p>
          <SignInButtons
            providers={["password"]}
            callbackURL="/signin"
            passwordMode="claim"
            inviteEmail={owner.email}
            claimName={owner.name}
            claimToken={token}
          />
        </main>
      </div>
    </div>
  );
}
