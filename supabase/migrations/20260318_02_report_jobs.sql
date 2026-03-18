-- Migration: report_jobs table for background report generation (RG-4/RG-5)
-- Tracks job lifecycle: queued → processing → completed | partial | failed | paused | cancelled | expired

-- ==============================
-- Table
-- ==============================

CREATE TABLE report_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  store_ids UUID[] NOT NULL,
  period TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'partial', 'failed', 'paused', 'cancelled', 'expired')),
  progress JSONB DEFAULT '{}'::jsonb,
  result JSONB,
  viewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days'
);

-- ==============================
-- updated_at trigger
-- ==============================

CREATE OR REPLACE FUNCTION update_report_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_jobs_updated_at
  BEFORE UPDATE ON report_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_report_jobs_updated_at();

-- ==============================
-- Indexes
-- ==============================

-- Org history + notifications
CREATE INDEX idx_report_jobs_org_created ON report_jobs (org_id, created_at DESC);

-- Processor: pick next job
CREATE INDEX idx_report_jobs_status_created ON report_jobs (status, created_at ASC)
  WHERE status IN ('queued', 'processing');

-- Deduplication: active jobs for same range
-- Uses COALESCE to handle NULLs (NULL != NULL in unique indexes)
CREATE UNIQUE INDEX uq_report_jobs_active_range
  ON report_jobs (org_id, period, COALESCE(start_date, '1970-01-01'::date), COALESCE(end_date, '1970-01-01'::date))
  WHERE status IN ('queued', 'processing', 'paused');

-- Cleanup
CREATE INDEX idx_report_jobs_expires ON report_jobs (expires_at)
  WHERE expires_at IS NOT NULL;

-- ==============================
-- RLS
-- ==============================

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;

-- Users can read jobs from their org
CREATE POLICY report_jobs_select_policy ON report_jobs
  FOR SELECT TO authenticated
  USING (org_id = current_org_id());

-- Users can create jobs in their org
CREATE POLICY report_jobs_insert_policy ON report_jobs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = current_org_id());

-- Users can update jobs in their org (status, progress, result)
CREATE POLICY report_jobs_update_policy ON report_jobs
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Service role has full access (for the processor endpoint)
CREATE POLICY report_jobs_service_role_policy ON report_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ==============================
-- JSONB schema documentation
-- ==============================

COMMENT ON COLUMN report_jobs.progress IS 'Schema: { [store_id]: { status: "pending"|"processing"|"completed"|"failed", completed_at?: string, error?: string }, invocation_count?: number, paused_reason?: string, paused_at?: string, failure_reason?: string }';
COMMENT ON COLUMN report_jobs.result IS 'Schema: { total_revenue: number, attributed_revenue: number, stores_processed: number, stores_failed: number, per_store: { [store_id]: { revenue, campaign_revenue, flow_revenue, currency, error? } }, generated_at: string }';

-- ==============================
-- RPC: atomic JSONB progress merge (RG-5)
-- ==============================

CREATE OR REPLACE FUNCTION update_job_progress(
  p_job_id UUID,
  p_progress JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE report_jobs
  SET progress = progress || p_progress
  WHERE id = p_job_id;
END;
$$;

COMMENT ON FUNCTION update_job_progress IS 'Atomic JSONB merge for report job progress. Uses || operator to merge partial progress without overwriting existing keys.';

-- H2: Restrict SECURITY DEFINER RPC to service_role only
REVOKE EXECUTE ON FUNCTION update_job_progress FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_job_progress FROM authenticated;
GRANT EXECUTE ON FUNCTION update_job_progress TO service_role;
