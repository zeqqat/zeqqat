CREATE TABLE "connection_alias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_alias_org_name_short_id_unique" UNIQUE("organization_id","name","short_id")
);
--> statement-breakpoint
CREATE TABLE "policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"allow" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spec_release" text,
	"version" integer DEFAULT 1 NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"copied_from_policy_id" uuid,
	"copied_from_name" text,
	"copied_from_version" integer,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_org_integration_name_unique" UNIQUE("organization_id","integration_id","name"),
	CONSTRAINT "policy_name_check" CHECK ("policy"."name" ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
	CONSTRAINT "policy_visibility_check" CHECK ("policy"."visibility" in ('public','private')),
	CONSTRAINT "policy_allow_check" CHECK (jsonb_typeof("policy"."allow") = 'array')
);
--> statement-breakpoint
CREATE TABLE "policy_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"description" text NOT NULL,
	"allow" jsonb NOT NULL,
	"spec_release" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_revision_policy_version_unique" UNIQUE("policy_id","version")
);
--> statement-breakpoint
CREATE TABLE "workspace_policy" (
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_policy_workspace_id_policy_id_pk" PRIMARY KEY("workspace_id","policy_id")
);
--> statement-breakpoint
ALTER TABLE "connection_grant" ADD COLUMN "policy_id" uuid;--> statement-breakpoint
ALTER TABLE "connection_alias" ADD CONSTRAINT "connection_alias_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_alias" ADD CONSTRAINT "connection_alias_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_copied_from_policy_id_policy_id_fk" FOREIGN KEY ("copied_from_policy_id") REFERENCES "public"."policy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_revision" ADD CONSTRAINT "policy_revision_policy_id_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_revision" ADD CONSTRAINT "policy_revision_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policy" ADD CONSTRAINT "workspace_policy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policy" ADD CONSTRAINT "workspace_policy_policy_id_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_grant" ADD CONSTRAINT "connection_grant_policy_id_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policy"("id") ON DELETE restrict ON UPDATE no action;