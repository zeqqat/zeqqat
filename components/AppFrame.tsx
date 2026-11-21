import { count, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { AppShell, type MenuState } from "./AppShell";
import { HttpsBanner, type HttpsBannerMode } from "./HttpsBanner";
import { db } from "../db";
import { instance, integration, organization } from "../db/schema";
import { devToolsEnabled } from "../lib/dev-tools";
import { pastUsersOf } from "../lib/dev-users";
import { servedWithoutHttps } from "../lib/auth-scheme";
import { edition, siteHost } from "../lib/edition";
import { canGetCertificate } from "../lib/self-https";
import { APP_VERSION } from "../lib/version";
import { requireWorkspace } from "../lib/guard";
import { firstAdminOf } from "../lib/overview";
import { accountsFor, ownersOf } from "../lib/accounts";
import { hasOwnAgent, listUserWorkspaces } from "../lib/workspace";
import { pendingInvitesFor } from "../lib/setup";

import { accountBase, wsBase } from "../lib/paths";

import { inWorkspace } from "../lib/instance-scope";
// The signed-in frame (top bar, side menu, Connect Dokploy gate) around
// every dashboard page. `level` is which menu shows: a workspace's pages,
// an account's own pages, or your profile (workspace menu, never gated).
export type FrameLevel = "workspace" | "account" | "profile";

export async function AppFrame({ level, children }: { level: FrameLevel; children: React.ReactNode }) {
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
  const [{ n: instanceCount }] = await db.select({ n: count() }).from(instance).where(inWorkspace(ws.workspaceId));
  const needsDokploy = instanceCount === 0;
  const askAdmin = needsDokploy && ws.role !== "owner" ? ((await firstAdminOf(ws.organizationId, ws.workspaceId)) ?? { name: "", username: null }) : null;
  // Setup on the person's own account (lib/setup.ts). Until it's done they
  // see only Setup, unless they joined someone else's organization.
  let setup: { href: string; locked: boolean } | null = null;
  if (personal) {
    const [own] = await db.select({ done: organization.setupCompletedAt }).from(organization).where(eq(organization.id, personal.organizationId));
    if (own && !own.done) {
      const joinedElsewhere = all.some((w) => w.organizationId !== personal.organizationId);
      setup = { href: `/${personal.organizationSlug}/setup`, locked: !joinedElsewhere };
    }
  }
  // A member's first stop in a workspace is connecting their own agent.
  const needsAgent = level === "workspace" && ws.wsRole !== "admin" && !(await hasOwnAgent(ws.workspaceId, user.id));
  const accountInstances =
    ws.orgRole === "owner"
      ? (
          await db
            .select({ id: instance.id, alias: instance.alias, baseUrl: instance.baseUrl, appSlug: integration.slug, appName: integration.name, appLogo: integration.logoUrl })
            .from(instance)
            .innerJoin(integration, eq(integration.id, instance.integrationId))
            .where(eq(instance.organizationId, ws.organizationId))
        ).map(({ baseUrl, ...r }) => ({ ...r, host: baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") }))
      : [];
  const invites = (await pendingInvitesFor(user.id)).map((v) => ({ id: v.id, orgSlug: v.orgSlug, orgName: v.orgName, inviter: v.inviterName }));
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
        needsDokploy={needsDokploy && !setup?.locked}
        askAdmin={askAdmin}
        setup={setup}
        accountInstances={accountInstances}
        invites={invites}
        needsAgent={needsAgent}
        level={level}
        wsBase={wsBase(ws.organizationSlug, ws.workspaceSlug)}
        accountBase={accountBase(ws.organizationSlug)}
      >
        {httpsMode && <HttpsBanner mode={httpsMode} />}
        {children}
      </AppShell>
    </div>
  );
}
