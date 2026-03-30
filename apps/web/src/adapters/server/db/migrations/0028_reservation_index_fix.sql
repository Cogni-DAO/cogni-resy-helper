DROP INDEX "reservation_alert_receipts_gmail_dedup_unique";--> statement-breakpoint
DROP INDEX "reservation_alert_receipts_logical_alert_unique";--> statement-breakpoint
DROP INDEX "reservation_alert_receipts_gmail_message_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_gmail_dedup_unique" ON "reservation_alert_receipts" USING btree ("user_id","gmail_dedup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_logical_alert_unique" ON "reservation_alert_receipts" USING btree ("user_id","logical_alert_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_alert_receipts_gmail_message_unique" ON "reservation_alert_receipts" USING btree ("user_id","gmail_message_id") WHERE "reservation_alert_receipts"."gmail_message_id" is not null;