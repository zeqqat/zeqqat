import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { instance, workspaceInstance } from "../db/schema";

// An instance belongs to an account; a workspace reaches only the ones the
// account gave it (workspace_instance). These are the WHERE clauses for
// "the instances this workspace can use".
export function inWorkspace(workspaceId: string) {
  return inArray(
    instance.id,
    db.select({ id: workspaceInstance.instanceId }).from(workspaceInstance).where(eq(workspaceInstance.workspaceId, workspaceId)),
  );
}

export function inWorkspaces(workspaceIds: string[]) {
  return inArray(
    instance.id,
    db
      .select({ id: workspaceInstance.instanceId })
      .from(workspaceInstance)
      .where(inArray(workspaceInstance.workspaceId, workspaceIds.length ? workspaceIds : ["00000000-0000-0000-0000-000000000000"])),
  );
}
