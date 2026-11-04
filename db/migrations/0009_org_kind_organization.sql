ALTER TABLE "organization" DROP CONSTRAINT "organization_kind_check";--> statement-breakpoint
UPDATE "organization" SET "kind" = 'organization' WHERE "kind" = 'team';--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_kind_check" CHECK ("organization"."kind" in ('personal','organization'));
