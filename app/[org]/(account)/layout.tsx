import { notFound } from "next/navigation";
import { AppFrame } from "../../../components/AppFrame";
import { placeOf } from "../../../lib/paths";

// An account's own pages: /<username>/members, /settings,
// /dokploy-integrations. Its workspaces are /<username> itself
// (app/[org]/page.tsx).
export default async function AccountLayout({ params, children }: { params: Promise<{ org: string }>; children: React.ReactNode }) {
  // Only a real username has account pages (/app/settings is nothing).
  if (!placeOf(`/${(await params).org}`)) notFound();
  return <AppFrame level="account">{children}</AppFrame>;
}
