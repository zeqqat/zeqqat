CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_id" text NOT NULL,
	"auth_mode" text DEFAULT 'members' NOT NULL,
	"description" text,
	"sunset_at" timestamp with time zone,
	"sunset_message" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_org_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "connection_auth_mode_check" CHECK ("connection"."auth_mode" in ('members','public')),
	CONSTRAINT "connection_name_check" CHECK ("connection"."name" ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "connection_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"allow_read" boolean DEFAULT true NOT NULL,
	"allow_create" boolean DEFAULT true NOT NULL,
	"allow_edit" boolean DEFAULT true NOT NULL,
	"allow_delete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_grant_unique" UNIQUE("connection_id","instance_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_ws_user_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "workspace_member_role_check" CHECK ("workspace_member"."role" in ('admin','member','viewer'))
);
--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "workspace_role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_authorization_code" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_grant" ADD CONSTRAINT "connection_grant_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_grant" ADD CONSTRAINT "connection_grant_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_code" ADD CONSTRAINT "oauth_authorization_code_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing org member joins every workspace of their org.
-- Org owners are implicit admins and need no row; members become members.
INSERT INTO "workspace_member" ("id", "workspace_id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), w."id", m."user_id", 'member', m."created_at"
FROM "membership" m
JOIN "workspace" w ON w."organization_id" = m."organization_id"
WHERE m."role" = 'member'
ON CONFLICT DO NOTHING;
