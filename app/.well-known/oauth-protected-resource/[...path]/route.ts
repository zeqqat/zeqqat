import { connectionPath, parseConnectionPath } from "../../../../lib/connections";
import { publicUrl } from "../../../../lib/env";

export const dynamic = "force-dynamic";

// RFC 9728 with a path suffix (naming doc v2, section 9): the metadata for
// one connection URL, at
// /.well-known/oauth-protected-resource/<org>/mcp/<name>/<id>. Its
// `resource` equals the connection URL exactly; the client sends that back
// as `resource` on /oauth/authorize (RFC 8707), which is how a sign-in, and
// so its token, gets bound to this one connection and no other.
//
// Answered for every well-formed connection path, whether or not the
// connection exists, the same as the 401 that points here: a lookup here
// must not reveal more than probing the URL itself does. Sign-in for a
// connection that doesn't exist fails later, at /oauth/authorize.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const parsed = parseConnectionPath(`/${path.join("/")}`);
  if (!parsed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    resource: `${publicUrl()}${connectionPath(parsed.org, parsed.name, parsed.shortId)}`,
    authorization_servers: [publicUrl()],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  });
}
