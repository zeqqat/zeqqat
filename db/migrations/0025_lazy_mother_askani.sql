CREATE TABLE "selfhost_install" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"instance_id" uuid,
	"compose_id" text NOT NULL,
	"address" text NOT NULL,
	"claim_hash" text NOT NULL,
	"claim_token" jsonb NOT NULL,
	"own_key" boolean DEFAULT false NOT NULL,
	"key_choice" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "key_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "key_deleted_for" text;--> statement-breakpoint
ALTER TABLE "selfhost_install" ADD CONSTRAINT "selfhost_install_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selfhost_install" ADD CONSTRAINT "selfhost_install_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selfhost_install" ADD CONSTRAINT "selfhost_install_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "selfhost_install_claim_hash_uq" ON "selfhost_install" USING btree ("claim_hash");--> statement-breakpoint
CREATE INDEX "selfhost_install_org_idx" ON "selfhost_install" USING btree ("organization_id");