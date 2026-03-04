-- Email logs table for tracking all emails sent via Resend
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'custom',
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  sent_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX idx_email_logs_template_type ON email_logs(template_type);

-- RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Admin and manager can view all email logs
CREATE POLICY "email_logs_select_admin" ON email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Service role can insert (used by email service)
CREATE POLICY "email_logs_insert_service" ON email_logs
  FOR INSERT
  WITH CHECK (true);
