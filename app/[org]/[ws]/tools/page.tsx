import { redirect } from "next/navigation";
import { here } from "../../../../lib/guard";

// Tools now live on each integration's page.
export default async function ToolsPage() {
  redirect(await here("/dokploy-integrations"));
}
