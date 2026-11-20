import { redirect } from "next/navigation";
import { signInProviders } from "../lib/auth-providers";
import { edition } from "../lib/edition";
import { hasNoUsers } from "../lib/password-auth";
import { safeNext } from "../lib/next-path";
import { getServerSession } from "../lib/session";
import { homePathFor } from "../lib/workspace";
import { signInErrorText } from "../lib/sign-in-errors";
import { SignInButtons } from "./ConsentControls";
import { DokployMark } from "./Marks";
import { PublicHeader } from "./PublicHeader";

// Sign in and sign up are the same page: signing in with a new account
// creates it. The landing page explains the product, so this card carries
// no pitch, only the ways in. ?next= is where to land afterwards; without
// one, your own account page (/<username>). Sign-in providers come back
// here, which is how a new account finds its username.
export async function AuthCard({ error, next }: { error?: string; next?: string | string[] }) {
  const target = safeNext(next);
  const session = await getServerSession();
  if (session?.user) redirect(target || (await homePathFor(session.user.id)));

  // A fresh self-hosted install: the first account owns it. After that,
  // password accounts are only made from invites, so the card only signs in.
  const passwordOnly = signInProviders.length === 1 && signInProviders[0] === "password";
  const setup = signInProviders.includes("password") && (await hasNoUsers());

  const errorURL = `/signin${target ? `?next=${encodeURIComponent(target)}` : ""}`;
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
          <h1 className="zq-card-h">{setup ? "Set up your Zeqqat" : "Welcome to Zeqqat"}</h1>
          <p className="zq-card-p">
            {setup
              ? "Create the first account. It owns this Zeqqat, and everyone else joins with an invite."
              : passwordOnly
                ? (
                  <>
                    <span>
                      Talk to your{" "}
                      <b className="zq-inline-brand">
                        <DokployMark size={15} />
                        Dokploy.
                      </b>
                    </span>
                  </>
                )
                : "Sign in, or create your account."}
          </p>
          <SignInButtons
            providers={signInProviders}
            callbackURL={target || "/signin"}
            errorCallbackURL={errorURL}
            error={signInErrorText(error)}
            passwordMode={setup ? "setup" : "signin"}
          />
          {/* Self-hosters accepted the license when they installed, so the
              terms line is for zeqqat.com only. */}
          {edition() === "cloud" && (
            <p className="zq-signin-legal">
              By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
