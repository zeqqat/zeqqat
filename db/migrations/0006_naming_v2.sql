-- Naming and URL conventions v2 (project doc naming-and-urls-v2.md).
--
-- 1. Org slugs become lowercase snake_case: they are the first segment of
--    every wire tool name, where `-` is the segment separator.
-- 2. Every API endpoint gets its tool name stored as segments plus the
--    compiled wire name, written once here and never recomputed.
-- 3. Connection names stop being unique per org; (org, name, short id)
--    is unique instead, rows are soft-deleted so a short id is never
--    reused, and a sunset can point at the connection replacing it.

-- organization ---------------------------------------------------------------
-- Hyphens become underscores. If that collides with an existing slug, the
-- org keeps a short piece of its id so the rename is still unique.
UPDATE "organization" o SET "slug" = replace(o."slug", '-', '_')
WHERE o."slug" LIKE '%-%'
  AND NOT EXISTS (SELECT 1 FROM "organization" x WHERE x."slug" = replace(o."slug", '-', '_'));--> statement-breakpoint
UPDATE "organization" o SET "slug" = replace(o."slug", '-', '_') || '_' || substr(replace(o."id"::text, '-', ''), 1, 6)
WHERE o."slug" LIKE '%-%';--> statement-breakpoint
-- Anything else that isn't snake_case (leading/trailing/doubled
-- underscores, other characters) is normalized the same way.
UPDATE "organization" o SET "slug" = btrim(regexp_replace(regexp_replace(lower(o."slug"), '[^a-z0-9]+', '_', 'g'), '_+', '_', 'g'), '_')
WHERE o."slug" !~ '^[a-z0-9]+(_[a-z0-9]+)*$';--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_check" CHECK ("organization"."slug" ~ '^[a-z0-9]+(_[a-z0-9]+)*$');--> statement-breakpoint

-- integration ----------------------------------------------------------------
UPDATE "integration" i SET "slug" = btrim(regexp_replace(regexp_replace(lower(i."slug"), '[^a-z0-9]+', '_', 'g'), '_+', '_', 'g'), '_')
WHERE i."slug" !~ '^[a-z0-9]+(_[a-z0-9]+)*$';--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_slug_check" CHECK ("integration"."slug" ~ '^[a-z0-9]+(_[a-z0-9]+)*$');--> statement-breakpoint

-- api_endpoint ---------------------------------------------------------------
ALTER TABLE "api_endpoint" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "major" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "wire_name" text;--> statement-breakpoint

-- The action segment: the raw operationId sanitized exactly like
-- sanitizeOperationId in lib/tool-names.ts (split camelCase, lowercase,
-- every other character to `_`, collapse, trim), falling back to
-- method + path when that leaves nothing.
UPDATE "api_endpoint" e SET "action" = coalesce(
  nullif(btrim(regexp_replace(regexp_replace(lower(regexp_replace(e."name", '([a-z0-9])([A-Z])', '\1_\2', 'g')), '[^a-z0-9]', '_', 'g'), '_+', '_', 'g'), '_'), ''),
  btrim(regexp_replace(regexp_replace(lower(e."method" || ' ' || e."path"), '[^a-z0-9]', '_', 'g'), '_+', '_', 'g'), '_')
);--> statement-breakpoint

-- Collisions are resolved once, here: a second endpoint whose action came
-- out the same gets _2, a third _3, oldest first.
UPDATE "api_endpoint" e SET "action" = e."action" || '_' || d."n"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "integration_id", "action" ORDER BY "created_at", "id") AS "n"
  FROM "api_endpoint"
) d
WHERE d."id" = e."id" AND d."n" > 1;--> statement-breakpoint

-- Compile the wire name. Over 48 characters, the action is shortened and
-- given a 4-character hash suffix: the first 4 hex characters of sha256
-- over the canonical name, the same as compileWireName/nameHash.
UPDATE "api_endpoint" e SET
  "action" = c."final_action",
  "wire_name" = c."org_slug" || '-' || c."int_slug" || '-http-' || c."final_action" || '-v' || e."major"
FROM (
  SELECT
    x."id",
    x."org_slug",
    x."int_slug",
    CASE
      WHEN length(x."plain") <= 48 THEN x."action"
      ELSE coalesce(nullif(rtrim(left(x."action", 48 - (length(x."plain") - length(x."action")) - 5), '_'), '') || '_', '')
        || substr(encode(sha256(convert_to('@' || x."org_slug" || '/' || x."int_slug" || '.http.' || x."action", 'UTF8')), 'hex'), 1, 4)
    END AS "final_action"
  FROM (
    SELECT
      ae."id",
      ae."action",
      o."slug" AS "org_slug",
      i."slug" AS "int_slug",
      o."slug" || '-' || i."slug" || '-http-' || ae."action" || '-v' || ae."major" AS "plain"
    FROM "api_endpoint" ae
    JOIN "integration" i ON i."id" = ae."integration_id"
    JOIN "organization" o ON o."id" = i."organization_id"
  ) x
) c
WHERE c."id" = e."id";--> statement-breakpoint

ALTER TABLE "api_endpoint" ALTER COLUMN "action" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ALTER COLUMN "wire_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_integration_action_major_unique" UNIQUE("integration_id","action","major");--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_wire_name_unique" UNIQUE("wire_name");--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_action_check" CHECK ("api_endpoint"."action" ~ '^[a-z0-9]+(_[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_major_check" CHECK ("api_endpoint"."major" >= 1);--> statement-breakpoint

-- connection -----------------------------------------------------------------
ALTER TABLE "connection" DROP CONSTRAINT "connection_org_name_unique";--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "replaced_by_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_replaced_by_connection_id_connection_id_fk" FOREIGN KEY ("replaced_by_connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_org_name_short_id_unique" UNIQUE("organization_id","name","short_id");
