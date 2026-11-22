ALTER TABLE "instance" ADD COLUMN "key_deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "key_deactivated_for" text;