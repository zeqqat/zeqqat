ALTER TABLE "instance" DROP CONSTRAINT "instance_workspace_alias_unique";--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_workspace_id_workspace_id_fk";
--> statement-breakpoint
ALTER TABLE "instance" DROP COLUMN "workspace_id";--> statement-breakpoint
UPDATE "instance" i SET "alias" = i."alias" || '-' || d.n FROM (SELECT "id", row_number() OVER (PARTITION BY "organization_id", "alias" ORDER BY "created_at", "id") AS n FROM "instance") d WHERE d."id" = i."id" AND d.n > 1;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_org_alias_unique" UNIQUE("organization_id","alias");