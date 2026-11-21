import { CountHead, NewWorkspaceButton, WorkspaceGrid } from "../../components/AccountPages";
import { workspaceCards } from "../../lib/accounts";
import { requireWorkspace } from "../../lib/guard";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { instance, integration, workspace } from "../../db/schema";
import { listUserWorkspaces } from "../../lib/workspace";

// An account's workspaces (personal account or organization). A card opens
// that workspace; its owners add new ones.
export default async function AccountWorkspacesPage() {
  const { user, ws } = await requireWorkspace();
  const cards = await workspaceCards(ws.organizationId, await listUserWorkspaces(user.id));
  const isOwner = ws.orgRole === "owner";
  const [insts, slugs] = isOwner
    ? await Promise.all([
        db
          .select({ id: instance.id, alias: instance.alias, baseUrl: instance.baseUrl, appSlug: integration.slug, appName: integration.name, appLogo: integration.logoUrl })
          .from(instance)
          .innerJoin(integration, eq(integration.id, instance.integrationId))
          .where(eq(instance.organizationId, ws.organizationId)),
        db.select({ slug: workspace.slug }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)),
      ])
    : [[], []];
  const instances = insts.map(({ baseUrl, ...r }) => ({ ...r, host: baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") }));
  return (
    <div>
      <CountHead n={cards.length} one="workspace" many="workspaces">
        {isOwner && <NewWorkspaceButton account={ws.organizationSlug} instances={instances} existing={slugs.map((x) => x.slug)} />}
      </CountHead>
      <WorkspaceGrid cards={cards} />
    </div>
  );
}
