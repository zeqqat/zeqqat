import { serveIntegrationSpec } from "../../../../../../lib/integration-spec-route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveIntegrationSpec(id);
}
