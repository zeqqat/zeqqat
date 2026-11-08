import { ForgotPasswordForm } from "../../components/PasswordPages";
import { PublicHeader } from "../../components/PublicHeader";
import { passwordEnabled } from "../../lib/auth-providers";
import { mailerConfigured } from "../../lib/mailer";

export const metadata = { title: "Forgot password" };

// With a mailer, the reset link comes by email. Without one (most
// self-hosted installs), the install's owner makes the link on the Team page.
export default function ForgotPasswordPage() {
  const byEmail = passwordEnabled && mailerConfigured();
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <main className="zq-card zq-consent zq-signin">
          <h1 className="zq-card-h">Forgot your password?</h1>
          {byEmail ? (
            <>
              <p className="zq-card-p">We&rsquo;ll email you a link to choose a new one.</p>
              <ForgotPasswordForm />
            </>
          ) : (
            <p className="zq-card-p">
              Ask the owner of this Zeqqat for a reset link. They make one on the Team page, and it works once, for 24
              hours.
            </p>
          )}
          <p className="zq-alt">
            <a href="/signin">Back to sign in</a>
          </p>
        </main>
      </div>
    </div>
  );
}
