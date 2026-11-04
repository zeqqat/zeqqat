CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_check" CHECK ("invitation"."role" in ('owner','member'))
);
--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "last_version" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "last_status" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "setup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Instances added before this migration had no workspace-default grant row,
-- which the executor reads as "nothing allowed". Give each one the same
-- default a newly added instance now gets: read, create and edit on,
-- delete off.
INSERT INTO "instance_grant" ("id", "workspace_id", "instance_id", "oauth_client_id")
SELECT gen_random_uuid(), i."workspace_id", i."id", NULL
FROM "instance" i
WHERE NOT EXISTS (
  SELECT 1 FROM "instance_grant" g WHERE g."instance_id" = i."id" AND g."oauth_client_id" IS NULL
);
