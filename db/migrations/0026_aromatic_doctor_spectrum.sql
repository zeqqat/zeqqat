CREATE TABLE "cloud_handoff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"report" text NOT NULL,
	"cloud_host" text NOT NULL,
	"claim_token" jsonb NOT NULL,
	"cloud_key_hint" jsonb,
	"instance_alias" text NOT NULL,
	"choice" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_handoff" ADD CONSTRAINT "cloud_handoff_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;