-- ─────────────────────────────────────────────────────────────────────
-- Weekly Reports
--
-- Relatorios semanais por loja (auto-gerados pelo cron). Usados pelo
-- CS pra preparar a call de acompanhamento. Inclui metricas, highlights,
-- concerns, suggestions e (opcional) ai_summary.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  highlights JSONB DEFAULT '[]'::jsonb,
  concerns JSONB DEFAULT '[]'::jsonb,
  suggestions JSONB DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  is_reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_store ON weekly_reports(store_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_org ON weekly_reports(org_id, week_start DESC);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_reports_select" ON weekly_reports;
CREATE POLICY "weekly_reports_select" ON weekly_reports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "weekly_reports_manage" ON weekly_reports;
CREATE POLICY "weekly_reports_manage" ON weekly_reports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );
