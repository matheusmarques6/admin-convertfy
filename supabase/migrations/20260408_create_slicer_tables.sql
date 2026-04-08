-- ============================================================================
-- Figma Email Slicer — export logs
-- Tracks every ZIP export performed by the auto-slicer tool so we can audit
-- usage and (optionally) compute analytics about how the team is leveraging it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS slicer_export_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  original_width INTEGER NOT NULL,
  original_height INTEGER NOT NULL,
  slices_count INTEGER NOT NULL DEFAULT 0,
  slice_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_method TEXT NOT NULL DEFAULT 'claude_vision',
  analysis_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slicer_logs_created
  ON slicer_export_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slicer_logs_user
  ON slicer_export_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_slicer_logs_client
  ON slicer_export_logs(client_id);

ALTER TABLE slicer_export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view slicer logs"
  ON slicer_export_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert slicer logs"
  ON slicer_export_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
