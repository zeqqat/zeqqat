import { signInProviders } from "../lib/auth";
import { signInErrorText } from "../lib/sign-in-errors";
import { SignInButtons } from "./ConsentControls";
import { PublicHeader } from "./PublicHeader";

// Sign in and sign up are the same page: signing in with a new account
// creates it. The landing page explains the product, so this card only
// welcomes and offers the ways in.
export function AuthCard({ error }: { error?: string }) {
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <main className="zq-card zq-consent zq-signin">
          <div className="zq-requester">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
          </div>
          <h1 className="zq-card-h">Welcome to Zeqqat</h1>
          <p className="zq-card-p">
            <span>Give AI access to your Dokploy.</span>
            <span>Minus the risk.</span>
          </p>
          <SignInButtons providers={signInProviders} callbackURL="/app" errorCallbackURL="/signin" error={signInErrorText(error)} />
        </main>
      </div>
    </div>
  );
}
