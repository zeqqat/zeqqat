import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { AppShell, type MenuState } from "../../components/AppShell";
import { db } from "../../db";
import { instance } from "../../db/schema";
import { devToolsEnabled } from "../../lib/dev-tools";
import { pastUsersOf } from "../../lib/dev-users";
import { edition } from "../../lib/edition";
import { APP_VERSION } from "../../lib/version";
import { requireWorkspace } from "../../lib/guard";
import { listUserWorkspaces, orgsOf } from "../../lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ws } = await requireWorkspace();
  const all = await listUserWorkspaces(user.id);
  const orgs = orgsOf(all).map((o) => ({ id: o.id, slug: o.slug, name: o.name }));
  const inOrg = all
    .filter((w) => w.organizationId === ws.organizationId)
    .map((w) => ({ id: w.workspaceId, slug: w.workspaceSlug, name: w.workspaceName, role: w.wsRole }));
  // The user's handle is the slug of the personal org created at sign-up.
  const personal = all.find((w) => w.organizationKind === "personal" && w.orgRole === "owner");
  const username = personal?.organizationSlug ?? user.email.split("@")[0];
  const menuCookie = (await cookies()).get("zq_menu")?.value;
  const initialMenu: MenuState = menuCookie === "open" || menuCookie === "closed" ? menuCookie : null;
  // Dev installs only (ZEQQAT_DEV_TOOLS=1, never zeqqat.com): start over as
  // a new user, or switch back to an earlier one. See lib/dev-tools.ts.
  // A workspace admin with no Dokploy yet sees only the connect screen and
  // Releases (lib/setup-gate.ts). Members never connect Dokploy themselves,
  // so they are not held back.
  const [{ n: instanceCount }] = await db.select({ n: count() }).from(instance).where(eq(instance.workspaceId, ws.workspaceId));
  const needsDokploy = ws.role === "owner" && instanceCount === 0;
  const devTools = devToolsEnabled() ? { pastUsers: await pastUsersOf(user) } : null;

  return (
    <div className="zq">
      <AppShell
        user={{ name: user.name, email: user.email, image: user.image ?? null, username }}
        edition={edition()}
        version={APP_VERSION}
        orgs={orgs}
        currentOrg={{ id: ws.organizationId, slug: ws.organizationSlug, name: ws.organizationName }}
        workspaces={inOrg}
        currentWorkspace={{ id: ws.workspaceId, slug: ws.workspaceSlug, name: ws.workspaceName, role: ws.wsRole }}
        initialMenu={initialMenu}
        devTools={devTools}
        needsDokploy={needsDokploy}
      >
        {children}
      </AppShell>
    </div>
  );
}
