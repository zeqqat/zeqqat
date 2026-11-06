import { getServerSession } from "../../../../lib/session";
import { ImportError, importFromUrl } from "../../../../lib/spec-import";
import { getUserWorkspace } from "../../../../lib/workspace";

// POST /api/integrations/import {"spec_url": "...", "docs_url"?: "...", "name"?: "..."}
// Adds an app to the signed-in user's current account from its OpenAPI
// spec. Same import as the dashboard form and the zeqqat_import MCP tool.
// Workspace admins only.
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws || ws.wsRole !== "admin") return Response.json({ error: "Only a workspace admin can add apps." }, { status: 403 });

  let body: { spec_url?: unknown; docs_url?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send a JSON body with spec_url." }, { status: 400 });
  }
  if (typeof body.spec_url !== "string" || !body.spec_url.trim()) {
    return Response.json({ error: "spec_url is required." }, { status: 400 });
  }
  try {
    const r = await importFromUrl({
      organizationId: ws.organizationId,
      orgSlug: ws.organizationSlug,
      specUrl: body.spec_url,
      docsUrl: typeof body.docs_url === "string" ? body.docs_url : null,
      name: typeof body.name === "string" ? body.name : null,
    });
    return Response.json(
      {
        integration: r.ref,
        name: r.name,
        updated: r.updated,
        tools: r.endpoints,
        added: r.added,
        removed: r.removed,
        kinds: r.kinds,
        baseUrl: r.baseUrl,
        warnings: r.warnings,
      },
      { status: r.updated ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof ImportError) return Response.json({ error: err.message }, { status: 422 });
    console.error("[zeqqat] import failed:", err);
    return Response.json({ error: "The import failed." }, { status: 500 });
  }
}
