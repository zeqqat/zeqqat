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
import { requireAccount, requireWorkspace } from "../lib/guard";
import { firstAdminOf } from "../lib/overview";
import { accountsFor } from "../lib/accounts";
import { hasOwnAgent, listUserAccounts, listUserWorkspaces, type UserAccount, type UserWorkspace } from "../lib/workspace";
import { pendingInvitesFor } from "../lib/setup";

import { accountBase, wsBase } from "../lib/paths";

import { inWorkspace } from "../lib/instance-scope";
// The signed-in frame (top bar, side menu, Connect Dokploy gate) around
// every dashboard page. `level` is which menu shows: a workspace's pages,
// an account's own pages, or your profile (workspace menu, never gated).
export type FrameLevel = "workspace" | "account" | "profile";

export async function AppFrame({ level, children }: { level: FrameLevel; children: React.ReactNode }) {
  // A workspace's pages need the workspace; an account's pages (and your
  // profile) work before the account has any workspace.
  const ctx = level === "workspace" ? await requireWorkspace() : await requireAccount();
  const { user } = ctx;
  const ws: UserWorkspace | null = ctx.ws;
  const acct: UserAccount =
    "acct" in ctx
      ? ctx.acct
      : {
          organizationId: ctx.ws.organizationId,
          organizationSlug: ctx.ws.organizationSlug,
          organizationName: ctx.ws.organizationName,
          organizationKind: ctx.ws.organizationKind,
          orgRole: ctx.ws.orgRole,
          ownerUserId: null,
        };
  const allAccounts = await listUserAccounts(user.id);
  const all = await listUserWorkspaces(user.id);
  // Your own account first, then the organizations you're in.
  const accounts = accountsFor(allAccounts, user.id);
  const currentAccount = accounts.find((a) => a.id === acct.organizationId) ?? accounts[0];
  const inOrg = all
    .filter((w) => w.organizationId === acct.organizationId)
    .map((w) => ({ id: w.workspaceId, slug: w.workspaceSlug, name: w.workspaceName, role: w.wsRole }));
  // The user's handle is the slug of the personal account made at sign-up.
  const personal = allAccounts.find((a) => a.organizationKind === "personal" && a.ownerUserId === user.id);
  const username = personal?.organizationSlug ?? user.email.split("@")[0];
  const menuCookie = (await cookies()).get("zq_menu")?.value;
  const initialMenu: MenuState = menuCookie === "open" || menuCookie === "closed" ? menuCookie : null;
  // A workspace with no Dokploy yet opens only the overview and Releases
  // (lib/setup-gate.ts). An admin is told to connect it; anyone else can't,
  // so they are told who to ask.
  let needsDokploy = false;
  let askAdmin: { name: string; username: string | null } | null = null;
  if (ws) {
    const [{ n: instanceCount }] = await db.select({ n: count() }).from(instance).where(inWorkspace(ws.workspaceId));
    needsDokploy = instanceCount === 0;
    askAdmin = needsDokploy && ws.role !== "owner" ? ((await firstAdminOf(ws.organizationId, ws.workspaceId)) ?? { name: "", username: null }) : null;
  }
  // Setup on the person's own account (lib/setup.ts). Until it's done they
  // see only Setup, unless they joined someone else's organization.
  let setup: { href: string; locked: boolean } | null = null;
  if (personal) {
    const [own] = await db.select({ done: organization.setupCompletedAt }).from(organization).where(eq(organization.id, personal.organizationId));
    if (own && !own.done) {
      const joinedElsewhere = allAccounts.some((a) => a.organizationId !== personal.organizationId);
      setup = { href: `/${personal.organizationSlug}/setup`, locked: !joinedElsewhere };
    }
  }
  // A member's first stop in a workspace is connecting their own agent.
  const needsAgent = level === "workspace" && !!ws && ws.wsRole !== "admin" && !(await hasOwnAgent(ws.workspaceId, user.id));
  const accountInstances =
    acct.orgRole === "owner"
      ? (
          await db
            .select({ id: instance.id, alias: instance.alias, baseUrl: instance.baseUrl, appSlug: integration.slug, appName: integration.name, appLogo: integration.logoUrl })
            .from(instance)
            .innerJoin(integration, eq(integration.id, instance.integrationId))
            .where(eq(instance.organizationId, acct.organizationId))
        ).map(({ baseUrl, ...r }) => ({ ...r, host: baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") }))
      : [];
  const invites = (await pendingInvitesFor(user.id)).map((v) => ({ id: v.id, orgSlug: v.orgSlug, orgName: v.orgName, inviter: v.inviterName }));
  const devTools = devToolsEnabled() ? { pastUsers: await pastUsersOf(user) } : null;
  // Self-hosted and reached over plain http: sign-in works, but agents like
  // Claude need https, so say so (components/HttpsBanner.tsx).
  let httpsMode: HttpsBannerMode | null = null;
  if (edition() !== "cloud" && servedWithoutHttps(await headers())) {
    const isAdmin = ws ? ws.wsRole === "admin" : acct.orgRole === "owner";
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
        canCreateWorkspace={acct.orgRole === "owner"}
        currentWorkspace={ws ? { id: ws.workspaceId, slug: ws.workspaceSlug, name: ws.workspaceName, role: ws.wsRole } : null}
        initialMenu={initialMenu}
        devTools={devTools}
        needsDokploy={needsDokploy && !setup?.locked}
        askAdmin={askAdmin}
        setup={setup}
        accountInstances={accountInstances}
        invites={invites}
        needsAgent={needsAgent}
        level={ws ? level : "account"}
        wsBase={ws ? wsBase(ws.organizationSlug, ws.workspaceSlug) : accountBase(acct.organizationSlug)}
        accountBase={accountBase(acct.organizationSlug)}
      >
        {httpsMode && <HttpsBanner mode={httpsMode} />}
        {children}
      </AppShell>
    </div>
  );
}
