import { notFound } from "next/navigation";
import { AppFrame } from "../../../components/AppFrame";
import { placeOf } from "../../../lib/paths";

// One workspace's pages: /<username>/<workspace>/... (lib/paths.ts). A
// dotted second segment is a tool or policy page instead, which is public
// and has no dashboard frame.
export default async function WorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ org: string; ws: string }>;
  children: React.ReactNode;
}) {
  const { org, ws } = await params;
  const seg = decodeURIComponent(ws);
  if (seg.includes(".") || seg.includes("@")) return <>{children}</>;
  // Only a real username can have workspaces (/app/activity is nothing).
  if (placeOf(`/${org}/${ws}`)?.kind !== "workspace") notFound();
  return <AppFrame level="workspace">{children}</AppFrame>;
}
