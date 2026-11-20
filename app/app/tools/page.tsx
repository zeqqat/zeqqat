import { redirect } from "next/navigation";

// Tools now live on each integration's page.
export default function ToolsPage() {
  redirect("/app/dokploy-integrations");
}
