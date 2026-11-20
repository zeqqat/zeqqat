import { PolicyPageView } from "../../../../../components/PolicyPage";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// A policy as this workspace uses it: same page, Map limited to this
// workspace's MCP URLs.
export default async function WorkspacePolicyPage({ params, searchParams }: Params) {
  return <PolicyPageView id={(await params).id} query={await searchParams} scope="workspace" />;
}
