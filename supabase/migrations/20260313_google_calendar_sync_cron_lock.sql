-- Story 42.12: Insert cron_locks row for google_calendar_sync
-- Required for acquire_sync_lock RPC to find the lock row

INSERT INTO cron_locks (lock_name, is_running, started_at)
VALUES ('google_calendar_sync', false, now())
ON CONFLICT (lock_name) DO NOTHING;
