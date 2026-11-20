ALTER TABLE "api_endpoint" ADD COLUMN "kind_source" text DEFAULT 'spec' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "spec_version" text;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "spec_ops" jsonb;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "spec_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_kind_source_check" CHECK ("api_endpoint"."kind_source" in ('spec','accepted'));