CREATE TABLE "tools_seen" (
	"key" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"notified" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
