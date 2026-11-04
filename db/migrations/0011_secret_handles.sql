CREATE TABLE "secret_handle" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"instance_id" uuid,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secret_handle" ADD CONSTRAINT "secret_handle_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_handle" ADD CONSTRAINT "secret_handle_instance_id_instance_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secret_handle_expires_idx" ON "secret_handle" USING btree ("expires_at");