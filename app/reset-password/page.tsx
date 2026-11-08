import { ResetPasswordForm } from "../../components/PasswordPages";
import { PublicHeader } from "../../components/PublicHeader";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="zq">
      <PublicHeader />
      <div className="zq-auth-wrap">
        <main className="zq-card zq-consent zq-signin">
          <h1 className="zq-card-h">Choose a new password</h1>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="zq-card-p">This link is missing its code. Ask for a new reset link.</p>
          )}
        </main>
      </div>
    </div>
  );
}
