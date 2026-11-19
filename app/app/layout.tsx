import { count, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { AppShell, type MenuState } from "../../components/AppShell";
import { HttpsBanner, type HttpsBannerMode } from "../../components/HttpsBanner";
import { db } from "../../db";
import { instance } from "../../db/schema";
import { devToolsEnabled } from "../../lib/dev-tools";
import { pastUsersOf } from "../../lib/dev-users";
import { servedWithoutHttps } from "../../lib/auth-scheme";
import { edition, siteHost } from "../../lib/edition";
import { canGetCertificate } from "../../lib/self-https";
import { APP_VERSION } from "../../lib/version";
import { requireWorkspace } from "../../lib/guard";
import { firstAdminOf } from "../../lib/overview";
import { accountsFor, ownersOf } from "../../lib/accounts";
import { listUserWorkspaces } from "../../lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ws } = await requireWorkspace();
  const all = await listUserWorkspaces(user.id);
  // Your own account first, then the organizations you're in.
  const accounts = accountsFor(all, user.id, await ownersOf([...new Set(all.map((w) => w.organizationId))]));
  const currentAccount = accounts.find((a) => a.id === ws.organizationId) ?? accounts[0];
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
  // A workspace with no Dokploy yet opens only the overview and Releases
  // (lib/setup-gate.ts). An admin is told to connect it; anyone else can't,
  // so they are told who to ask.
  const [{ n: instanceCount }] = await db.select({ n: count() }).from(instance).where(eq(instance.workspaceId, ws.workspaceId));
  const needsDokploy = instanceCount === 0;
  const askAdmin = needsDokploy && ws.role !== "owner" ? ((await firstAdminOf(ws.organizationId, ws.workspaceId)) ?? { name: "", username: null }) : null;
  const devTools = devToolsEnabled() ? { pastUsers: await pastUsersOf(user) } : null;
  // Self-hosted and reached over plain http: sign-in works, but agents like
  // Claude need https, so say so (components/HttpsBanner.tsx).
  let httpsMode: HttpsBannerMode | null = null;
  if (edition() !== "cloud" && servedWithoutHttps(await headers())) {
    const isAdmin = ws.wsRole === "admin";
    httpsMode = !canGetCertificate(siteHost()) ? "no-cert" : !isAdmin ? "ask" : needsDokploy ? "connect" : "fix";
  }

  return (
    <div className="zq">
      <AppShell
        user={{ name: user.name, email: user.email, image: user.image ?? null, username }}
        edition={edition()}
        version={APP_VERSION}
        accounts={accounts}
        currentAccount={currentAccount}
        workspaces={inOrg}
        canCreateWorkspace={ws.orgRole === "owner"}
        currentWorkspace={{ id: ws.workspaceId, slug: ws.workspaceSlug, name: ws.workspaceName, role: ws.wsRole }}
        initialMenu={initialMenu}
        devTools={devTools}
        needsDokploy={needsDokploy}
        askAdmin={askAdmin}
      >
        {httpsMode && <HttpsBanner mode={httpsMode} />}
        {children}
      </AppShell>
    </div>
  );
}
