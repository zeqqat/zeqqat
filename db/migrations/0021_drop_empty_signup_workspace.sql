-- Sign-up used to make an empty "Default" workspace in every personal
-- account. Setup now makes the first workspace, so remove that leftover
-- wherever Setup isn't done and nothing was ever put in it.
DELETE FROM "workspace" w
USING "organization" o
WHERE w."organization_id" = o."id"
  AND o."kind" = 'personal'
  AND o."setup_completed_at" IS NULL
  AND w."slug" = 'default'
  AND NOT EXISTS (SELECT 1 FROM "workspace_instance" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "instance_grant" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "connection" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "workspace_member" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "invitation" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "oauth_grant" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "workspace_policy" x WHERE x."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "call_log" x WHERE x."workspace_id" = w."id");
