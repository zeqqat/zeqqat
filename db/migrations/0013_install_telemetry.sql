CREATE TABLE "install_identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_install" (
	"install_id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ping_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telemetry_install_last_seen_idx" ON "telemetry_install" USING btree ("last_seen_at");