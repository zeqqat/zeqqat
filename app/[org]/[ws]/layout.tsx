import { AppFrame } from "../../../components/AppFrame";

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
  const { ws } = await params;
  const seg = decodeURIComponent(ws);
  if (seg.includes(".") || seg.includes("@")) return <>{children}</>;
  return <AppFrame level="workspace">{children}</AppFrame>;
}
