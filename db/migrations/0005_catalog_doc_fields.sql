-- Catalog tables follow section 8 of the Project context doc: org-scoped
-- integrations, hashed spec snapshots, endpoints that are flagged rather
-- than deleted when they leave the spec, and pinned/protected instances.
--
-- Existing catalog rows (the Dokploy catalog loaded before an importer
-- existed) need an owning org. They go to the org with slug "zeqqat" if
-- there is one, otherwise to the oldest org (the operator's own), and are
-- marked official so the app keeps offering them.

-- integration ---------------------------------------------------------------
ALTER TABLE "integration" DROP CONSTRAINT "integration_slug_unique";--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "official" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "integration" SET
  "organization_id" = (
    SELECT o."id" FROM "organization" o
    ORDER BY (o."slug" = 'zeqqat') DESC, o."created_at" ASC
    LIMIT 1
  ),
  "official" = true
WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "integration" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_org_slug_unique" UNIQUE("organization_id","slug");--> statement-breakpoint

-- integration_api_spec_snapshot ----------------------------------------------
ALTER TABLE "integration_api_spec_snapshot" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ADD COLUMN "release" text;--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ADD COLUMN "hash" text;--> statement-breakpoint
UPDATE "integration_api_spec_snapshot" s SET
  "organization_id" = i."organization_id",
  "hash" = encode(sha256(convert_to(coalesce(s."raw_spec"::text, s."id"::text), 'UTF8')), 'hex')
FROM "integration" i
WHERE i."id" = s."integration_id";--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ALTER COLUMN "hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ADD CONSTRAINT "integration_api_spec_snapshot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_spec_snapshot" ADD CONSTRAINT "integration_api_spec_snapshot_hash_unique" UNIQUE("integration_id","hash");--> statement-breakpoint

-- api_endpoint ----------------------------------------------------------------
ALTER TABLE "api_endpoint" RENAME COLUMN "snapshot_id" TO "last_snapshot_id";--> statement-breakpoint
ALTER TABLE "api_endpoint" RENAME CONSTRAINT "api_endpoint_snapshot_id_integration_api_spec_snapshot_id_fk" TO "api_endpoint_last_snapshot_id_integration_api_spec_snapshot_id_fk";--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "import_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "api_endpoint" e SET "organization_id" = i."organization_id"
FROM "integration" i
WHERE i."id" = e."integration_id";--> statement-breakpoint
ALTER TABLE "api_endpoint" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_integration_name_unique" UNIQUE("integration_id","name");--> statement-breakpoint

-- instance --------------------------------------------------------------------
ALTER TABLE "instance" ADD COLUMN "pinned_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_pinned_snapshot_id_integration_api_spec_snapshot_id_fk" FOREIGN KEY ("pinned_snapshot_id") REFERENCES "public"."integration_api_spec_snapshot"("id") ON DELETE set null ON UPDATE no action;
