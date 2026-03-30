-- Steel browser session lease support (task.0225)
-- Adds session_lease_until for concurrency control on Steel sessions.
-- NULL = no active session. Non-NULL = session held until this timestamp.
ALTER TABLE "reservation_connections"
ADD COLUMN "session_lease_until" timestamp with time zone;
