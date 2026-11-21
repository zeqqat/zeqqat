CREATE TABLE "connection_member" (
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_member_unique" UNIQUE("connection_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_instance" (
	"workspace_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_instance_unique" UNIQUE("workspace_id","instance_id")
);
--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "instance" i SET "organization_id" = w."organization_id" FROM "workspace" w WHERE w."id" = i."workspace_id";--> statement-breakpoint
ALTER TABLE "instance" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "setup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_member" ADD CONSTRAINT "connection_member_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_member" ADD CONSTRAINT "connection_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_instance" ADD CONSTRAINT "workspace_instance_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_instance" ADD CONSTRAINT "workspace_instance_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspace_instance" ("workspace_id", "instance_id") SELECT "workspace_id", "id" FROM "instance" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "connection_member" ("connection_id", "user_id") SELECT c."id", wm."user_id" FROM "connection" c JOIN "workspace_member" wm ON wm."workspace_id" = c."workspace_id" WHERE c."auth_mode" = 'members' ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "organization" o SET "setup_completed_at" = now() WHERE EXISTS (SELECT 1 FROM "instance" i WHERE i."organization_id" = o."id");