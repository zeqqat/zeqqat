import type { Metadata } from "next";
import OverviewPage from "./overview-page";
import ToolPage, { generateMetadata as toolMetadata } from "./tool-page";

type Props = { params: Promise<{ org: string; ws: string }> };

function isToolSegment(ws: string) {
  let seg = ws;
  try {
    seg = decodeURIComponent(ws);
  } catch {
    // Keep it as it came.
  }
  // Tool and policy names always contain dots; workspace slugs never do.
  return seg.includes(".") || seg.includes("@");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, ws } = await params;
  if (isToolSegment(ws)) return toolMetadata({ params: Promise.resolve({ org, tool: ws }) });
  return { title: "Overview" };
}

// /<username>/<workspace> is the workspace's overview;
// /<username>/<target.type.action> is a tool (or policy) page.
export default async function Page({ params }: Props) {
  const { org, ws } = await params;
  if (isToolSegment(ws)) return <ToolPage params={Promise.resolve({ org, tool: ws })} />;
  return <OverviewPage />;
}
