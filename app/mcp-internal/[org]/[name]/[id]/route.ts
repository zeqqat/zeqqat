import { eq } from "drizzle-orm";
import { db } from "../../../../../db";
import { organization, workspace } from "../../../../../db/schema";
import { connectionPath, findConnectionByPath, movedNotice, resourceMetadataUrl, sunsetNotice } from "../../../../../lib/connections";
import { publicUrl } from "../../../../../lib/env";
import { accountType, resolveBearerToken, type McpContext } from "../../../../../lib/mcp-auth";
import { serveMcp, serveSunset, unauthorized } from "../../../../../lib/mcp-server";
import { clientIp } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ org: string; name: string; id: string }> };

// The MCP side of a connection URL, zeqqat.com/<org>/mcp/<name>/<id>. The
// proxy (proxy.ts) rewrites POSTs on that URL here and answers every
// other method itself; this path can't be requested directly. The URL
// picks the connection (and so the workspace and the tool policy); the
// bearer token picks the person and so their role.

// Origins allowed to call from a browser, besides our own. MCP clients
// that run on a server send no Origin at all and are unaffected.
function allowedOrigins(): Set<string> {
  const extra = (process.env.ZEQQAT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([new URL(publicUrl()).origin, ...extra]);
}

function withVary(res: Response): Response {
  res.headers.set("vary", "Accept");
  return res;
}

export async function POST(request: Request, { params }: Params) {
  const { org, name, id } = await params;
  const path = connectionPath(org, name, id);

  // DNS rebinding guard (MCP transport spec): a browser page on some other
  // origin must not be able to drive this endpoint. Checked on the MCP
  // branch only; the page branch is ordinary same-site browsing.
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return withVary(Response.json({ error: "forbidden", error_description: "Origin not allowed" }, { status: 403 }));
  }

  const conn = await findConnectionByPath(org, name, id);
  // Unknown and deleted connections get exactly the 401 a real one would
  // without a token (naming doc v2, section 8), so probing reveals nothing.
  if (!conn) return withVary(unauthorized(resourceMetadataUrl(path)));

  const sunset = await sunsetNotice(conn);
  if (sunset.state === "cutoff") return withVary(await serveSunset(request, sunset.text));
  const notice = { text: [movedNotice(conn), sunset.text].filter(Boolean).join(" ") };

  if (conn.authMode === "public") {
    const [ws, owner] = await Promise.all([
      db.query.workspace.findFirst({ where: eq(workspace.id, conn.workspaceId) }),
      db.query.organization.findFirst({ where: eq(organization.id, conn.organizationId) }),
    ]);
    if (!ws || !owner) return withVary(unauthorized(resourceMetadataUrl(path)));
    const ctx: McpContext = {
      organizationId: conn.organizationId,
      workspaceId: conn.workspaceId,
      organizationSlug: conn.orgSlug,
      organizationKind: accountType(owner.kind),
      workspaceName: ws.name,
      oauthClientId: null,
      userId: null,
      connectionId: conn.id,
      connectionName: conn.name,
      callerRole: "public",
      notice: notice.text || null,
    };
    // Anonymous callers share nothing but an address, so the budget is
    // per connection per IP.
    return withVary(await serveMcp(request, ctx, `pub:${conn.id}:${clientIp(request.headers)}`));
  }

  const ctx = await resolveBearerToken(request, { connectionId: conn.id, workspaceId: conn.workspaceId });
  if (!ctx) return withVary(unauthorized(resourceMetadataUrl(path)));
  ctx.notice = notice.text || null;
  ctx.connectionName = conn.name;
  return withVary(await serveMcp(request, ctx, `mcp:${ctx.userId}:${ctx.oauthClientId}:${conn.id}`));
}
