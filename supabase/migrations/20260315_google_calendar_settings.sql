-- ============================================================
-- Story 42.8 — Calendar Selector & Sync Settings
-- Adds selected_calendar_id and auto_meet to user_google_tokens
--
-- Idempotent: uses IF NOT EXISTS guards
-- ============================================================

ALTER TABLE user_google_tokens
  ADD COLUMN IF NOT EXISTS selected_calendar_id TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS auto_meet BOOLEAN DEFAULT true;

COMMENT ON COLUMN user_google_tokens.selected_calendar_id IS 'Google Calendar ID selected by user for creating events (default: primary)';
COMMENT ON COLUMN user_google_tokens.auto_meet IS 'Whether to auto-create Google Meet link when syncing meetings (default: true)';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
