-- Catalog names v3 (project doc mcp-context-and-policy-v1, section 3).
--
-- Catalog tools are reached through zeqqat_search and zeqqat_run, never
-- tools/list, so they never meet an MCP client's name check. The wire name
-- and its 48-character budget (with a hash suffix when over it) go away:
-- agents pass the raw operationId (`name`) plus an instance, and the
-- canonical @org/target.http.action is built from `action`.

-- Undo the shortening: every action becomes the full sanitized
-- operationId again (same rule as sanitizeOperationId in
-- lib/tool-names.ts and migration 0006), collisions get _2, _3, oldest
-- first. A temporary value per row first, so the unique
-- (integration_id, action, major) constraint never sees two rows with the
-- same action halfway through.
UPDATE "api_endpoint" SET "action" = 'tmp_' || replace("id"::text, '-', '');--> statement-breakpoint
UPDATE "api_endpoint" e SET "action" = c."final_action"
FROM (
  SELECT
    x."id",
    CASE WHEN x."n" = 1 THEN x."base" ELSE x."base" || '_' || x."n" END AS "final_action"
  FROM (
    SELECT
      b."id",
      b."base",
      row_number() OVER (PARTITION BY b."integration_id", b."major", b."base" ORDER BY b."created_at", b."id") AS "n"
    FROM (
      SELECT
        ae."id",
        ae."integration_id",
        ae."major",
        ae."created_at",
        coalesce(
          nullif(btrim(regexp_replace(regexp_replace(lower(regexp_replace(ae."name", '([a-z0-9])([A-Z])', '\1_\2', 'g')), '[^a-z0-9]', '_', 'g'), '_+', '_', 'g'), '_'), ''),
          btrim(regexp_replace(regexp_replace(lower(ae."method" || ' ' || ae."path"), '[^a-z0-9]', '_', 'g'), '_+', '_', 'g'), '_')
        ) AS "base"
      FROM "api_endpoint" ae
    ) b
  ) x
) c
WHERE c."id" = e."id";--> statement-breakpoint
ALTER TABLE "api_endpoint" DROP CONSTRAINT "api_endpoint_wire_name_unique";--> statement-breakpoint
ALTER TABLE "api_endpoint" DROP COLUMN "wire_name";
