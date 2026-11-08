CREATE TABLE "endpoint_keyword_hit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"api_endpoint_id" uuid NOT NULL,
	"word" text NOT NULL,
	"request_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endpoint_keyword_hit_unique" UNIQUE("api_endpoint_id","word","request_id"),
	CONSTRAINT "endpoint_keyword_hit_word_check" CHECK ("endpoint_keyword_hit"."word" ~ '^[a-z]{3,20}$')
);
--> statement-breakpoint
CREATE TABLE "summary_suggestion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"api_endpoint_id" uuid NOT NULL,
	"publisher_organization_id" uuid NOT NULL,
	"from_organization_id" uuid NOT NULL,
	"user_id" uuid,
	"request_id" uuid,
	"current_summary" text,
	"suggested_summary" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_suggestion_status_check" CHECK ("summary_suggestion"."status" in ('pending','accepted','rejected')),
	CONSTRAINT "summary_suggestion_length_check" CHECK (char_length("summary_suggestion"."suggested_summary") between 10 and 120)
);
--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "summary_source" text DEFAULT 'spec' NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoint_keyword_hit" ADD CONSTRAINT "endpoint_keyword_hit_api_endpoint_id_api_endpoint_id_fk" FOREIGN KEY ("api_endpoint_id") REFERENCES "public"."api_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_keyword_hit" ADD CONSTRAINT "endpoint_keyword_hit_request_id_agent_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."agent_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_keyword_hit" ADD CONSTRAINT "endpoint_keyword_hit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_api_endpoint_id_api_endpoint_id_fk" FOREIGN KEY ("api_endpoint_id") REFERENCES "public"."api_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_publisher_organization_id_organization_id_fk" FOREIGN KEY ("publisher_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_from_organization_id_organization_id_fk" FOREIGN KEY ("from_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_request_id_agent_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."agent_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_suggestion" ADD CONSTRAINT "summary_suggestion_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endpoint_keyword_hit_word_idx" ON "endpoint_keyword_hit" USING btree ("word");--> statement-breakpoint
CREATE INDEX "summary_suggestion_publisher_status_idx" ON "summary_suggestion" USING btree ("publisher_organization_id","status");--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_summary_source_check" CHECK ("api_endpoint"."summary_source" in ('spec','accepted'));