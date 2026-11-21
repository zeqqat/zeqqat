import type { Metadata } from "next";
import { AccountForm } from "../../components/AccountForm";
import { requireUser } from "../../lib/guard";
import { listUserAccounts } from "../../lib/workspace";

export const metadata: Metadata = { title: "Account" };

// Your picture, name and username. Opened from the account menu.
export default async function AccountPage() {
  const user = await requireUser();
  const all = await listUserAccounts(user.id);
  const personal = all.find((a) => a.organizationKind === "personal" && a.ownerUserId === user.id);
  const username = personal?.organizationSlug ?? "";

  return (
    <div>
      <p className="zq-kicker">Account</p>
      <h1 className="zq-h">
        Your profile<span className="dot">.</span>
      </h1>
      <AccountForm name={user.name} username={username} image={user.image ?? null} />
    </div>
  );
}
