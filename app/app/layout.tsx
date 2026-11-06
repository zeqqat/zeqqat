import { cookies } from "next/headers";
import { AppShell, type MenuState } from "../../components/AppShell";
import { edition, siteHost } from "../../lib/edition";
import { APP_VERSION } from "../../lib/version";
import { requireWorkspace } from "../../lib/guard";
import { listUserWorkspaces, orgsOf } from "../../lib/workspace";
import { isOperator } from "../../lib/operator";

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
  const operator = await isOperator(user.id);
  const initialMenu: MenuState = menuCookie === "open" || menuCookie === "closed" ? menuCookie : null;

  return (
    <div className="zq">
      <AppShell
        user={{ name: user.name, email: user.email, image: user.image ?? null, username }}
        edition={edition()}
        version={APP_VERSION}
        siteHost={siteHost()}
        orgs={orgs}
        currentOrg={{ id: ws.organizationId, slug: ws.organizationSlug, name: ws.organizationName }}
        workspaces={inOrg}
        currentWorkspace={{ id: ws.workspaceId, slug: ws.workspaceSlug, name: ws.workspaceName, role: ws.wsRole }}
        initialMenu={initialMenu}
        operator={operator}
      >
        {children}
      </AppShell>
    </div>
  );
}
