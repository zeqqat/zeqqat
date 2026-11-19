import { CountHead, NewWorkspaceButton, WorkspaceGrid } from "../../../components/AccountPages";
import { workspaceCards } from "../../../lib/accounts";
import { requireWorkspace } from "../../../lib/guard";
import { listUserWorkspaces } from "../../../lib/workspace";

// An account's workspaces (personal account or organization). A card opens
// that workspace; its owners add new ones.
export default async function AccountWorkspacesPage() {
  const { user, ws } = await requireWorkspace();
  const cards = await workspaceCards(ws.organizationId, await listUserWorkspaces(user.id));
  return (
    <div>
      <CountHead n={cards.length} one="workspace" many="workspaces">
        {ws.orgRole === "owner" && <NewWorkspaceButton account={ws.organizationSlug} />}
      </CountHead>
      <WorkspaceGrid cards={cards} />
    </div>
  );
}
