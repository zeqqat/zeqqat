import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "../../../lib/session";
import { accountBase, PROFILE_PATH, wsBase } from "../../../lib/paths";
import { getUserWorkspace } from "../../../lib/workspace";

// /app is "take me to my dashboard": the workspace you were last in. The
// dashboard itself lives at /<username>/<workspace>/... (lib/paths.ts), and
// the old /app/... addresses land on the same page there.
//   /app/org/...   -> /<username>/...   (the account level)
//   /app/team      -> .../members
//   /app/account   -> /account
// A relative Location: behind Dokploy's proxy the request's own URL is the
// container's address (0.0.0.0:3000), never the site's.
function go(path: string) {
  return new NextResponse(null, { status: 307, headers: { location: path, "cache-control": "private, no-store" } });
}

async function handle(request: NextRequest, { params }: { params: Promise<{ rest?: string[] }> }) {
  const rest = (await params).rest ?? [];
  const search = request.nextUrl.search;
  const session = await getServerSession();
  if (!session?.user) {
    return go(`/signin?next=${encodeURIComponent(request.nextUrl.pathname + search)}`);
  }
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return go("/signin");
  let to: string;
  if (rest[0] === "org") to = accountBase(ws.organizationSlug) + (rest.length > 1 ? `/${rest.slice(1).join("/")}` : "");
  else if (rest[0] === "account") to = PROFILE_PATH;
  else {
    const parts = rest[0] === "team" ? ["members", ...rest.slice(1)] : rest;
    to = wsBase(ws.organizationSlug, ws.workspaceSlug) + (parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : "");
  }
  return go(to + search);
}

export const GET = handle;
export const HEAD = handle;
