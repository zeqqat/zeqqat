import { AppFrame } from "../../../components/AppFrame";

// An account's own pages: /<username>/members, /settings,
// /dokploy-integrations. Its workspaces are /<username> itself
// (app/[org]/page.tsx).
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame level="account">{children}</AppFrame>;
}
