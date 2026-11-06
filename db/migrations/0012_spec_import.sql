ALTER TABLE "api_endpoint" ADD COLUMN "query_params" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD COLUMN "body_encoding" text DEFAULT 'json' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "spec_url" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "docs_url" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "default_base_url" text;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_body_encoding_check" CHECK ("api_endpoint"."body_encoding" in ('json','form'));