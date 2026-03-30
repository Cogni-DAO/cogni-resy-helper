CREATE TABLE "booking_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_request_id" uuid NOT NULL,
	"alert_receipt_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result_json" jsonb DEFAULT 'null'::jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reservation_alert_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid,
	"provider" text DEFAULT 'resy' NOT NULL,
	"gmail_message_id" text,
	"gmail_thread_id" text,
	"gmail_history_id" text,
	"gmail_dedup_key" text NOT NULL,
	"logical_alert_key" text NOT NULL,
	"restaurant" text NOT NULL,
	"party_size" integer NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"booking_url" text,
	"matched_watch_request_id" uuid,
	"payload_json" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_alert_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reservation_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_type" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"provider" text NOT NULL,
	"provider_account_email" text,
	"provider_subject" text,
	"access_token_ciphertext" text,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"session_state_ciphertext" text,
	"session_status" text,
	"last_verified_at" timestamp with time zone,
	"expires_hint_at" timestamp with time zone,
	"history_cursor" text,
	"watch_status" text DEFAULT 'inactive' NOT NULL,
	"watch_expiry_at" timestamp with time zone,
	"renewal_status" text DEFAULT 'healthy' NOT NULL,
	"metadata_json" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watch_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"watch_request_id" uuid,
	"connection_id" uuid,
	"alert_receipt_id" uuid,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"dedupe_key" text,
	"payload_json" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watch_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" text DEFAULT 'resy' NOT NULL,
	"restaurant" text NOT NULL,
	"restaurant_slug" text,
	"party_size" integer NOT NULL,
	"date_start" timestamp with time zone NOT NULL,
	"date_end" timestamp with time zone NOT NULL,
	"time_start" text NOT NULL,
	"time_end" text NOT NULL,
	"ideal_time" text,
	"hard_constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"soft_constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_claim" boolean DEFAULT false NOT NULL,
	"notify_setup_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_attempts" ADD CONSTRAINT "booking_attempts_watch_request_id_watch_requests_id_fk" FOREIGN KEY ("watch_request_id") REFERENCES "public"."watch_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_attempts" ADD CONSTRAINT "booking_attempts_alert_receipt_id_reservation_alert_receipts_id_fk" FOREIGN KEY ("alert_receipt_id") REFERENCES "public"."reservation_alert_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_alert_receipts" ADD CONSTRAINT "reservation_alert_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_alert_receipts" ADD CONSTRAINT "reservation_alert_receipts_connection_id_reservation_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."reservation_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_alert_receipts" ADD CONSTRAINT "reservation_alert_receipts_matched_watch_request_id_watch_requests_id_fk" FOREIGN KEY ("matched_watch_request_id") REFERENCES "public"."watch_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_connections" ADD CONSTRAINT "reservation_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_watch_request_id_watch_requests_id_fk" FOREIGN KEY ("watch_request_id") REFERENCES "public"."watch_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_connection_id_reservation_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."reservation_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_alert_receipt_id_reservation_alert_receipts_id_fk" FOREIGN KEY ("alert_receipt_id") REFERENCES "public"."reservation_alert_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_requests" ADD CONSTRAINT "watch_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_attempts_dedupe_unique" ON "booking_attempts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_attempts_watch_active_unique" ON "booking_attempts" USING btree ("watch_request_id") WHERE "booking_attempts"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "booking_attempts_watch_request_idx" ON "booking_attempts" USING btree ("watch_request_id");--> statement-breakpoint
CREATE INDEX "booking_attempts_status_idx" ON "booking_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_gmail_dedup_unique" ON "reservation_alert_receipts" USING btree ("gmail_dedup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_logical_alert_unique" ON "reservation_alert_receipts" USING btree ("logical_alert_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_gmail_message_unique" ON "reservation_alert_receipts" USING btree ("gmail_message_id") WHERE "reservation_alert_receipts"."gmail_message_id" is not null;--> statement-breakpoint
CREATE INDEX "reservation_alert_receipts_user_created_idx" ON "reservation_alert_receipts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_connections_user_type_unique" ON "reservation_connections" USING btree ("user_id","connection_type");--> statement-breakpoint
CREATE INDEX "reservation_connections_user_idx" ON "reservation_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservation_connections_status_idx" ON "reservation_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservation_connections_watch_expiry_idx" ON "reservation_connections" USING btree ("watch_expiry_at");--> statement-breakpoint
CREATE INDEX "watch_events_user_created_idx" ON "watch_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "watch_events_watch_request_idx" ON "watch_events" USING btree ("watch_request_id");--> statement-breakpoint
CREATE INDEX "watch_events_event_type_idx" ON "watch_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "watch_requests_user_idx" ON "watch_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watch_requests_status_idx" ON "watch_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "watch_requests_user_status_idx" ON "watch_requests" USING btree ("user_id","status");
