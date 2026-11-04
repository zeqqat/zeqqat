CREATE TABLE "agent_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"oauth_client_id" uuid,
	"connection_id" uuid,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_call_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_log" DROP CONSTRAINT "call_log_outcome_check";--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "instance_alias" text;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "caller_role" text;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "policy_name" text;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "policy_version" integer;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "spec_release" text;--> statement-breakpoint
ALTER TABLE "call_log" ADD COLUMN "outbound_request" jsonb;--> statement-breakpoint
ALTER TABLE "agent_request" ADD CONSTRAINT "agent_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_request" ADD CONSTRAINT "agent_request_oauth_client_id_oauth_client_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_request" ADD CONSTRAINT "agent_request_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_request_lookup_idx" ON "agent_request" USING btree ("user_id","oauth_client_id","reason","last_call_at");--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_request_id_agent_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."agent_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_log_request_idx" ON "call_log" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "call_log_org_created_idx" ON "call_log" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_outcome_check" CHECK ("call_log"."outcome" in ('running','ok','error','blocked'));--> statement-breakpoint
UPDATE "call_log" SET "instance_alias" = "instance"."alias" FROM "instance" WHERE "call_log"."instance_id" = "instance"."id" AND "call_log"."instance_alias" IS NULL;
