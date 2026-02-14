-- Migration: Create Events System
-- Description: Adds events table for event-driven architecture
-- Date: 2024

-- ============================================
-- 1. EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'admin',
  payload JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_entity ON events(entity_type, entity_id);
CREATE INDEX idx_events_actor ON events(actor_id);
CREATE INDEX idx_events_unprocessed ON events(created_at) WHERE processed = FALSE;
CREATE INDEX idx_events_created ON events(created_at DESC);

-- ============================================
-- 2. NOTIFICATIONS TABLE (In-App)
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, error
  link TEXT, -- Optional link to related resource
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read = FALSE;

-- ============================================
-- 3. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Events: Admin/Manager can view all, others can view related
CREATE POLICY "Admins can view all events"
  ON events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can view their own events"
  ON events FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());

-- Events: Only system/admin can insert
CREATE POLICY "Authenticated users can insert events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET read = TRUE, read_at = NOW()
  WHERE id = notification_id
  AND user_id = auth.uid();
END;
$$;

-- Function to mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET read = TRUE, read_at = NOW()
  WHERE user_id = auth.uid()
  AND read = FALSE;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO count_result
  FROM notifications
  WHERE user_id = auth.uid()
  AND read = FALSE;

  RETURN count_result;
END;
$$;

-- ============================================
-- 5. EVENT PROCESSING TRIGGER (Optional)
-- ============================================

-- This function can be extended to process events
-- and create notifications automatically
CREATE OR REPLACE FUNCTION process_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_title TEXT;
  notification_body TEXT;
  target_user_id UUID;
BEGIN
  -- Example: Create notification for deal.won events
  IF NEW.event_type = 'deal.won' THEN
    notification_title := 'Deal Ganho!';
    notification_body := 'Um deal foi marcado como ganho.';

    -- Notify the deal owner (from payload)
    target_user_id := (NEW.payload->>'owner_id')::UUID;

    IF target_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, body, type, event_id, metadata)
      VALUES (target_user_id, notification_title, notification_body, 'success', NEW.id, NEW.payload);
    END IF;
  END IF;

  -- Example: Create notification for payment.overdue
  IF NEW.event_type = 'payment.overdue' THEN
    notification_title := 'Pagamento Atrasado';
    notification_body := 'Um pagamento está atrasado e precisa de atenção.';

    -- Notify financial team (would need to query profiles with role = 'financial')
    -- This is a simplified example
  END IF;

  -- Mark event as processed
  NEW.processed := TRUE;
  NEW.processed_at := NOW();

  RETURN NEW;
END;
$$;

-- Trigger to process events (disabled by default, enable when ready)
-- CREATE TRIGGER trigger_process_event
--   BEFORE INSERT ON events
--   FOR EACH ROW
--   EXECUTE FUNCTION process_event();

-- ============================================
-- 6. ADD ACCOUNT_TYPE TO PROFILES (if not exists)
-- ============================================

DO $$
BEGIN
  -- Add account_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'account_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN account_type TEXT DEFAULT 'admin';
  END IF;

  -- Add permissions column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE profiles ADD COLUMN permissions JSONB DEFAULT '{}';
  END IF;
END $$;
