import { redirect } from "next/navigation";

// The instance list lives under Integrations now, grouped by integration.
// Instance detail pages stay at /app/instances/<id>.
export default function InstancesIndex() {
  redirect("/app/integrations");
}
